// Pruebas de la API completa sobre PostgreSQL en memoria (PGlite): no requieren servidor de base de datos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { conectarMemoria } from '../src/db/conexion.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import { crearSeguridad } from '../src/seguridad.js';
import { crearAlmacenBD } from '../src/almacen.js';
import { asegurarAdmin } from '../src/administrador.js';
import { asegurarFlotaInicial } from '../src/flota-inicial.js';

let app, cerrar, db;
import { hoyEcuador } from '../../public/js/viajes-logica.js';

const hoy = hoyEcuador(); // el servidor trabaja con la fecha de Ecuador (UTC-5)
const t = {};
const ADMIN = { adminEmail: 'admin@ejemplo.com', adminClave: 'administrador-2026', adminNombre: 'Soporte' };

async function entrar(email, clave) {
  const r = await request(app).post('/auth/entrar').send({ email, clave }).expect(200);
  return r.body.token;
}
const como = (token) => ({
  get: (u) => request(app).get(u).set('Authorization', `Bearer ${token}`),
  post: (u, b) => request(app).post(u).set('Authorization', `Bearer ${token}`).send(b),
  patch: (u, b) => request(app).patch(u).set('Authorization', `Bearer ${token}`).send(b),
  put: (u, b) => request(app).put(u).set('Authorization', `Bearer ${token}`).send(b),
});
const placas = (r) => r.body.vehiculos.map((v) => v.placa).sort();

before(async () => {
  const conexion = await conectarMemoria();
  cerrar = conexion.cerrar;
  db = conexion.db;
  const config = leerConfig({ NODE_ENV: 'test' });
  app = crearApp({ db, config, seguridad: crearSeguridad(config), almacen: crearAlmacenBD(db) });
});
after(() => cerrar?.());

test('nadie crea su propia cuenta: el administrador sale de la configuración del servidor', async () => {
  await request(app).post('/auth/registro').send({ email: 'dueno@ejemplo.com', nombre: 'Carlos Wang', clave: 'camion2026' }).expect(401); // ya no existe el registro público
  assert.equal(await asegurarAdmin(db, { adminEmail: '', adminClave: '' }), null);
  await assert.rejects(() => asegurarAdmin(db, { ...ADMIN, adminClave: 'corta' }), /al menos 10/);
  await asegurarAdmin(db, ADMIN);
  await asegurarAdmin(db, { ...ADMIN, adminClave: 'otra-clave-distinta' }); // no pisa la contraseña en cada arranque
  t.admin = como(await entrar('admin@ejemplo.com', 'administrador-2026'));
  assert.equal((await t.admin.get('/auth/yo').expect(200)).body.usuario.rol, 'admin');
});

test('la flota del cliente queda registrada sola, con el km pendiente, y no se repite', async () => {
  const cuenta = await asegurarFlotaInicial(db, {}, null);
  assert.equal(await asegurarFlotaInicial(db, {}, null), null); // ya hay empresa: no duplica
  const det = await t.admin.get(`/admin/cuentas/${cuenta.id}`).expect(200);
  assert.deepEqual(det.body.vehiculos.map((v) => [v.placa, v.marca, v.modelo, v.anio, v.km]), [
    ['LBA-2603', 'Hino', 'GH', 2010, null], ['LBA-5785', 'Chevrolet', 'FVR', 2011, null], ['ZAA-2010', 'Freightliner', 'Columbia', 2020, 300630],
  ]);
  assert.equal(det.body.duenos.length, 0); // sin cuentas de ejemplo: las crea el administrador
  assert.equal(det.body.vehiculos[2].tanquero.placa, null);
});

