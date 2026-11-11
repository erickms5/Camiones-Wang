// Iteración 2: visitas con varios trabajos, viajes, lugares, tanqueos y su congelado en reportes.
// Base propia en memoria (PGlite): no depende de las otras pruebas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { eq, sql } from 'drizzle-orm';
import { conectarMemoria } from '../src/db/conexion.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import { crearSeguridad } from '../src/seguridad.js';
import { crearAlmacenBD } from '../src/almacen.js';
import { asegurarAdmin } from '../src/administrador.js';
import { auditoria, mantenimientoTrabajos, mantenimientos } from '../src/db/esquema.js';
import { hoyEcuador, mesEcuador } from '../../public/js/viajes-logica.js';

let app, cerrar, db;
const t = {};
const hoy = hoyEcuador();
const id = () => crypto.randomUUID();

async function entrar(email, clave) {
  return (await request(app).post('/auth/entrar').send({ email, clave }).expect(200)).body.token;
}
const como = (token) => ({
  get: (u) => request(app).get(u).set('Authorization', `Bearer ${token}`),
  post: (u, b) => request(app).post(u).set('Authorization', `Bearer ${token}`).send(b),
  put: (u, b) => request(app).put(u).set('Authorization', `Bearer ${token}`).send(b),
  del: (u) => request(app).delete(u).set('Authorization', `Bearer ${token}`),
});
const kmDe = async (unidad) => (await t.dueno.get('/flota')).body.vehiculos.find((v) => v.id === unidad).km;

// Un viaje con Diésel 2.959 gal (guía 130185) y Ecopaís 990 gal (guía 130186)
const viaje = (extra = {}) => ({
  unidadId: t.cabezal, fechaSalida: hoy, horaSalida: '00:01', origen: { nombre: 'La Toma', tipo: 'estacion' }, destino: { nombre: 'Minera El Cóndor', tipo: 'minera' },
  kmSalida: 300630, estado: 'abierto',
  productos: [{ producto: 'diesel', galones: 2959, numeroGuia: '130185' }, { producto: 'ecopais', galones: 990, numeroGuia: '130186' }],
  ...extra,
});

before(async () => {
  const conexion = await conectarMemoria();
  cerrar = conexion.cerrar;
  db = conexion.db;
  const config = leerConfig({ NODE_ENV: 'test' });
  app = crearApp({ db, config, seguridad: crearSeguridad(config), almacen: crearAlmacenBD(db) });
  await asegurarAdmin(db, { adminEmail: 'admin@ejemplo.com', adminClave: 'administrador-2026', adminNombre: 'Soporte' });
  const admin = como(await entrar('admin@ejemplo.com', 'administrador-2026'));
  const c = await admin.post('/admin/cuentas', { nombre: 'Transportes de Prueba', dueno: { nombre: 'Dueña Uno', email: 'dueno@ejemplo.com', clave: 'camion2026' } }).expect(201);
  t.dueno = como(await entrar('dueno@ejemplo.com', 'camion2026'));
  const duenoId = (await t.dueno.get('/auth/yo')).body.usuario.id;
  const cuenta = c.body.cuenta.id;
  const fr = await admin.post(`/admin/cuentas/${cuenta}/vehiculos`, { modeloId: 'freightliner-columbia-2020', placa: 'ABC-1234', kmInicial: 300630, duenos: [duenoId] }).expect(201);
  const hino = await admin.post(`/admin/cuentas/${cuenta}/vehiculos`, { modeloId: 'hino-gh-2010', placa: 'HIN-0010', duenos: [duenoId] }).expect(201);
  t.cabezal = fr.body.vehiculo.id;
  t.hino = hino.body.vehiculo.id;
  const ch = await t.dueno.post('/choferes', { nombre: 'Chofer Uno', email: 'chofer@ejemplo.com', cedula: '1710034065', clave: 'chofer123', consentimiento: true }).expect(201);
  t.choferId = ch.body.chofer.id;
  await t.dueno.post(`/unidades/${t.cabezal}/asignar`, { choferId: t.choferId }).expect(201);
  t.chofer = como(await entrar('chofer@ejemplo.com', 'chofer123'));
});
after(() => cerrar?.());

