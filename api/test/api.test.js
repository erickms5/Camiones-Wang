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
const codigos = new Map();
const correo = { enviarCodigo: async (email, codigo) => codigos.set(email, codigo) };
const hoy = new Date().toISOString().slice(0, 10);
const t = {};

async function entrar(email) {
  await request(app).post('/auth/codigo').send({ email }).expect(200);
  const r = await request(app).post('/auth/verificar').send({ email, codigo: codigos.get(email) }).expect(200);
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
  app = crearApp({ db: conexion.db, config, seguridad: crearSeguridad(config), correo, almacen: crearAlmacenMemoria() });
});
after(() => cerrar?.());

test('el dueño se registra y entra con el código de su email', async () => {
  await request(app).post('/auth/registro').send({ email: 'Dueno@Ejemplo.com', nombre: 'Carlos Wang', nombreCuenta: 'Transportes Wang' }).expect(201);
  assert.match(codigos.get('dueno@ejemplo.com'), /^\d{6}$/);
  await request(app).post('/auth/verificar').send({ email: 'dueno@ejemplo.com', codigo: '000000' === codigos.get('dueno@ejemplo.com') ? '111111' : '000000' }).expect(401);
  const r = await request(app).post('/auth/verificar').send({ email: 'dueno@ejemplo.com', codigo: codigos.get('dueno@ejemplo.com') }).expect(200);
  assert.equal(r.body.usuario.rol, 'dueno');
  t.dueno = como(r.body.token);
  // un código no se puede usar dos veces
  await request(app).post('/auth/verificar').send({ email: 'dueno@ejemplo.com', codigo: codigos.get('dueno@ejemplo.com') }).expect(401);
});

test('pedir código no revela si el correo existe y sin sesión no hay acceso', async () => {
  const r = await request(app).post('/auth/codigo').send({ email: 'nadie@ejemplo.com' }).expect(200);
  assert.ok(r.body.ok);
  assert.equal(codigos.has('nadie@ejemplo.com'), false);
  await request(app).get('/unidades').expect(401);
});

test('el dueño registra a su chofer con cédula validada y cifrada', async () => {
  const mala = await t.dueno.post('/choferes', { nombre: 'Manuel Benítez', email: 'chofer@ejemplo.com', cedula: '1710034064', consentimiento: true }).expect(400);
  assert.match(mala.body.detalles[0].mensaje, /último número/);
  const r = await t.dueno.post('/choferes', { nombre: 'Manuel Benítez', email: 'chofer@ejemplo.com', cedula: '1710034065', telefono: '0991234567', consentimiento: true }).expect(201);
  assert.equal(r.body.chofer.cedula, '17******65');
  t.choferId = r.body.chofer.id;
  await t.dueno.post('/choferes', { nombre: 'Otro Chofer', email: 'otro@ejemplo.com', cedula: '1710034065', consentimiento: true }).expect(409);
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
  t.chofer = como(await entrar('chofer@ejemplo.com'));
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
  await request(app).post('/auth/registro').send({ email: 'otro.dueno@ejemplo.com', nombre: 'Otra Persona' }).expect(201);
  const otro = como((await request(app).post('/auth/verificar').send({ email: 'otro.dueno@ejemplo.com', codigo: codigos.get('otro.dueno@ejemplo.com') })).body.token);
  await otro.get(`/unidades/${t.cabezal}`).expect(404);
  await otro.get(`/mantenimientos/${t.mant}`).expect(404);
  assert.equal((await otro.get('/reportes').expect(200)).body.reportes.length, 0);
});

test('un código se bloquea tras 5 intentos fallidos, aunque lleguen en paralelo', async () => {
  const email = 'chofer@ejemplo.com';
  await request(app).post('/auth/codigo').send({ email }).expect(200);
  const bueno = codigos.get(email);
  const malo = bueno === '123456' ? '654321' : '123456';
  await Promise.all(Array.from({ length: 8 }, () => request(app).post('/auth/verificar').send({ email, codigo: malo })));
  await request(app).post('/auth/verificar').send({ email, codigo: bueno }).expect(401);
});

test('un código nuevo anula el anterior', async () => {
  const email = 'chofer@ejemplo.com';
  await request(app).post('/auth/codigo').send({ email }).expect(200);
  const viejo = codigos.get(email);
  await request(app).post('/auth/codigo').send({ email }).expect(200);
  const nuevo = codigos.get(email);
  if (viejo !== nuevo) await request(app).post('/auth/verificar').send({ email, codigo: viejo }).expect(401);
  await request(app).post('/auth/verificar').send({ email, codigo: nuevo }).expect(200);
});

test('el límite de códigos responde igual exista o no la cuenta', async () => {
  const pedir = async (email) => {
    const r = [];
    for (let i = 0; i < 7; i++) r.push((await request(app).post('/auth/codigo').send({ email })).status);
    return r;
  };
  const sinCuenta = await pedir('fantasma@ejemplo.com');
  await request(app).post('/auth/registro').send({ email: 'limite@ejemplo.com', nombre: 'Prueba Límite' }).expect(201);
  const conCuenta = await pedir('limite@ejemplo.com');
  assert.deepEqual(sinCuenta.slice(-2), [429, 429]);
  assert.deepEqual(conCuenta.slice(-2), [429, 429]);
});
