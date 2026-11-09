// Validaciones centralizadas (requisitos 10 y 12.5). Funciones puras: devuelven { valor } o { error }.
import { T, miles } from './textos.js';
import { CONFIG } from './config.js';

export { miles };

export function normalizarPlaca(texto) {
  const limpio = String(texto ?? '').toUpperCase().replace(/[\s\-_.]/g, '');
  if (!limpio) return { error: T.placa.vacia };
  if (!/^[A-Z]{3}/.test(limpio)) return { error: T.placa.letras };
  const numeros = limpio.slice(3);
  if (!/^\d+$/.test(numeros)) return { error: T.placa.soloNumeros };
  if (numeros.length < 3 || numeros.length > 4) return { error: T.placa.cantidadNumeros };
  return { valor: `${limpio.slice(0, 3)}-${numeros}` };
}

export function validarCedula(texto) {
  const s = String(texto ?? '').replace(/[\s-]/g, '');
  if (!s) return { error: T.cedula.vacia };
  if (!/^\d+$/.test(s)) return { error: T.cedula.soloNumeros };
  if (s.length !== 10) return { error: T.cedula.diez(s.length) };
  const provincia = Number(s.slice(0, 2));
  if (!((provincia >= 1 && provincia <= 24) || provincia === 30)) return { error: T.cedula.provincia };
  if (Number(s[2]) >= 6) return { error: T.cedula.tercero };
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let p = Number(s[i]) * (i % 2 === 0 ? 2 : 1);
    if (p > 9) p -= 9;
    suma += p;
  }
  const verificador = (10 - (suma % 10)) % 10;
  if (verificador !== Number(s[9])) return { error: T.cedula.verificador };
  return { valor: s };
}

export function normalizarTelefono(texto) {
  let s = String(texto ?? '').replace(/[\s\-().]/g, '');
  if (!s) return { error: T.telefono.vacio };
  if (s.startsWith('+593')) s = s.slice(4);
  else if (s.startsWith('00593')) s = s.slice(5);
  else if (s.startsWith('593') && s.length >= 12) s = s.slice(3);
  if (!/^\d+$/.test(s)) return { error: T.telefono.soloNumeros };
  if (s.startsWith('0')) s = s.slice(1);
  if (!s.startsWith('9')) return { error: T.telefono.celular };
  if (s.length !== 9) return { error: T.telefono.largo };
  return { valor: `+593${s}` };
}

export function formatoTelefono(normalizado) {
  const m = /^\+593(\d{2})(\d{3})(\d{4})$/.exec(normalizado || '');
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : normalizado || '';
}

export function validarNombre(texto) {
  const s = String(texto ?? '').trim().replace(/\s+/g, ' ');
  if (s.length < 3) return { error: T.nombre.corto };
  if (s.length > 80) return { error: T.nombre.largo };
  if (!/^\p{L}[\p{L}\p{M} '\-’]*$/u.test(s)) return { error: T.nombre.caracteres };
  return { valor: s };
}

export function mascaraCedula(c) {
  if (!c) return '';
  return `${c.slice(0, 2)}******${c.slice(-2)}`;
}

// Entero a partir de texto. Acepta separadores de miles ("10.000").
export function aEntero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  const s = String(v ?? '').replace(/[.\s,]/g, '');
  if (!s) return null;
  if (!/^\d+$/.test(s)) return NaN;
  return Number(s);
}

export function validarEntero(v, { nombre = 'este dato', min, max, requerido = true, advertirSobre } = {}) {
  const n = aEntero(v);
  if (n === null) return requerido ? { error: T.numero.vacio(nombre) } : { valor: null };
  if (Number.isNaN(n)) return { error: T.numero.soloNumeros(nombre) };
  if (min !== undefined && n < min) return { error: T.numero.min(nombre, min) };
  if (max !== undefined && n > max) return { error: T.numero.max(nombre, max) };
  const r = { valor: n };
  if (advertirSobre !== undefined && n > advertirSobre) r.advertencia = T.numero.seguro(nombre, miles(n));
  return r;
}

export function validarTexto(v, { nombre = 'este dato', min = 1, max = 80, requerido = true } = {}) {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return requerido ? { error: T.texto.vacio(nombre) } : { valor: '' };
  if (s.length < min) return { error: T.texto.corto(nombre, min) };
  if (s.length > max) return { error: T.texto.largo(nombre, max) };
  return { valor: s };
}

// Valida un campo definido en una plantilla de tipo de unidad (sección 7).
export function validarCampo(campo, valor) {
  const nombre = campo.nombreMensaje || 'este dato';
  const requerido = !!campo.requerido;
  switch (campo.tipo) {
    case 'numero':
      return validarEntero(valor, { nombre, min: campo.min, max: campo.max, requerido, advertirSobre: campo.advertirSobre });
    case 'texto':
      return validarTexto(valor, { nombre, min: campo.min ?? 1, max: campo.max ?? 80, requerido });
    case 'placa':
      if (!String(valor ?? '').trim()) return requerido ? { error: T.placa.vacia } : { valor: '' };
      return normalizarPlaca(valor);
    case 'lista':
      if (!valor) return requerido ? { error: T.lista.vacio(nombre) } : { valor: '' };
      if (!campo.opciones.includes(valor)) return { error: T.lista.vacio(nombre) };
      return { valor };
    case 'sino':
      if (valor !== 'si' && valor !== 'no') return requerido ? { error: T.lista.vacio(nombre) } : { valor: '' };
      return { valor };
    default:
      return { valor };
  }
}

export function resumenCompartimentos(total, compartimentos) {
  const asignado = compartimentos.reduce((s, c) => s + (aEntero(c.galones) || 0), 0);
  const t = aEntero(total) || 0;
  const diferencia = asignado - t;
  let mensaje = T.tanque.completo;
  if (diferencia < 0) mensaje = T.tanque.faltan(-diferencia);
  if (diferencia > 0) mensaje = T.tanque.sobran(diferencia);
  return { asignado, total: t, diferencia, mensaje };
}

export function dividirIguales(total, n) {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - base * (n - 1) : base));
}

export function validarCompartimentos(total, compartimentos, aceptaDiferencia) {
  const errores = {};
  if (!compartimentos.length) errores.tanque = T.tanque.sinCompartimentos;
  if (compartimentos.length > CONFIG.maxCompartimentos) errores.tanque = T.tanque.maximo(CONFIG.maxCompartimentos);
  compartimentos.forEach((c, i) => {
    const r = validarEntero(c.galones, { nombre: `los galones del compartimento ${i + 1}`, min: CONFIG.minGalonesCompartimento });
    if (r.error) errores[`comp-${i}`] = r.error;
  });
  if (!Object.keys(errores).length) {
    const r = resumenCompartimentos(total, compartimentos);
    if (r.diferencia !== 0 && !aceptaDiferencia) errores.tanque = T.tanque.aceptar(r.mensaje);
  }
  return errores;
}
