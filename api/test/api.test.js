// Pruebas de la API completa sobre PostgreSQL en memoria (PGlite): no requieren servidor de base de datos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { conectarMemoria } from '../src/db/conexion.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import { crearSeguridad } from '../src/seguridad.js';
import { crearAlmacenMemoria } from '../src/almacen.js';

let app, cerrar;
const hoy = new Date().toISOString().slice(0, 10);
const t = {};

async function entrar(email, clave) {
  const r = await request(app).post('/auth/entrar').send({ email, clave }).expect(200);
  return r.body.token;
}
const como = (token) => ({
  get: (u) => request(app).get(u).set('Authorization', `Bearer ${token}`),
  post: (u, b) => request(app).post(u).set('Authorization', `Bearer ${token}`).send(b),
  patch: (u, b) => request(app).patch(u).set('Authorization', `Bearer ${token}`).send(b),
  put: (u) => request(app).put(u).set('Authorization', `Bearer ${token}`),
});

before(async () => {
  const conexion = await conectarMemoria();
  cerrar = conexion.cerrar;
  const config = leerConfig({ NODE_ENV: 'test' });
  app = crearApp({ db: conexion.db, config, seguridad: crearSeguridad(config), almacen: crearAlmacenMemoria() });
});
after(() => cerrar?.());

test('el dueño crea su cuenta con contraseña y entra', async () => {
  await request(app).post('/auth/registro').send({ email: 'Dueno@Ejemplo.com', nombre: 'Carlos Wang', nombreCuenta: 'Transportes Wang', clave: '123' }).expect(400);
  const r = await request(app).post('/auth/registro').send({ email: 'Dueno@Ejemplo.com', nombre: 'Carlos Wang', nombreCuenta: 'Transportes Wang', clave: 'camion2026' }).expect(201);
  assert.equal(r.body.usuario.rol, 'dueno');
  await request(app).post('/auth/registro').send({ email: 'dueno@ejemplo.com', nombre: 'Otro', clave: 'camion2026' }).expect(409);
  t.dueno = como(await entrar('dueno@ejemplo.com', 'camion2026'));
});

test('contraseña incorrecta o correo inexistente dan el mismo mensaje y sin sesión no hay acceso', async () => {
  const a = await request(app).post('/auth/entrar').send({ email: 'dueno@ejemplo.com', clave: 'otra-clave' }).expect(401);
  const b = await request(app).post('/auth/entrar').send({ email: 'nadie@ejemplo.com', clave: 'otra-clave' }).expect(401);
  assert.equal(a.body.error, b.body.error);
  await request(app).get('/unidades').expect(401);
});

test('el dueño registra a su chofer con cédula validada y cifrada', async () => {
  const mala = await t.dueno.post('/choferes', { nombre: 'Manuel Benítez', email: 'chofer@ejemplo.com', cedula: '1710034064', clave: 'chofer123', consentimiento: true }).expect(400);
  assert.match(mala.body.detalles[0].mensaje, /último número/);
  const r = await t.dueno.post('/choferes', { nombre: 'Manuel Benítez', email: 'chofer@ejemplo.com', cedula: '1710034065', telefono: '0991234567', clave: 'chofer123', consentimiento: true }).expect(201);
  assert.equal(r.body.chofer.cedula, '17******65');
  t.choferId = r.body.chofer.id;
  await t.dueno.post('/choferes', { nombre: 'Otro Chofer', email: 'otro@ejemplo.com', cedula: '1710034065', clave: 'chofer123', consentimiento: true }).expect(409);
});

test('el dueño registra el cabezal con sus ejes, llantas, frenos e intervalos del catálogo', async () => {
  const r = await t.dueno.post('/unidades', {
    rol: 'cabezal', tipo: 'tracto', placa: 'abc1234', marca: 'Freightliner', modelo: 'Columbia', anio: 2020, numEjes: 3, numLlantas: 10, kmInicial: 184520,
  }).expect(201);
  assert.equal(r.body.unidad.placa, 'ABC-1234');
  t.cabezal = r.body.unidad.id;
  const det = await t.dueno.get(`/unidades/${t.cabezal}`).expect(200);
  const cuenta = (tipo) => det.body.componentes.filter((c) => c.tipo === tipo).length;
  assert.equal(cuenta('eje'), 3);
  assert.equal(cuenta('llanta'), 10); // 2 adelante + 4 + 4
  assert.equal(cuenta('freno'), 6);
  assert.equal(det.body.km, 184520);
  assert.equal(det.body.intervalos[0].origen, 'freightliner-columbia-2020');
  t.llanta = det.body.componentes.find((c) => c.tipo === 'llanta' && c.posicion === 'izq-ext').id;
  await t.dueno.post('/unidades', { rol: 'cabezal', tipo: 'tracto', placa: 'ABC-1234', marca: 'Kenworth', modelo: 'T800', numEjes: 3, numLlantas: 10, kmInicial: 1 }).expect(409);
});