test('el administrador crea la empresa con su dueño y luego un segundo dueño', async () => {
  await t.admin.post('/admin/cuentas', { nombre: 'Transportes Wang', dueno: { nombre: 'Carlos Wang', email: 'Dueno@Ejemplo.com', clave: '123' } }).expect(400);
  const r = await t.admin.post('/admin/cuentas', { nombre: 'Transportes Wang', dueno: { nombre: 'Carlos Wang', email: 'Dueno@Ejemplo.com', clave: 'camion2026' } }).expect(201);
  t.cuenta = r.body.cuenta.id;
  await t.admin.post('/admin/cuentas', { nombre: 'Otra', dueno: { nombre: 'Otro Dueño', email: 'dueno@ejemplo.com', clave: 'camion2026' } }).expect(409);
  const socio = await t.admin.post(`/admin/cuentas/${t.cuenta}/duenos`, { nombre: 'Lucía Socia', email: 'socia@ejemplo.com', clave: 'socia2026' }).expect(201);
  t.socioId = socio.body.dueno.id;
  t.dueno = como(await entrar('dueno@ejemplo.com', 'camion2026'));
  t.socio = como(await entrar('socia@ejemplo.com', 'socia2026'));
  t.duenoId = (await t.dueno.get('/auth/yo')).body.usuario.id;
});

test('contraseña incorrecta o correo inexistente dan el mismo mensaje y sin sesión no hay acceso', async () => {
  const a = await request(app).post('/auth/entrar').send({ email: 'dueno@ejemplo.com', clave: 'otra-clave' }).expect(401);
  const b = await request(app).post('/auth/entrar').send({ email: 'nadie@ejemplo.com', clave: 'otra-clave' }).expect(401);
  assert.equal(a.body.error, b.body.error);
  await request(app).get('/unidades').expect(401);
});

test('cada rol en su lugar: el dueño no entra a administración ni el administrador a los datos de la empresa', async () => {
  await t.dueno.get('/admin/cuentas').expect(403);
  await t.dueno.post('/admin/cuentas', { nombre: 'Mía', dueno: { nombre: 'Yo Mismo', email: 'yo@ejemplo.com', clave: 'camion2026' } }).expect(403);
  await t.admin.get('/flota').expect(403);
  await t.admin.get('/mantenimientos').expect(403);
  await t.admin.get('/reportes').expect(403);
});

test('el administrador registra los tres vehículos de la flota desde el catálogo', async () => {
  await t.admin.post(`/admin/cuentas/${t.cuenta}/vehiculos`, { modeloId: 'kenworth-t800', placa: 'ABC-1234' }).expect(400);
  // Cabezal con tanquero: dos dueños; el km queda pendiente y el tanquero no lleva placa propia
  const fr = await t.admin.post(`/admin/cuentas/${t.cuenta}/vehiculos`, { modeloId: 'freightliner-columbia-2020', placa: 'abc1234', motor: 'Cummins ISX 500', duenos: [t.duenoId, t.socioId] }).expect(201);
  assert.equal(fr.body.vehiculo.placa, 'ABC-1234');
  t.cabezal = fr.body.vehiculo.id;
  const hino = await t.admin.post(`/admin/cuentas/${t.cuenta}/vehiculos`, { modeloId: 'hino-gh-2010', placa: 'HIN-0010', kmInicial: 320000, duenos: [t.duenoId] }).expect(201);
  t.hino = hino.body.vehiculo.id;
  await t.admin.post(`/admin/cuentas/${t.cuenta}/vehiculos`, { modeloId: 'chevrolet-fvr-2011', placa: 'CHE-0011', duenos: [t.duenoId] }).expect(201);
  await t.admin.post(`/admin/cuentas/${t.cuenta}/vehiculos`, { modeloId: 'hino-gh-2010', placa: 'ABC-1234' }).expect(409);

  const det = await t.admin.get(`/admin/cuentas/${t.cuenta}`).expect(200);
  const por = Object.fromEntries(det.body.vehiculos.map((v) => [v.placa, v]));
  assert.deepEqual(por['ABC-1234'].compartimentos, [3000, 2000, 2000, 3000]);
  assert.deepEqual(por['HIN-0010'].compartimentos, [1000, 2000, 1000]);
  assert.deepEqual(por['CHE-0011'].compartimentos, [1000, 1000, 1000, 1000]);
  assert.equal(por['ABC-1234'].numLlantas, 10); // 2 adelante + 4 + 4
  assert.equal(por['ABC-1234'].tanquero.numLlantas, 12);
  assert.equal(por['ABC-1234'].tanquero.placa, null);
  assert.equal(por['HIN-0010'].numLlantas, 6);
  assert.equal(por['HIN-0010'].tanquero, null);
  assert.equal(por['HIN-0010'].km, 320000);
  assert.equal(por['ABC-1234'].km, null);
  assert.equal(por['ABC-1234'].duenos.length, 2);
  t.tanque = por['ABC-1234'].tanquero.id;
});

