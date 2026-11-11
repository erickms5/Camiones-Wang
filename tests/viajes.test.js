// Reglas de viajes, tanqueos, lugares y del catálogo de trabajos (sin pantalla ni servidor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  actualizaOdometro, errorCierre, errorProductos, errorSalida, errorTanqueo, galonesTanqueados, hoyEcuador, horaEcuador, kmPorGalon, kmRecorridos,
  mensajeViaje, normalizarLugar, pideRecordatorio, sugerirLugares, usarLugar, viajeAbierto, volumenTotal,
} from '../public/js/viajes-logica.js';
import { GRUPOS, gruposPara, textoTrabajos, partesDeVisita, resumenTrabajos, trabajosDeRegistro, visitaIncluye } from '../public/js/catalogo-trabajos.js';

const viaje = (extra = {}) => ({
  id: 'v1', cabezalId: 'c1', fechaSalida: '2026-11-10', horaSalida: '06:30', origen: 'La Toma', destino: 'Minera El Cóndor', kmSalida: 300630, estado: 'abierto',
  productos: [{ producto: 'diesel', galones: 2959, numeroGuia: '130185' }, { producto: 'ecopais', galones: 990, numeroGuia: '130186' }], ...extra,
});

test('el km de llegada debe ser mayor al de salida y el mensaje dice qué corregir', () => {
  const cierre = { fechaRetorno: '2026-11-10', horaRetorno: '18:00' };
  assert.match(errorCierre(viaje({ ...cierre, kmLlegada: 300600 }), '2026-11-10'), /debe ser mayor al de salida.*corrígelo/);
  assert.match(errorCierre(viaje({ ...cierre, kmLlegada: 300630 }), '2026-11-10'), /debe ser mayor/);
  assert.equal(errorCierre(viaje({ ...cierre, kmLlegada: 300910 }), '2026-11-10'), null);
  assert.match(errorCierre(viaje({ ...cierre, horaRetorno: '05:00', kmLlegada: 300910 }), '2026-11-10'), /antes de la salida/);
  assert.match(errorCierre(viaje({ ...cierre, fechaRetorno: '2026-11-11', kmLlegada: 300910 }), '2026-11-10'), /no puede ser futura/);
  assert.equal(kmRecorridos(viaje({ kmLlegada: 300910 })), 280);
});

test('fecha de salida: admite pasadas y rechaza futuras', () => {
  assert.equal(errorSalida(viaje(), '2026-11-10'), null);
  assert.equal(errorSalida(viaje({ fechaSalida: '2026-10-01' }), '2026-11-10'), null);
  assert.match(errorSalida(viaje({ fechaSalida: '2026-11-11' }), '2026-11-10'), /no puede ser futura/);
  assert.match(errorSalida(viaje({ origen: '  ' }), '2026-11-10'), /lugar de carga/);
});

test('solo un viaje abierto por vehículo', () => {
  const lista = [viaje({ id: 'a', estado: 'cerrado' }), viaje({ id: 'b' }), viaje({ id: 'c', cabezalId: 'c2' }), viaje({ id: 'd', activo: false })];
  assert.equal(viajeAbierto(lista, 'c1').id, 'b');
  assert.equal(viajeAbierto(lista, 'c2').id, 'c');
  assert.equal(viajeAbierto(lista, 'c3'), null);
  assert.equal(viajeAbierto([viaje({ estado: 'cerrado' })], 'c1'), null);
});

test('carga: máximo tres productos, ninguno repetido, galones enteros positivos y guía obligatoria', () => {
  assert.equal(errorProductos(viaje().productos), null);
  assert.match(errorProductos([]), /al menos un producto/);
  assert.match(errorProductos([{ producto: 'diesel', galones: 100, numeroGuia: '1' }, { producto: 'diesel', galones: 50, numeroGuia: '2' }]), /Diésel está repetido/);
  assert.match(errorProductos([{ producto: 'super', galones: 0, numeroGuia: '1' }]), /mayor a cero/);
  assert.match(errorProductos([{ producto: 'super', galones: 10.5, numeroGuia: '1' }]), /número entero/);
  assert.match(errorProductos([{ producto: 'ecopais', galones: 10, numeroGuia: ' ' }]), /número de guía de Ecopaís/);
  assert.match(errorProductos([{ producto: 'gasolina', galones: 10, numeroGuia: '1' }]), /Diésel, Súper o Ecopaís/);
  const cuatro = ['diesel', 'super', 'ecopais', 'diesel'].map((producto) => ({ producto, galones: 1, numeroGuia: '1' }));
  assert.match(errorProductos(cuatro), /máximo 3/);
});