test('el tanquero suma sus compartimentos y se engancha y asigna al chofer', async () => {
  const r = await t.dueno.post('/unidades', {
    rol: 'remolque', tipo: 'tanquero', placa: 'XYZ-123', marca: 'Heil', modelo: 'DOT 406', numEjes: 3, numLlantas: 12, compartimentos: [3000, 2000, 2000, 3000],
  }).expect(201);
  assert.equal(r.body.unidad.atributos.capacidad_galones, 10000);
  t.tanque = r.body.unidad.id;
  await t.dueno.post('/unidades', { rol: 'remolque', tipo: 'tanquero', placa: 'XYZ-124', marca: 'Heil', modelo: 'X', numEjes: 3, numLlantas: 12, compartimentos: [3000, 0] }).expect(400);
  await t.dueno.post(`/unidades/${t.cabezal}/acoplar`, { remolqueId: t.tanque }).expect(201);
  await t.dueno.post(`/unidades/${t.cabezal}/asignar`, { choferId: t.choferId }).expect(201);
  await t.dueno.post(`/unidades/${t.tanque}/asignar`, { choferId: t.choferId }).expect(201);
});

test('el chofer entra con su email y ve solo sus unidades', async () => {
  t.chofer = como(await entrar('chofer@ejemplo.com', 'chofer123'));
  const r = await t.chofer.get('/unidades').expect(200);
  assert.deepEqual(r.body.unidades.map((u) => u.placa).sort(), ['ABC-1234', 'XYZ-123']);
  await t.chofer.get('/choferes').expect(403);
});

test('el chofer llena la ficha de una llanta', async () => {
  const r = await t.chofer.patch(`/unidades/componentes/${t.llanta}`, { detalles: { marca: 'Michelin', medida: '295/80R22.5', estado: 'Buena' } }).expect(200);
  assert.equal(r.body.componente.detalles.marca, 'Michelin');
  const r2 = await t.chofer.patch(`/unidades/componentes/${t.llanta}`, { detalles: { labrado: 12 } }).expect(200);
  assert.equal(r2.body.componente.detalles.medida, '295/80R22.5');
});

test('mantenimiento sin duplicados al reintentar y factura con fecha, hora y huella', async () => {
  const id = crypto.randomUUID();
  const datos = { id, unidadId: t.tanque, fecha: hoy, km: 185000, parte: 'Frenos - Eje 2 Remolque', trabajo: 'Calibración y Cambio de Frenos', taller: 'Taller Loja', costoTaller: 70, costoRepuestos: 110.5 };
  await t.chofer.post('/mantenimientos', datos).expect(201);
  const rep = await t.chofer.post('/mantenimientos', datos).expect(200);
  assert.equal(rep.body.repetido, true);
  await t.chofer.post('/mantenimientos', { ...datos, id: undefined, fecha: '2999-01-01' }).expect(400);
  t.mant = id;

  const ev = await t.chofer.post(`/mantenimientos/${id}/evidencias`, { categoria: 'Factura de Taller', nombreArchivo: 'factura.png', mime: 'image/png' }).expect(201);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const sub = await t.chofer.put(ev.body.subirA).set('Content-Type', 'image/png').send(png).expect(200);
  assert.ok(sub.body.evidencia.subidoEn);
  assert.equal(sub.body.evidencia.sha256.length, 64);
  await t.chofer.put(ev.body.subirA).set('Content-Type', 'image/png').send(png).expect(409);
  const archivo = await t.dueno.get(ev.body.subirA).expect(200);
  assert.equal(archivo.headers['content-type'], 'image/png');
});

test('el chofer genera su reporte mensual y el dueño lo ve íntegro', async () => {
  const r = await t.chofer.post('/reportes', { tipo: 'mensual', periodo: hoy.slice(0, 7) }).expect(201);
  assert.match(r.body.reporte.folio, /^REP-\d{4}-001$/);
  assert.equal(r.body.reporte.total, '180.50');
  assert.equal(r.body.reporte.datos.mantenimientos[0].evidencias[0].nombreArchivo, 'factura.png');
  // ya incluido: no se repite en otro reporte mensual y lo nuevo entra como anexo
  await t.chofer.post('/reportes', { tipo: 'mensual', periodo: hoy.slice(0, 7) }).expect(400);
  const anexo = await t.chofer.post(`/mantenimientos/${t.mant}/evidencias`, { categoria: 'Factura de Repuestos', nombreArchivo: 'rep.pdf', mime: 'application/pdf' }).expect(201);
  assert.equal(anexo.body.evidencia.anexoPosterior, true);

  const lista = await t.dueno.get(`/reportes?chofer=${t.choferId}`).expect(200);
  assert.equal(lista.body.reportes.length, 1);
  assert.equal(lista.body.reportes[0].chofer, 'Manuel Benítez');
  const uno = await t.dueno.get(`/reportes/${r.body.reporte.folio}`).expect(200);
  assert.equal(uno.body.integro, true);
  assert.equal(uno.body.reporte.datos.chofer.cedula, '17******65');
});