test('cada dueño ve solo sus vehículos: la socia ve el Freightliner y no los camiones de 4.000', async () => {
  assert.deepEqual(placas(await t.dueno.get('/flota').expect(200)), ['ABC-1234', 'CHE-0011', 'HIN-0010']);
  assert.deepEqual(placas(await t.socio.get('/flota').expect(200)), ['ABC-1234']);
  await t.socio.get(`/unidades/${t.hino}`).expect(404);
  await t.socio.get(`/unidades/${t.tanque}`).expect(200); // el tanquero va con su cabezal
  await t.socio.post(`/unidades/${t.hino}/km`, { km: 1, motivo: 'no es mío' }).expect(404);
});

test('el árbol de partes: ejes, llantas y frenos del cabezal y del camión; el tanque con sus compartimentos', async () => {
  const det = await t.dueno.get(`/unidades/${t.cabezal}`).expect(200);
  const cuenta = (lista, tipo) => lista.filter((c) => c.tipo === tipo).length;
  assert.equal(cuenta(det.body.componentes, 'eje'), 3);
  assert.equal(cuenta(det.body.componentes, 'llanta'), 10);
  assert.equal(cuenta(det.body.componentes, 'freno'), 6);
  assert.equal(cuenta(det.body.componentes, 'compartimento'), 0); // están en el tanquero
  assert.equal(det.body.acople.remolqueId, t.tanque);
  assert.equal(det.body.intervalos[0].origen, 'freightliner-columbia-2020');
  t.llanta = det.body.componentes.find((c) => c.tipo === 'llanta' && c.posicion === 'izq-ext').id;
  const hino = await t.dueno.get(`/unidades/${t.hino}`).expect(200);
  assert.equal(cuenta(hino.body.componentes, 'eje'), 2);
  assert.equal(cuenta(hino.body.componentes, 'llanta'), 6);
  assert.equal(cuenta(hino.body.componentes, 'compartimento'), 3);
  assert.equal(cuenta(hino.body.componentes, 'quinta'), 0);
});

test('el dueño registra a su chofer con cédula validada y cifrada', async () => {
  const mala = await t.dueno.post('/choferes', { nombre: 'Manuel Benítez', email: 'chofer@ejemplo.com', cedula: '1710034064', clave: 'chofer123', consentimiento: true }).expect(400);
  assert.match(mala.body.detalles[0].mensaje, /último número/);
  const r = await t.dueno.post('/choferes', { nombre: 'Manuel Benítez', email: 'chofer@ejemplo.com', cedula: '1710034065', telefono: '0991234567', clave: 'chofer123', consentimiento: true }).expect(201);
  assert.equal(r.body.chofer.cedula, '17******65');
  t.choferId = r.body.chofer.id;
  await t.dueno.post('/choferes', { nombre: 'Otro Chofer', email: 'otro@ejemplo.com', cedula: '1710034065', clave: 'chofer123', consentimiento: true }).expect(409);
});

