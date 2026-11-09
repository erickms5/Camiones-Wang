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

test('compartimentos: tanquero del cliente suma 10.000 (CA-03)', () => {
  const comps = [3000, 2000, 2000, 3000].map((g) => ({ galones: g }));
  const r = V.resumenCompartimentos(10000, comps);
  assert.equal(r.asignado, 10000);
  assert.equal(r.diferencia, 0);
  assert.deepEqual(V.validarCompartimentos(10000, comps, false), {});
});

test('compartimentos: suma incorrecta bloquea salvo aceptación (CA-04)', () => {
  const comps = [3000, 2000, 2000, 2000].map((g) => ({ galones: g }));
  assert.equal(V.resumenCompartimentos(10000, comps).mensaje, 'Faltan 1.000 galones');
  assert.match(V.validarCompartimentos(10000, comps, false).tanque, /Faltan 1.000 galones/);
  assert.deepEqual(V.validarCompartimentos(10000, comps, true), {});
  assert.ok(V.validarCompartimentos(10000, [{ galones: 0 }], true)['comp-0']);
});

test('dividir en partes iguales', () => {
  assert.deepEqual(V.dividirIguales(10000, 4), [2500, 2500, 2500, 2500]);
  assert.deepEqual(V.dividirIguales(10000, 3), [3333, 3333, 3334]);
});

test('kilometraje: advierte sobre 2.000.000 sin bloquear', () => {
  const r = V.validarEntero('2.500.000', { nombre: 'el kilometraje', min: 0, advertirSobre: 2000000 });
  assert.equal(r.valor, 2500000);
  assert.match(r.advertencia, /seguro/);
});

test('cédula enmascarada', () => {
  assert.equal(V.mascaraCedula('1710034065'), '17******65');
});