test('otra cuenta no puede ver datos ajenos', async () => {
  const reg = await request(app).post('/auth/registro').send({ email: 'otro.dueno@ejemplo.com', nombre: 'Otra Persona', clave: 'otraclave1' }).expect(201);
  const otro = como(reg.body.token);
  await otro.get(`/unidades/${t.cabezal}`).expect(404);
  await otro.get(`/mantenimientos/${t.mant}`).expect(404);
  assert.equal((await otro.get('/reportes').expect(200)).body.reportes.length, 0);
});

test('el km parte del registro y solo sube con los mantenimientos (no se edita a mano)', async () => {
  const kmDe = async () => (await t.dueno.get(`/unidades/${t.cabezal}`).expect(200)).body.km;
  assert.equal(await kmDe(), 185000); // subió con el mantenimiento del remolque enganchado (184.520 → 185.000)
  await t.dueno.post(`/unidades/${t.cabezal}/odometro`, { km: 1 }).expect(404);
  const base = { unidadId: t.cabezal, fecha: hoy, parte: 'Motor Detroit', trabajo: 'Cambio de Aceite y Filtros' };
  await t.chofer.post('/mantenimientos', { ...base, km: 190000 }).expect(201);
  assert.equal(await kmDe(), 190000);
  await t.chofer.post('/mantenimientos', { ...base, km: 150000 }).expect(201); // trabajo atrasado: no baja el km
  assert.equal(await kmDe(), 190000);
});

test('un km imposible (error de tipeo) se rechaza y no daña el odómetro', async () => {
  const base = { unidadId: t.cabezal, fecha: hoy, parte: 'Motor Detroit', trabajo: 'Cambio de Aceite y Filtros' };
  const r = await t.chofer.post('/mantenimientos', { ...base, km: 1_900_000 }).expect(400);
  assert.match(r.body.error, /Revisa que esté bien escrito/);
  assert.equal((await t.dueno.get(`/unidades/${t.cabezal}`).expect(200)).body.km, 190000);
});

test('el dueño pone una contraseña nueva al chofer que la olvidó y se cierran sus sesiones', async () => {
  await t.dueno.patch(`/choferes/${t.choferId}`, { clave: 'nueva456' }).expect(200);
  await t.chofer.get('/unidades').expect(401); // la sesión anterior quedó cerrada
  await request(app).post('/auth/entrar').send({ email: 'chofer@ejemplo.com', clave: 'chofer123' }).expect(401);
  t.chofer = como(await entrar('chofer@ejemplo.com', 'nueva456'));
  await t.chofer.get('/unidades').expect(200);
  // y el chofer puede cambiarla él mismo
  await t.chofer.post('/auth/clave', { actual: 'nueva456', nueva: 'mia789' }).expect(200);
  await entrar('chofer@ejemplo.com', 'mia789');
});

test('tras varios intentos fallidos la cuenta se pausa aunque cambie la IP, y el dueño la libera', async () => {
  for (let i = 0; i < 8; i++) {
    await request(app).post('/auth/entrar').set('X-Forwarded-For', `10.0.0.${i}`).send({ email: 'chofer@ejemplo.com', clave: 'equivocada' }).expect(401);
  }
  const r = await request(app).post('/auth/entrar').send({ email: 'chofer@ejemplo.com', clave: 'mia789' }).expect(429);
  assert.match(r.body.error, /Espera/);
  await t.dueno.patch(`/choferes/${t.choferId}`, { clave: 'liberada1' }).expect(200);
  await entrar('chofer@ejemplo.com', 'liberada1');
});

test('al cambiar su contraseña se cierran sus otras sesiones', async () => {
  const s1 = como(await entrar('chofer@ejemplo.com', 'liberada1'));
  const s2 = como(await entrar('chofer@ejemplo.com', 'liberada1'));
  await s1.post('/auth/clave', { actual: 'liberada1', nueva: 'otra2026' }).expect(200);
  await s1.get('/unidades').expect(200);
  await s2.get('/unidades').expect(401);
});