// ---------------------------------------------------------------- 1.1 varios trabajos por visita
test('una visita con «Cambio de aceite» en Motor y en Caja más «Filtros de diésel» es un solo registro con tres trabajos', async () => {
  const idVisita = id();
  const datos = {
    id: idVisita, unidadId: t.cabezal, fecha: hoy, km: 300630, taller: 'Taller Loja', costoTaller: 80, costoRepuestos: 120,
    trabajos: [
      { tipoTrabajoId: 'cambio-de-aceite', parte: 'Motor', trabajo: 'Cambio de aceite' },
      { tipoTrabajoId: 'cambio-de-aceite', parte: 'Caja', trabajo: 'Cambio de aceite' },
      { tipoTrabajoId: 'filtros-de-diesel', parte: 'Motor', trabajo: 'Filtros de diésel' },
    ],
  };
  const r = await t.chofer.post('/mantenimientos', datos).expect(201);
  assert.equal(r.body.mantenimiento.trabajos.length, 3);
  assert.equal(r.body.mantenimiento.parte, 'Motor · Caja');
  assert.equal(r.body.mantenimiento.trabajo, 'Cambio de aceite y 2 más');
  assert.ok(r.body.mantenimiento.trabajos.find((x) => x.parte === 'Motor').componenteId, 'la parte Motor queda enlazada con el motor del vehículo');
  await t.chofer.post('/mantenimientos', datos).expect(200); // reintento: no duplica
  const todos = (await t.chofer.get('/mantenimientos').expect(200)).body.mantenimientos;
  assert.equal(todos.length, 1);
  // Los filtros por parte y por trabajo devuelven las visitas que los incluyen
  assert.deepEqual((await t.chofer.get('/mantenimientos?parte=Caja')).body.mantenimientos.map((m) => m.id), [idVisita]);
  assert.equal((await t.chofer.get('/mantenimientos?parte=Frenos')).body.mantenimientos.length, 0);
  assert.equal((await t.chofer.get(`/mantenimientos?trabajo=${encodeURIComponent('Filtros de diésel')}`)).body.mantenimientos.length, 1);
  assert.equal((await t.chofer.get(`/mantenimientos?parte=Caja&trabajo=${encodeURIComponent('Filtros de diésel')}`)).body.mantenimientos.length, 0);
  // Mínimo un trabajo
  await t.chofer.post('/mantenimientos', { ...datos, id: id(), trabajos: [] }).expect(400);
  t.visita = idVisita;
});

test('trabajo escrito a mano y eje de los frenos: se guardan en su parte, con el nombre oficial del catálogo', async () => {
  const r = await t.chofer.post('/mantenimientos', {
    id: id(), unidadId: t.cabezal, fecha: hoy, km: 300630,
    trabajos: [
      { tipoTrabajoId: 'cambio-de-zapatas', parte: 'Frenos', trabajo: 'texto que se ignora', nota: 'Eje Trasero 1 Cabezal' },
      { tipoTrabajoId: 'otro', parte: 'General', trabajo: 'Soldadura del guardafango' },
    ],
  }).expect(201);
  assert.deepEqual(r.body.mantenimiento.trabajos.map((x) => [x.parte, x.trabajo, x.nota]), [['Frenos', 'Cambio de zapatas', 'Eje Trasero 1 Cabezal'], ['General', 'Soldadura del guardafango', null]]);
});

test('la app anterior (un solo trabajo con su parte) sigue funcionando y la migración conserva los registros existentes', async () => {
  const viejo = await t.chofer.post('/mantenimientos', { id: id(), unidadId: t.cabezal, fecha: hoy, km: 300630, parte: 'Frenos - Eje 2 Remolque', trabajo: 'Cambio de zapatas' }).expect(201);
  assert.deepEqual(viejo.body.mantenimiento.trabajos.map((x) => [x.tipoTrabajoId, x.parte, x.trabajo]), [['anterior', 'Frenos - Eje 2 Remolque', 'Cambio de zapatas']]);

  // Registro tal como quedó antes de esta versión: sin filas en mantenimiento_trabajos
  const [m] = await db.select().from(mantenimientos).where(eq(mantenimientos.id, viejo.body.mantenimiento.id));
  await db.delete(mantenimientoTrabajos).where(eq(mantenimientoTrabajos.mantenimientoId, m.id));
  // Aun sin migrar, se ve como una visita con su trabajo
  assert.equal((await t.chofer.get(`/mantenimientos/${m.id}`)).body.mantenimiento.trabajos[0].trabajo, 'Cambio de zapatas');
  // El paso de datos de la migración 0007 crea una visita con un solo trabajo, y repetirlo no duplica
  const paso = readFileSync(new URL('../drizzle/0007_viajes_trabajos.sql', import.meta.url), 'utf8').split('--> statement-breakpoint').find((x) => x.includes('INSERT INTO "mantenimiento_trabajos"'));
  await db.execute(sql.raw(paso));
  await db.execute(sql.raw(paso));
  const filas = await db.select().from(mantenimientoTrabajos).where(eq(mantenimientoTrabajos.mantenimientoId, m.id));
  assert.deepEqual(filas.map((x) => [x.tipoTrabajoId, x.parte, x.trabajo]), [['anterior', 'Frenos - Eje 2 Remolque', 'Cambio de zapatas']]);
  assert.equal((await t.chofer.get('/mantenimientos')).body.mantenimientos.length, 3); // no se perdió ni se duplicó nada
});

