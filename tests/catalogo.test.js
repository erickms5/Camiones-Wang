import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELOS, buscarModelo, modeloPorId, partesDe, ejesDe, trabajosDe, unidadDeParte, galones, INTERVALOS_GENERICOS, OTRO_TRABAJO } from '../public/js/catalogo.js';

test('catálogo: los tres modelos de la flota con sus compartimentos', () => {
  assert.deepEqual(modeloPorId('freightliner-columbia-2020').compartimentos, [3000, 2000, 2000, 3000]);
  assert.deepEqual(modeloPorId('hino-gh-2010').compartimentos, [1000, 2000, 1000]);
  assert.deepEqual(modeloPorId('chevrolet-fvr-2011').compartimentos, [1000, 1000, 1000, 1000]);
  assert.deepEqual(MODELOS.map((m) => galones(m.compartimentos)), [10000, 4000, 4000]);
  assert.equal(modeloPorId('no-existe'), null);
});

test('catálogo: coincide por marca y modelo sin importar mayúsculas ni espacios', () => {
  assert.equal(buscarModelo(' freightliner ', 'COLUMBIA')?.id, 'freightliner-columbia-2020');
  assert.equal(buscarModelo('Kenworth', 'T800'), null);
  assert.ok(buscarModelo('Hino', 'GH').intervalos.length > 0);
  assert.ok(INTERVALOS_GENERICOS.length > 0);
});

test('cabezal con tanquero: 6 ejes, quinta rueda y partes del remolque', () => {
  const cfg = { modeloId: 'freightliner-columbia-2020' };
  assert.deepEqual(ejesDe(cfg).map((e) => e.id), ['Eje Delantero Cabezal', 'Eje Trasero 1 Cabezal', 'Eje Trasero 2 Cabezal', 'Eje 1 Remolque', 'Eje 2 Remolque', 'Eje 3 Remolque']);
  const partes = partesDe(cfg).map((p) => p.id);
  assert.ok(partes.includes('Quinta Rueda'));
  assert.ok(partes.includes('Tanque - Compartimento 4'));
  assert.equal(unidadDeParte('Frenos - Eje 2 Remolque', cfg), 'tanquero');
  assert.equal(unidadDeParte('Tanque - Compartimento 1', cfg), 'tanquero');
  assert.equal(unidadDeParte('Frenos - Eje Trasero 1 Cabezal', cfg), 'vehiculo');
  assert.equal(unidadDeParte('Motor', cfg), 'vehiculo');
});

test('camión rígido: 2 ejes, sin quinta rueda ni remolque; el tanque es del mismo camión', () => {
  const cfg = { modeloId: 'hino-gh-2010' };
  assert.deepEqual(ejesDe(cfg).map((e) => e.id), ['Eje Delantero', 'Eje Trasero']);
  const partes = partesDe(cfg).map((p) => p.id);
  assert.ok(!partes.includes('Quinta Rueda'));
  assert.ok(!partes.some((p) => p.includes('Remolque')));
  assert.equal(partes.filter((p) => p.startsWith('Tanque - Compartimento')).length, 3);
  assert.equal(unidadDeParte('Tanque - Compartimento 2', cfg), 'vehiculo');
});

test('trabajos: los típicos de la parte, los propios del modelo y siempre «Otro trabajo»', () => {
  const hino = trabajosDe('Cabina', { modeloId: 'hino-gh-2010' });
  assert.ok(hino.includes('Reparación del sistema para levantar la cabina'));
  assert.ok(!trabajosDe('Cabina', { modeloId: 'freightliner-columbia-2020' }).includes('Reparación del sistema para levantar la cabina'));
  assert.ok(trabajosDe('Suspensión', { modeloId: 'freightliner-columbia-2020' }).some((t) => t.includes('bolsas de aire')));
  assert.ok(trabajosDe('Frenos', { modeloId: 'chevrolet-fvr-2011' }).includes('Cambio de zapatas'));
  assert.equal(hino.at(-1), OTRO_TRABAJO);
});