test('volumen total: Diésel 2.959 + Ecopaís 990 = 3.949 (no depende de los compartimentos)', () => {
  assert.equal(volumenTotal(viaje().productos), 3949);
  assert.equal(volumenTotal([]), 0);
  // 12.000 galones en un tanque de 10.000: no se valida contra la capacidad
  assert.equal(errorProductos([{ producto: 'diesel', galones: 12000, numeroGuia: '9' }]), null);
});

test('lugares: «La Toma» y «la toma» son el mismo; no se crea duplicado', () => {
  const lugares = [];
  const a = usarLugar(lugares, 'La Toma', 'carga', { tipo: 'estacion' });
  const b = usarLugar(lugares, '  la  toma ', 'carga');
  const c = usarLugar(lugares, 'LA TOMÁ', 'destino');
  assert.equal(lugares.length, 1);
  assert.ok(a === b && b === c);
  assert.deepEqual([a.nombre, a.vecesUsado, a.usadoComoCarga, a.usadoComoDestino, a.tipo], ['La Toma', 3, true, true, 'estacion']);
  assert.equal(normalizarLugar('Minera El Cóndor'), 'mineraelcondor');
  assert.equal(usarLugar(lugares, '   ', 'carga'), null);
});

test('sugerencias al escribir: sin mayúsculas ni tildes, primero los más usados', () => {
  const lugares = [];
  usarLugar(lugares, 'Gasolinera Catamayo', 'destino');
  usarLugar(lugares, 'La Toma', 'carga');
  usarLugar(lugares, 'La Toma', 'carga');
  usarLugar(lugares, 'Latacunga', 'destino');
  assert.deepEqual(sugerirLugares(lugares, 'la t').map((l) => l.nombre), ['La Toma', 'Latacunga']);
  assert.deepEqual(sugerirLugares(lugares, 'LA').map((l) => l.nombre), ['La Toma', 'Latacunga']);
  assert.deepEqual(sugerirLugares(lugares, 'catamáyo').map((l) => l.nombre), ['Gasolinera Catamayo']);
  assert.equal(sugerirLugares([], 'la').length, 0); // la lista empieza vacía
});

test('tanqueos: se suman al viaje y un km de llegada menor al actual no baja el odómetro', () => {
  const tanqueos = [{ viajeId: 'v1', galones: 100 }, { viajeId: 'v1', galones: 20.5 }, { viajeId: null, galones: 40 }, { viajeId: 'v1', galones: 9, activo: false }];
  assert.equal(galonesTanqueados(tanqueos, 'v1'), 120.5);
  assert.equal(actualizaOdometro(300910, 300630), true);
  assert.equal(actualizaOdometro(299400, 300630), false);
  assert.equal(kmPorGalon(280, 100), 2.8);
  assert.equal(kmPorGalon(280, 0), null);
  assert.match(errorTanqueo({ fecha: '2026-11-10', hora: '10:00', galones: 0 }, new Date('2026-11-10T20:00:00-05:00')), /mayor a cero/);
  assert.match(errorTanqueo({ fecha: '2026-11-11', hora: '10:00', galones: 5 }, new Date('2026-11-10T20:00:00-05:00')), /futuras/);
  assert.equal(errorTanqueo({ fecha: '2026-11-10', hora: '10:00', galones: 5 }, new Date('2026-11-10T20:00:00-05:00')), null);
});