// ---------------------------------------------------------------- 1.2 viajes
test('viaje con dos productos: volumen total, un producto no se repite y solo hay un viaje abierto por vehículo', async () => {
  t.viaje = id();
  await t.chofer.put(`/viajes/${t.viaje}`, viaje({ productos: [{ producto: 'diesel', galones: 100, numeroGuia: '1' }, { producto: 'diesel', galones: 200, numeroGuia: '2' }] })).expect(400);
  await t.chofer.put(`/viajes/${t.viaje}`, viaje({ productos: [{ producto: 'diesel', galones: 100, numeroGuia: ' ' }] })).expect(400); // la guía es obligatoria
  await t.chofer.put(`/viajes/${t.viaje}`, viaje({ fechaSalida: '2999-01-01' })).expect(400); // no admite fechas futuras
  const r = await t.chofer.put(`/viajes/${t.viaje}`, viaje({ compartimentos: [{ numero: 1, producto: 'diesel' }, { numero: 4, producto: 'ecopais' }] })).expect(201);
  assert.equal(r.body.viaje.volumen, 3949);
  assert.equal(r.body.viaje.estado, 'abierto');
  assert.deepEqual([r.body.viaje.origen, r.body.viaje.destino], ['La Toma', 'Minera El Cóndor']);
  assert.deepEqual(r.body.viaje.compartimentos, [{ numero: 1, producto: 'diesel' }, { numero: 4, producto: 'ecopais' }]);
  // Reintento del teléfono con el mismo id: no duplica
  await t.chofer.put(`/viajes/${t.viaje}`, viaje()).expect(200);
  assert.equal((await t.chofer.get('/viajes')).body.viajes.length, 1);
  // Otro viaje abierto en el mismo vehículo: se pide terminar el primero
  const otro = await t.chofer.put(`/viajes/${id()}`, viaje()).expect(409);
  assert.match(otro.body.error, /Termínalo antes/);
});

test('un tanqueo durante el viaje queda ligado a él y suma en el combustible consumido', async () => {
  t.tanqueo = id();
  await t.chofer.put(`/tanqueos/${t.tanqueo}`, { unidadId: t.cabezal, viajeId: t.viaje, fecha: hoy, hora: '00:01', galones: 0 }).expect(400);
  const r = await t.chofer.put(`/tanqueos/${t.tanqueo}`, { unidadId: t.cabezal, viajeId: t.viaje, fecha: hoy, hora: '00:01', galones: 100 }).expect(201);
  assert.deepEqual([r.body.tanqueo.viajeId, r.body.tanqueo.galones, r.body.tanqueo.fecha, r.body.tanqueo.hora], [t.viaje, 100, hoy, '00:01']);
  await t.chofer.put(`/tanqueos/${t.tanqueo}`, { unidadId: t.cabezal, viajeId: t.viaje, fecha: hoy, hora: '00:01', galones: 100 }).expect(200); // reintento
  const det = await t.chofer.get(`/viajes/${t.viaje}`).expect(200);
  assert.equal(det.body.viaje.galonesTanqueados, 100);
  assert.equal(det.body.tanqueos.length, 1);
  // Tanqueo sin viaje: queda asociado al vehículo
  t.tanqueoSuelto = id();
  const suelto = await t.chofer.put(`/tanqueos/${t.tanqueoSuelto}`, { unidadId: t.cabezal, fecha: hoy, hora: '00:00', galones: 40.5, lugar: 'Gasolinera Catamayo' }).expect(201);
  assert.equal(suelto.body.tanqueo.viajeId, null);
  assert.equal((await t.chofer.get('/tanqueos')).body.tanqueos.length, 2);
});

