import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../public/js/validaciones.js';

test('placa: normaliza mayúsculas y guion (CA-01)', () => {
  assert.equal(V.normalizarPlaca('abc1234').valor, 'ABC-1234');
  assert.equal(V.normalizarPlaca(' ab c-123 ').valor, 'ABC-123');
  assert.equal(V.normalizarPlaca('ABC-123').valor, 'ABC-123'); // formato antiguo
});

test('placa: rechaza formatos inválidos con mensaje claro', () => {
  assert.match(V.normalizarPlaca('').error, /Escriba/);
  assert.match(V.normalizarPlaca('AB1234').error, /3 letras/);
  assert.match(V.normalizarPlaca('ABC12').error, /3 o 4 números/);
  assert.match(V.normalizarPlaca('ABC12345').error, /3 o 4 números/);
  assert.match(V.normalizarPlaca('ABC12A4').error, /solo van números/);
});

test('cédula: válidas', () => {
  for (const c of ['1710034065', '0926687856', '1712345675']) assert.equal(V.validarCedula(c).valor, c, c);
});

test('cédula: inválidas con el motivo (CA-05)', () => {
  assert.match(V.validarCedula('171003406').error, /10 números/);
  assert.match(V.validarCedula('17100340a5').error, /solo lleva números/);
  assert.match(V.validarCedula('2510034065').error, /provincia/);
  assert.match(V.validarCedula('1760034065').error, /tercer/);
  assert.match(V.validarCedula('1710034064').error, /último número/);
});

test('teléfono: normaliza a +593', () => {
  assert.equal(V.normalizarTelefono('0991234567').valor, '+593991234567');
  assert.equal(V.normalizarTelefono('099 123 4567').valor, '+593991234567');
  assert.equal(V.normalizarTelefono('+593 99 123 4567').valor, '+593991234567');
  assert.equal(V.normalizarTelefono('991234567').valor, '+593991234567'); // sin código de país
  assert.match(V.normalizarTelefono('0221234567').error, /09/);
  assert.match(V.normalizarTelefono('09912345').error, /10 números/);
  assert.equal(V.formatoTelefono('+593991234567'), '099 123 4567');
});

test('nombre del conductor', () => {
  assert.equal(V.validarNombre('  José   Ñáñez-O’Brien ').valor, 'José Ñáñez-O’Brien');
  assert.ok(V.validarNombre('Jo').error);
  assert.ok(V.validarNombre('Juan 3').error);
});

test('compartimentos: el total es la suma de los galones (criterio c)', () => {
  const casos = [
    [[8000], 8000],
    [[6000, 4000], 10000],
    [[5000, 3000, 2000], 10000],
    [[3000, 2000, 2000, 3000], 10000],
    [[1500, 2750, 900], 5150],
  ];
  for (const [galones, total] of casos) {
    const comps = galones.map((g) => ({ galones: g }));
    assert.equal(V.totalCompartimentos(comps), total, galones.join('+'));
    assert.deepEqual(V.validarCompartimentos(comps), {}, galones.join('+'));
  }
  assert.equal(V.miles(10000), '10.000');
});

test('compartimentos: vacíos o en 0 no se pueden guardar', () => {
  const r = V.validarCompartimentos([{ galones: 3000 }, { galones: null }, { galones: 0 }, { galones: '' }]);
  assert.equal(r['comp-1'], 'Ingresa los galones del compartimento 2');
  assert.equal(r['comp-2'], 'Ingresa los galones del compartimento 3');
  assert.equal(r['comp-3'], 'Ingresa los galones del compartimento 4');
  assert.equal(r['comp-0'], undefined);
  assert.equal(V.totalCompartimentos([{ galones: 3000 }, { galones: null }]), 3000);
});

test('compartimentos: mínimo 1 y máximo 10', () => {
  assert.ok(V.validarCompartimentos([]).tanque);
  const diez = Array.from({ length: 10 }, () => ({ galones: 1000 }));
  assert.deepEqual(V.validarCompartimentos(diez), {});
  assert.ok(V.validarCompartimentos([...diez, { galones: 1000 }]).tanque);
});

test('kilometraje: advierte sobre 2.000.000 sin bloquear', () => {
  const r = V.validarEntero('2.500.000', { nombre: 'el kilometraje', min: 0, advertirSobre: 2000000 });
  assert.equal(r.valor, 2500000);
  assert.match(r.advertencia, /seguro/);
});

test('cédula enmascarada', () => {
  assert.equal(V.mascaraCedula('1710034065'), '17******65');
});