test('el dueño pone el km pendiente, asigna el chofer y el chofer ve su cabezal con el tanquero', async () => {
  await t.dueno.post(`/unidades/${t.cabezal}/km`, { km: 184520 }).expect(400); // falta el motivo
  await t.dueno.post(`/unidades/${t.cabezal}/km`, { km: 184520, motivo: 'Lectura del tablero' }).expect(201);
  await t.dueno.post(`/unidades/${t.tanque}/asignar`, { choferId: t.choferId }).expect(400); // el tanquero va con el cabezal
  await t.dueno.post(`/unidades/${t.cabezal}/asignar`, { choferId: t.choferId }).expect(201);
  t.chofer = como(await entrar('chofer@ejemplo.com', 'chofer123'));
  const r = await t.chofer.get('/unidades').expect(200);
  assert.deepEqual(r.body.unidades.map((u) => u.tipo).sort(), ['tanquero', 'tracto']);
  await t.chofer.get('/choferes').expect(403);
  await t.chofer.get('/flota').expect(403);
  await t.chofer.post('/vehiculos', { modeloId: 'hino-gh-2010', placa: 'ZZZ-0001' }).expect(403);
  const flota = await t.dueno.get('/flota');
  assert.equal(flota.body.vehiculos.find((v) => v.id === t.cabezal).chofer.nombre, 'Manuel Benítez');
});

test('el chofer llena la ficha de una llanta', async () => {
  const r = await t.chofer.patch(`/unidades/componentes/${t.llanta}`, { detalles: { marca: 'Michelin', medida: '295/80R22.5', estado: 'Buena' } }).expect(200);
  assert.equal(r.body.componente.detalles.marca, 'Michelin');
  const r2 = await t.chofer.patch(`/unidades/componentes/${t.llanta}`, { detalles: { labrado: 12 } }).expect(200);
  assert.equal(r2.body.componente.detalles.medida, '295/80R22.5');
});

test('mantenimiento sin duplicados al reintentar y factura con fecha, hora y huella', async () => {
  const id = crypto.randomUUID();
  const datos = { id, unidadId: t.tanque, fecha: hoy, km: 185000, parte: 'Frenos - Eje 2 Remolque', trabajo: 'Cambio de zapatas', taller: 'Taller Loja', costoTaller: 70, costoRepuestos: 110.5 };
  const creado = await t.chofer.post('/mantenimientos', datos).expect(201);
  assert.equal(creado.body.mantenimiento.vehiculoId, t.cabezal); // el trabajo del tanquero cuenta para su cabezal
  const rep = await t.chofer.post('/mantenimientos', datos).expect(200);
  assert.equal(rep.body.repetido, true);
  await t.chofer.post('/mantenimientos', { ...datos, id: undefined, fecha: '2999-01-01' }).expect(400);
  await t.chofer.post('/mantenimientos', { ...datos, id: undefined, unidadId: t.hino }).expect(404); // no es su vehículo
  t.mant = id;

  const ev = await t.chofer.post(`/mantenimientos/${id}/evidencias`, { categoria: 'Factura de Taller', nombreArchivo: 'factura.png', mime: 'image/png' }).expect(201);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  await request(app).put(ev.body.subirA).set('Content-Type', 'image/png').send(png).expect(401); // sin sesión no se sube
  t.subirA = ev.body.subirA;
});

test('la factura se sube una sola vez y los dos dueños del vehículo pueden verla', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const token = await entrar('chofer@ejemplo.com', 'chofer123');
  const subir = () => request(app).put(t.subirA).set('Authorization', `Bearer ${token}`).set('Content-Type', 'image/png').send(png);
  const sub = await subir().expect(200);
  assert.ok(sub.body.evidencia.subidoEn);
  assert.equal(sub.body.evidencia.sha256.length, 64);
  await subir().expect(409);
  for (const quien of [t.dueno, t.socio]) assert.equal((await quien.get(t.subirA).expect(200)).headers['content-type'], 'image/png');
});