test('terminar el viaje: con km menor se rechaza con explicación; con km mayor actualiza el odómetro', async () => {
  const cierre = { estado: 'cerrado', fechaRetorno: hoy, horaRetorno: '00:02' };
  const mal = await t.chofer.put(`/viajes/${t.viaje}`, viaje({ ...cierre, kmLlegada: 300600 })).expect(400);
  assert.match(mal.body.error, /debe ser mayor al de salida/);
  assert.match(mal.body.error, /corrígelo/);
  await t.chofer.put(`/viajes/${t.viaje}`, viaje({ ...cierre, kmLlegada: 300630 })).expect(400); // igual tampoco
  await t.chofer.put(`/viajes/${t.viaje}`, viaje({ ...cierre, kmLlegada: 999999 })).expect(400); // salto imposible: error de tipeo
  assert.equal(await kmDe(t.cabezal), 300630);
  const bien = await t.chofer.put(`/viajes/${t.viaje}`, viaje({ ...cierre, kmLlegada: 300910 })).expect(200);
  assert.equal(bien.body.viaje.estado, 'cerrado');
  assert.equal(bien.body.km, 300910);
  assert.equal(await kmDe(t.cabezal), 300910);
});

test('lugares: «La Toma» y «la toma» son el mismo; no se crea duplicado y los más usados van primero', async () => {
  t.viaje2 = id();
  const r = await t.chofer.put(`/viajes/${t.viaje2}`, viaje({ kmSalida: 300910, origen: { nombre: '  la  toma ' }, destino: { nombre: 'Gasolinera Catamayo' }, productos: [{ producto: 'super', galones: 1500, numeroGuia: '130190' }] })).expect(201);
  assert.equal(r.body.viaje.origen, 'La Toma'); // se reutiliza el existente, con el nombre como se escribió la primera vez
  const lugares = (await t.chofer.get('/lugares')).body.lugares;
  assert.equal(lugares.length, 3);
  assert.deepEqual([lugares[0].nombre, lugares[0].vecesUsado, lugares[0].usadoComoCarga], ['La Toma', 2, true]);
  // La asignación de compartimentos no pasa de un viaje al siguiente
  assert.deepEqual(r.body.viaje.compartimentos, []);
  // Los lugares son de cada usuario: la dueña no ve los del chofer
  assert.equal((await t.dueno.get('/lugares')).body.lugares.length, 0);
});

test('viaje pasado completo en un solo envío: no baja el odómetro y lo avisa sin bloquear', async () => {
  await t.chofer.put(`/viajes/${t.viaje2}`, viaje({ kmSalida: 300910, origen: { nombre: 'La Toma' }, destino: { nombre: 'Gasolinera Catamayo' }, productos: [{ producto: 'super', galones: 1500, numeroGuia: '130190' }], estado: 'cerrado', fechaRetorno: hoy, horaRetorno: '00:03', kmLlegada: 301100 })).expect(200);
  assert.equal(await kmDe(t.cabezal), 301100);
  t.viajePasado = id();
  const r = await t.chofer.put(`/viajes/${t.viajePasado}`, viaje({ kmSalida: 299000, estado: 'cerrado', fechaRetorno: hoy, horaRetorno: '00:05', kmLlegada: 299400 })).expect(201);
  assert.match(r.body.aviso, /kilometraje actual sigue en/);
  assert.equal(await kmDe(t.cabezal), 301100);
  // Con el km pendiente (camión sin km puesto por el dueño), un viaje no fija el punto de partida
  await t.dueno.post(`/unidades/${t.hino}/asignar`, { choferId: null }).expect(201);
});

test('historial de viajes con filtros por fechas, destino y producto', async () => {
  const todos = (await t.chofer.get('/viajes')).body.viajes;
  assert.equal(todos.length, 3);
  assert.equal((await t.chofer.get('/viajes?destino=catamayo')).body.viajes.length, 1);
  assert.equal((await t.chofer.get('/viajes?producto=ecopais')).body.viajes.length, 2);
  assert.equal((await t.chofer.get('/viajes?producto=super')).body.viajes.length, 1);
  assert.equal((await t.chofer.get(`/viajes?desde=${hoy}&hasta=${hoy}`)).body.viajes.length, 3);
  assert.equal((await t.chofer.get('/viajes?hasta=2020-01-01')).body.viajes.length, 0);
  assert.equal((await t.dueno.get('/viajes')).body.viajes.length, 3); // la dueña ve los viajes de su vehículo
});

