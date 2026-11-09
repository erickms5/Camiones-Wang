import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarModelo, sugerirMarcas, sugerirModelos, INTERVALOS_GENERICOS } from '../public/js/catalogo.js';

test('catálogo: Freightliner Columbia 2020 coincide sin importar mayúsculas ni espacios', () => {
  assert.equal(buscarModelo('Freightliner', 'Columbia', 2020)?.id, 'freightliner-columbia-2020');
  assert.equal(buscarModelo(' freightliner ', 'COLUMBIA', '2020')?.id, 'freightliner-columbia-2020');
  assert.ok(buscarModelo('Freightliner', 'Columbia', 2020).intervalos.length > 0);
});

test('catálogo: sin coincidencia devuelve null (se usan intervalos genéricos)', () => {
  assert.equal(buscarModelo('Freightliner', 'Columbia', 2019), null);
  assert.equal(buscarModelo('Kenworth', 'T800', 2020), null);
  assert.ok(INTERVALOS_GENERICOS.length > 0);
});

test('autocompletado: nada con el campo vacío, sugiere al escribir', () => {
  assert.deepEqual(sugerirMarcas(''), []);
  assert.deepEqual(sugerirModelos('Freightliner', ''), []);
  assert.deepEqual(sugerirMarcas('frei'), ['Freightliner']);
  assert.deepEqual(sugerirModelos('freightliner', 'col'), ['Columbia']);
  assert.deepEqual(sugerirMarcas('xyz'), []);
});