test('el chofer genera su reporte mensual y los dueños del vehículo lo ven íntegro', async () => {
  const r = await t.chofer.post('/reportes', { tipo: 'mensual', periodo: hoy.slice(0, 7), unidadId: t.cabezal }).expect(201);
  assert.match(r.body.reporte.folio, /^REP-\d{4}-001$/);
  assert.equal(r.body.reporte.total, '180.50');
  assert.equal(r.body.reporte.vehiculoId, t.cabezal);
  assert.equal(r.body.reporte.datos.vehiculo.placa, 'ABC-1234');
  assert.equal(r.body.reporte.datos.mantenimientos[0].evidencias[0].nombreArchivo, 'factura.png');
  // ya incluido: no se repite en otro reporte mensual y lo nuevo entra como anexo
  await t.chofer.post('/reportes', { tipo: 'mensual', periodo: hoy.slice(0, 7) }).expect(400);
  const anexo = await t.chofer.post(`/mantenimientos/${t.mant}/evidencias`, { categoria: 'Factura de Repuestos', nombreArchivo: 'rep.pdf', mime: 'application/pdf' }).expect(201);
  assert.equal(anexo.body.evidencia.anexoPosterior, true);

  for (const quien of [t.dueno, t.socio]) {
    const lista = await quien.get(`/reportes?chofer=${t.choferId}`).expect(200);
    assert.equal(lista.body.reportes.length, 1);
    assert.equal(lista.body.reportes[0].chofer, 'Manuel Benítez');
    assert.equal(lista.body.reportes[0].placa, 'ABC-1234');
    const uno = await quien.get(`/reportes/${r.body.reporte.folio}`).expect(200);
    assert.equal(uno.body.integro, true);
    assert.equal(uno.body.reporte.datos.chofer.cedula, '17******65');
  }
  t.folio = r.body.reporte.folio;
});

test('formas de pago: lo que queda a crédito le aparece al dueño hasta que lo marca como pagado', async () => {
  const base = { unidadId: t.cabezal, fecha: hoy, km: 185100, parte: 'Suspensión', trabajo: 'Cambio de amortiguadores', costoTaller: 60, costoRepuestos: 240 };
  await t.chofer.post('/mantenimientos', { ...base, pagoTaller: 'bitcoin' }).expect(400);
  // Repuestos pagados, mano de obra a crédito (cada parte por separado)
  const m = (await t.chofer.post('/mantenimientos', { ...base, pagoTaller: 'credito', pagoRepuestos: 'transferencia' }).expect(201)).body.mantenimiento;
  const porPagar = async (quien) => (await quien.get('/mantenimientos?porPagar=si').expect(200)).body.mantenimientos.map((x) => x.id);
  assert.deepEqual(await porPagar(t.dueno), [m.id]);
  assert.deepEqual(await porPagar(t.socio), [m.id]);
  await t.chofer.post(`/mantenimientos/${m.id}/pagos`, { concepto: 'taller', forma: 'efectivo' }).expect(403);
  await t.dueno.post(`/mantenimientos/${m.id}/pagos`, { concepto: 'repuestos', forma: 'efectivo' }).expect(400); // eso no quedó a crédito
  await t.dueno.post(`/mantenimientos/${m.id}/pagos`, { concepto: 'taller', forma: 'credito' }).expect(400);
  const pagado = await t.dueno.post(`/mantenimientos/${m.id}/pagos`, { concepto: 'taller', forma: 'cheque' }).expect(200);
  assert.equal(pagado.body.mantenimiento.tallerPagadoCon, 'cheque');
  assert.ok(pagado.body.mantenimiento.tallerPagadoEn);
  await t.dueno.post(`/mantenimientos/${m.id}/pagos`, { concepto: 'taller', forma: 'cheque' }).expect(409);
  assert.deepEqual(await porPagar(t.dueno), []);
});