test('viajes y tanqueos se corrigen y se dan de baja sin borrarse, y cada cambio queda en auditoría', async () => {
  const extra = id();
  await t.chofer.put(`/tanqueos/${extra}`, { unidadId: t.cabezal, fecha: hoy, hora: '00:00', galones: 10 }).expect(201);
  await t.chofer.put(`/tanqueos/${extra}`, { unidadId: t.cabezal, fecha: hoy, hora: '00:00', galones: 12 }).expect(200);
  await t.chofer.del(`/tanqueos/${extra}`).expect(200);
  await t.chofer.put(`/tanqueos/${extra}`, { unidadId: t.cabezal, fecha: hoy, hora: '00:00', galones: 12 }).expect(409); // dado de baja
  assert.equal((await t.chofer.get('/tanqueos')).body.tanqueos.length, 2);
  const acciones = (await db.select().from(auditoria).where(eq(auditoria.entidadId, extra))).map((a) => a.accion);
  assert.deepEqual(acciones.sort(), ['baja', 'crear', 'editar']);
  const delViaje = (await db.select().from(auditoria).where(eq(auditoria.entidadId, t.viaje))).map((a) => a.accion);
  assert.ok(delViaje.includes('crear') && delViaje.includes('terminar'));
});

// ---------------------------------------------------------------- 1.4 reportes
test('foto de la guía: se registra en el viaje y la ve la dueña', async () => {
  const ev = await t.chofer.post(`/viajes/${t.viaje}/evidencias`, { nombreArchivo: 'guia-130185.png', mime: 'image/png' }).expect(201);
  assert.equal(ev.body.evidencia.categoria, 'Guía');
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  await request(app).put(ev.body.subirA).set('Content-Type', 'image/png').send(png).expect(401); // sin sesión no se sube
  const token = await entrar('chofer@ejemplo.com', 'chofer123');
  await request(app).put(ev.body.subirA).set('Authorization', `Bearer ${token}`).set('Content-Type', 'image/png').send(png).expect(200);
  await t.dueno.get(ev.body.subirA).expect(200);
  t.guia = ev.body.evidencia.id;
});

test('reporte individual de un viaje: todos sus datos, su guía y sus tanqueos; no se duplica', async () => {
  const r = await t.chofer.post('/reportes', { tipo: 'viaje', viajeId: t.viaje }).expect(201);
  assert.match(r.body.reporte.folio, /^VIA-\d{4}-\d{3}$/);
  const v = r.body.reporte.datos.viajes[0];
  assert.deepEqual([v.origen, v.destino, v.volumen, v.combustible, v.kmRecorridos], ['La Toma', 'Minera El Cóndor', 3949, 100, 280]);
  assert.equal(v.kmPorGalon, 2.8); // se calcula y se guarda (la hoja no lo muestra)
  assert.deepEqual(v.evidencias.map((e) => e.id), [t.guia]);
  assert.equal(v.tanqueos.length, 1);
  const otra = await t.chofer.post('/reportes', { tipo: 'viaje', viajeId: t.viaje }).expect(200);
  assert.equal(otra.body.reporte.folio, r.body.reporte.folio);
  // Un viaje sin terminar no tiene reporte
  const abierto = id();
  await t.chofer.put(`/viajes/${abierto}`, viaje({ kmSalida: 301100 })).expect(201);
  await t.chofer.post('/reportes', { tipo: 'viaje', viajeId: abierto }).expect(400);
  t.abierto = abierto;
});