test('mensaje para copiar, recordatorio a las 48 horas y fechas en hora de Ecuador', () => {
  const texto = mensajeViaje(viaje({ kmLlegada: 300910 }), [{ viajeId: 'v1', galones: 100 }]);
  assert.equal(texto, 'Viaje 2026-11-10 · La Toma → Minera El Cóndor\nDiésel 2.959 gal guía 130185\nEcopaís 990 gal guía 130186\nKm 300.630-300.910\nTanqueos 100 gal');
  assert.equal(pideRecordatorio(viaje(), new Date('2026-11-12T06:00:00-05:00')), false);
  assert.equal(pideRecordatorio(viaje(), new Date('2026-11-12T07:00:00-05:00')), true);
  assert.equal(pideRecordatorio(viaje({ estado: 'cerrado' }), new Date('2026-11-20T07:00:00-05:00')), false);
  // 02:30 UTC del día 11 todavía es el día 10 en Ecuador
  assert.deepEqual([hoyEcuador(new Date('2026-11-11T02:30:00Z')), horaEcuador(new Date('2026-11-11T02:30:00Z'))], ['2026-11-10', '21:30']);
});

test('catálogo de trabajos: ocho partes, vocabulario de camión pesado y el mismo trabajo en varias partes', () => {
  assert.deepEqual(GRUPOS.map((g) => g.nombre), ['Motor', 'Caja', 'Frenos', 'Ejes y llantas', 'Suspensión', 'Sistema eléctrico', 'Tanque y válvulas', 'General']);
  const frenos = GRUPOS.find((g) => g.id === 'frenos').trabajos.map((t) => t.nombre);
  ['Cambio de zapatas', 'Revisión de tanque de aire', 'Regulación de frenos', 'Cambio de líquido de frenos'].forEach((t) => assert.ok(frenos.includes(t), t));
  const todos = GRUPOS.flatMap((g) => g.trabajos.map((t) => t.nombre)).join(' ').toLowerCase();
  assert.ok(!todos.includes('pastilla') && !todos.includes('limpieza'));
  const aceite = (id) => GRUPOS.find((g) => g.id === id).trabajos.find((t) => t.nombre === 'Cambio de aceite');
  assert.equal(aceite('motor').id, aceite('caja').id);
  // Lo propio del cabezal no se ofrece al camión, y al revés
  assert.ok(gruposPara('tracto').find((g) => g.id === 'general').trabajos.some((t) => t.nombre === 'Engrase de quinta rueda'));
  assert.ok(!gruposPara('camion').find((g) => g.id === 'general').trabajos.some((t) => t.nombre === 'Engrase de quinta rueda'));
  // Dentro de una parte no se repite ninguna clave
  GRUPOS.forEach((g) => assert.equal(new Set(g.trabajos.map((t) => t.id)).size, g.trabajos.length, g.nombre));
});

test('una visita con varios trabajos se muestra agrupada por parte y los filtros la encuentran', () => {
  const visita = {
    trabajos: [
      { tipoTrabajoId: 'cambio-de-aceite', parte: 'Motor', trabajo: 'Cambio de aceite' },
      { tipoTrabajoId: 'cambio-de-aceite', parte: 'Caja', trabajo: 'Cambio de aceite' },
      { tipoTrabajoId: 'filtros-de-diesel', parte: 'Motor', trabajo: 'Filtros de diésel' },
    ],
  };
  assert.equal(textoTrabajos(visita.trabajos), 'Motor: cambio de aceite, filtros de diésel · Caja: cambio de aceite');
  assert.deepEqual(partesDeVisita(visita.trabajos), ['Motor', 'Caja']);
  assert.equal(resumenTrabajos(visita.trabajos), 'Cambio de aceite y 2 más');
  assert.equal(visitaIncluye(visita, { parte: 'Caja' }), true);
  assert.equal(visitaIncluye(visita, { parte: 'Frenos' }), false);
  assert.equal(visitaIncluye(visita, { trabajo: 'Filtros de diésel' }), true);
  assert.equal(visitaIncluye(visita, { parte: 'Caja', trabajo: 'Filtros de diésel' }), false);
  // Un registro anterior (una parte y un trabajo) se lee como una visita con un solo trabajo
  const anterior = { parte: 'Frenos - Eje 2 Remolque', trabajo: 'Cambio de zapatas' };
  assert.deepEqual(trabajosDeRegistro(anterior), [{ tipoTrabajoId: 'anterior', parte: 'Frenos - Eje 2 Remolque', trabajo: 'Cambio de zapatas', nota: null }]);
  assert.equal(visitaIncluye(anterior, { trabajo: 'Cambio de zapatas' }), true);
});