test('reportes: el de un solo trabajo no se duplica, no se inventan meses vacíos y los anexos se ven aparte', async () => {
  const uno = await t.chofer.post('/reportes', { tipo: 'individual', mantenimientoId: t.mant }).expect(201);
  const otra = await t.chofer.post('/reportes', { tipo: 'individual', mantenimientoId: t.mant }).expect(200);
  assert.equal(otra.body.reporte.folio, uno.body.reporte.folio);
  await t.chofer.post('/reportes', { tipo: 'mensual', periodo: '2999-01' }).expect(400);
  await t.chofer.post('/reportes', { tipo: 'mensual', periodo: '2026-13' }).expect(400);
  // Un mes anterior sin trabajos no inventa un reporte vacío
  const sin = await t.chofer.post('/reportes', { tipo: 'mensual', periodo: '2020-01' }).expect(400);
  assert.match(sin.body.error, /No hay nada nuevo de ese mes/);
  // Factura agregada después de congelar: sale como anexo sin dañar la huella
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const ev = await t.chofer.post(`/mantenimientos/${t.mant}/evidencias`, { categoria: 'Factura de Repuestos', nombreArchivo: 'despues.png', mime: 'image/png' }).expect(201);
  await request(app).put(ev.body.subirA).set('Authorization', `Bearer ${await entrar('chofer@ejemplo.com', 'chofer123')}`).set('Content-Type', 'image/png').send(png).expect(200);
  const ver = await t.chofer.get(`/reportes/${t.folio}`).expect(200);
  assert.equal(ver.body.integro, true);
  assert.deepEqual(ver.body.anexos.map((a) => a.nombreArchivo), ['despues.png']);
  // El chofer ve todos sus reportes emitidos, de cualquier mes
  assert.ok((await t.chofer.get('/reportes').expect(200)).body.reportes.length >= 2);
});

test('el km parte del que puso el dueño y solo sube con los mantenimientos', async () => {
  const kmDe = async () => (await t.dueno.get(`/unidades/${t.cabezal}`).expect(200)).body.km;
  assert.equal(await kmDe(), 185100); // subió con los mantenimientos (184.520 → 185.000 → 185.100)
  const base = { unidadId: t.cabezal, fecha: hoy, parte: 'Motor', trabajo: 'Cambio de aceite y filtros' };
  await t.chofer.post('/mantenimientos', { ...base, km: 190000 }).expect(201);
  assert.equal(await kmDe(), 190000);
  await t.chofer.post('/mantenimientos', { ...base, km: 150000 }).expect(201); // trabajo atrasado: no baja el km
  assert.equal(await kmDe(), 190000);
  // Un km imposible (error de tipeo) se rechaza y no daña el odómetro
  const r = await t.chofer.post('/mantenimientos', { ...base, km: 1_900_000 }).expect(400);
  assert.match(r.body.error, /Revisa que esté bien escrito/);
  assert.equal(await kmDe(), 190000);
  // Solo el dueño lo corrige; el chofer no
  await t.chofer.post(`/unidades/${t.cabezal}/km`, { km: 1, motivo: 'intento' }).expect(403);
  await t.socio.post(`/unidades/${t.cabezal}/km`, { km: 189500, motivo: 'Corrección: estaba mal leído' }).expect(201);
  assert.equal(await kmDe(), 189500);
});

test('con km pendiente, un mantenimiento del chofer no fija el punto de partida', async () => {
  const che = (await t.dueno.get('/flota')).body.vehiculos.find((v) => v.placa === 'CHE-0011').id;
  const otro = await t.dueno.post('/choferes', { nombre: 'Pedro Rojas', email: 'pedro@ejemplo.com', cedula: '0102030400', clave: 'pedro123', consentimiento: true }).expect(201);
  await t.dueno.post(`/unidades/${che}/asignar`, { choferId: otro.body.chofer.id }).expect(201);
  const pedro = como(await entrar('pedro@ejemplo.com', 'pedro123'));
  const m = await pedro.post('/mantenimientos', { unidadId: che, fecha: hoy, km: 4_000_000, parte: 'Tanque - Compartimento 2', trabajo: 'Limpieza interna', costoTaller: 25 }).expect(201);
  assert.equal((await t.dueno.get(`/unidades/${che}`)).body.km, null);
  t.mantChe = m.body.mantenimiento.id;
  t.pedro = pedro;
  t.che = che;
});