test('reporte mensual: viajes con su carga y su combustible, tanqueos fuera de viaje, totales y congelado', async () => {
  const r = await t.chofer.post('/reportes', { tipo: 'mensual', periodo: mesEcuador(), unidadId: t.cabezal }).expect(201);
  const d = r.body.reporte.datos;
  assert.equal(d.vehiculo.placa, 'ABC-1234'); // la placa del cabezal va en el encabezado
  assert.equal(d.mantenimientos.length, 3);
  assert.equal(d.mantenimientos[0].trabajos.length, 3); // la visita entra con todos sus trabajos
  // Solo los viajes terminados: el abierto queda para el reporte siguiente
  assert.equal(d.viajes.length, 3);
  const v = d.viajes.find((x) => x.id === t.viaje);
  assert.deepEqual([v.fechaSalida, v.horaSalida, v.horaRetorno, v.kmSalida, v.kmLlegada, v.origen, v.destino, v.volumen, v.combustible],
    [hoy, '00:01', '00:02', 300630, 300910, 'La Toma', 'Minera El Cóndor', 3949, 100]);
  assert.deepEqual(v.productos.map((p) => [p.nombre, p.galones, p.numeroGuia]), [['Diésel', 2959, '130185'], ['Ecopaís', 990, '130186']]);
  // Tanqueos sin viaje: tabla aparte
  assert.deepEqual(d.tanqueosFuera.map((x) => [x.fecha, x.hora, x.galones]), [[hoy, '00:00', 40.5]]);
  assert.deepEqual(d.totalesViajes, {
    viajes: 3, kmRecorridos: 280 + 190 + 400, galonesPorProducto: { diesel: 5918, super: 1500, ecopais: 1980 }, galonesTanqueados: 140.5, kmPorGalon: 8.7,
  });
  const visto = await t.dueno.get(`/reportes/${r.body.reporte.folio}`).expect(200);
  assert.equal(visto.body.integro, true);

  // Congelado: ya no se corrigen ni se dan de baja, y no entran a otro reporte
  await t.chofer.put(`/viajes/${t.viaje}`, viaje({ estado: 'cerrado', fechaRetorno: hoy, horaRetorno: '00:02', kmLlegada: 300920 })).expect(409);
  await t.chofer.del(`/viajes/${t.viaje}`).expect(409);
  await t.chofer.put(`/tanqueos/${t.tanqueo}`, { unidadId: t.cabezal, viajeId: t.viaje, fecha: hoy, hora: '00:01', galones: 90 }).expect(409);
  await t.chofer.put(`/tanqueos/${t.tanqueoSuelto}`, { unidadId: t.cabezal, fecha: hoy, hora: '00:00', galones: 41 }).expect(409);
  const nada = await t.chofer.post('/reportes', { tipo: 'mensual', periodo: mesEcuador(), unidadId: t.cabezal }).expect(400);
  assert.match(nada.body.error, /No hay nada nuevo de ese mes/);
  assert.equal((await t.chofer.get(`/viajes/${t.viaje}`)).body.viaje.bloqueado, true);

  // Una foto de guía subida después entra como anexo posterior, sin cambiar la huella
  const ev = await t.chofer.post(`/viajes/${t.viaje}/evidencias`, { nombreArchivo: 'guia-130186.png', mime: 'image/png' }).expect(201);
  assert.equal(ev.body.evidencia.anexoPosterior, true);
  const token = await entrar('chofer@ejemplo.com', 'chofer123');
  await request(app).put(ev.body.subirA).set('Authorization', `Bearer ${token}`).set('Content-Type', 'image/png').send(Buffer.from('89504e470d0a1a0a', 'hex')).expect(200);
  const despues = await t.chofer.get(`/reportes/${r.body.reporte.folio}`).expect(200);
  assert.deepEqual(despues.body.anexos.map((a) => [a.viajeId, a.nombreArchivo]), [[t.viaje, 'guia-130186.png']]);
  assert.equal(despues.body.integro, true);
});

test('un mes solo con un viaje terminado también se puede reportar, y el viaje dado de baja no entra', async () => {
  await t.chofer.put(`/viajes/${t.abierto}`, viaje({ kmSalida: 301100, estado: 'cerrado', fechaRetorno: hoy, horaRetorno: '00:10', kmLlegada: 301300 })).expect(200);
  const baja = id();
  await t.chofer.put(`/viajes/${baja}`, viaje({ kmSalida: 301300, estado: 'cerrado', fechaRetorno: hoy, horaRetorno: '00:20', kmLlegada: 301500 })).expect(201);
  await t.chofer.del(`/viajes/${baja}`).expect(200);
  assert.equal((await t.chofer.get('/viajes')).body.viajes.length, 4); // el dado de baja ya no se lista
  const r = await t.chofer.post('/reportes', { tipo: 'mensual', periodo: mesEcuador(), unidadId: t.cabezal }).expect(201);
  assert.deepEqual(r.body.reporte.datos.viajes.map((v) => v.id), [t.abierto]);
  assert.equal(r.body.reporte.datos.mantenimientos.length, 0);
});