test('la socia no ve mantenimientos ni reportes de los vehículos que no son suyos', async () => {
  await t.pedro.post('/reportes', { tipo: 'individual', mantenimientoId: t.mantChe }).expect(201);
  const mios = (quien) => quien.get('/mantenimientos').expect(200).then((r) => r.body.mantenimientos.map((m) => m.id));
  assert.ok((await mios(t.dueno)).includes(t.mantChe));
  assert.ok(!(await mios(t.socio)).includes(t.mantChe));
  await t.socio.get(`/mantenimientos/${t.mantChe}`).expect(404);
  assert.equal((await t.dueno.get('/reportes')).body.reportes.length, 3);
  assert.equal((await t.socio.get('/reportes')).body.reportes.length, 2);
  assert.equal((await t.dueno.get(`/reportes?vehiculo=${t.che}`)).body.reportes.length, 1);
  await t.socio.get('/reportes/IND-' + new Date().getFullYear() + '-003').expect(404);
});

test('un chofer maneja un vehículo a la vez y el dueño puede dejar un vehículo sin chofer', async () => {
  await t.dueno.post(`/unidades/${t.hino}/asignar`, { choferId: t.choferId }).expect(201);
  let flota = (await t.dueno.get('/flota')).body.vehiculos;
  assert.equal(flota.find((v) => v.id === t.cabezal).chofer, null);
  assert.equal(flota.find((v) => v.id === t.hino).chofer.id, t.choferId);
  assert.deepEqual((await t.chofer.get('/unidades')).body.unidades.map((u) => u.placa), ['HIN-0010']);
  await t.dueno.post(`/unidades/${t.hino}/asignar`, { choferId: null }).expect(201);
  assert.equal((await t.chofer.get('/unidades')).body.unidades.length, 0);
  await t.dueno.post(`/unidades/${t.cabezal}/asignar`, { choferId: t.choferId }).expect(201);
});

test('otra empresa no ve nada de la primera y agregarla no cambia sus datos', async () => {
  const r = await t.admin.post('/admin/cuentas', { nombre: 'Combustibles del Sur', dueno: { nombre: 'Otra Persona', email: 'otro.dueno@ejemplo.com', clave: 'otraclave1' } }).expect(201);
  const otro = como(await entrar('otro.dueno@ejemplo.com', 'otraclave1'));
  assert.equal((await otro.get('/flota')).body.vehiculos.length, 0);
  await otro.get(`/unidades/${t.cabezal}`).expect(404);
  await otro.get(`/mantenimientos/${t.mant}`).expect(404);
  await otro.get(`/reportes/${t.folio}`).expect(404);
  assert.equal((await otro.get('/reportes').expect(200)).body.reportes.length, 0);
  assert.equal((await otro.get('/choferes').expect(200)).body.choferes.length, 0);
  // El dueño agrega un vehículo eligiendo el modelo y queda como su dueño
  const v = await otro.post('/vehiculos', { modeloId: 'hino-gh-2010', placa: 'SUR-0001', anio: 2012 }).expect(201);
  assert.equal(v.body.vehiculo.anio, 2012);
  assert.deepEqual(placas(await otro.get('/flota')), ['SUR-0001']);
  // Un dueño de otra empresa no puede ser dueño de un vehículo de esta
  await t.admin.put(`/admin/unidades/${t.hino}/propietarios`, { duenos: [(await otro.get('/auth/yo')).body.usuario.id] }).expect(400);
  assert.equal((await t.admin.get('/admin/cuentas')).body.cuentas.find((c) => c.id === r.body.cuenta.id).vehiculos, 1);
  assert.equal((await t.admin.get('/admin/cuentas')).body.cuentas.find((c) => c.id === t.cuenta).vehiculos, 3);
  assert.deepEqual(placas(await t.dueno.get('/flota')), ['ABC-1234', 'CHE-0011', 'HIN-0010']);
});

test('el administrador corrige un vehículo mal registrado y cambia sus dueños', async () => {
  await t.admin.patch(`/admin/unidades/${t.tanque}`, { placa: 'TAN-0456' }).expect(400); // el tanquero no lleva placa propia
  await t.admin.patch(`/admin/unidades/${t.hino}`, { placa: 'HIN-0011', anio: 2011, motor: 'Hino J08', compartimentos: [1000, 1000, 2000] }).expect(200);
  await t.admin.patch(`/admin/unidades/${t.cabezal}`, { compartimentos: [5000, 5000] }).expect(400); // los compartimentos están en su tanquero
  await t.admin.patch(`/admin/unidades/${t.hino}`, { placa: 'ABC-1234' }).expect(409);
  const flota = (await t.dueno.get('/flota')).body.vehiculos;
  const hino = flota.find((v) => v.id === t.hino);
  assert.deepEqual([hino.placa, hino.anio, hino.motor], ['HIN-0011', 2011, 'Hino J08']);
  assert.deepEqual(hino.compartimentos, [1000, 1000, 2000]);
  assert.equal(flota.find((v) => v.id === t.cabezal).tanquero.placa, null);
  // La socia pasa a ser dueña también del Hino, y luego deja de serlo
  await t.admin.put(`/admin/unidades/${t.hino}/propietarios`, { duenos: [t.duenoId, t.socioId] }).expect(200);
  assert.deepEqual(placas(await t.socio.get('/flota')), ['ABC-1234', 'HIN-0011']);
  await t.admin.put(`/admin/unidades/${t.hino}/propietarios`, { duenos: [t.duenoId] }).expect(200);
  assert.deepEqual(placas(await t.socio.get('/flota')), ['ABC-1234']);
  await t.admin.post(`/admin/unidades/${t.che}/km`, { km: 98000, motivo: 'Lo pidió el dueño por teléfono' }).expect(201);
  assert.equal((await t.dueno.get(`/unidades/${t.che}`)).body.km, 98000);
});

test('el administrador pone una contraseña nueva a un dueño que la olvidó y se cierran sus sesiones', async () => {
  await t.admin.patch(`/admin/usuarios/${t.socioId}`, { clave: 'corta1' }).expect(400); // la del dueño: mínimo 8
  await t.admin.patch(`/admin/usuarios/${t.socioId}`, { clave: 'nuevasocia1' }).expect(200);
  await t.socio.get('/flota').expect(401);
  t.socio = como(await entrar('socia@ejemplo.com', 'nuevasocia1'));
  await t.admin.patch(`/admin/usuarios/${t.socioId}`, { activo: false }).expect(200);
  await t.socio.get('/flota').expect(401);
  await request(app).post('/auth/entrar').send({ email: 'socia@ejemplo.com', clave: 'nuevasocia1' }).expect(401);
  const yo = (await t.admin.get('/auth/yo')).body.usuario.id;
  await t.admin.patch(`/admin/usuarios/${yo}`, { activo: false }).expect(404); // el administrador no se toca desde aquí
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

test('intentos fallidos en paralelo no se saltan la pausa', async () => {
  await t.dueno.patch(`/choferes/${t.choferId}`, { clave: 'paralelo1' }).expect(200);
  await Promise.all(Array.from({ length: 12 }, () => request(app).post('/auth/entrar').send({ email: 'chofer@ejemplo.com', clave: 'mal' })));
  await request(app).post('/auth/entrar').send({ email: 'chofer@ejemplo.com', clave: 'paralelo1' }).expect(429);
});
