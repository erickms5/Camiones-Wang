// Reglas de viajes, tanqueos y lugares. Sin pantalla ni red: las usan la app, el servidor y las pruebas.
//   «Carga»   = producto que lleva el tanque (Diésel, Súper o Ecopaís).
//   «Tanqueo» = combustible que consume el camión.
import { PLANTILLA_VIAJE, LINEA_PRODUCTO } from './plantilla-mensaje.js';

export const PRODUCTOS = [
  { id: 'diesel', nombre: 'Diésel' },
  { id: 'super', nombre: 'Súper' },
  { id: 'ecopais', nombre: 'Ecopaís' },
];
export const MAX_PRODUCTOS = 3;
export const TIPOS_LUGAR = [['estacion', 'Estación'], ['gasolinera', 'Gasolinera'], ['minera', 'Minera'], ['otro', 'Otro']];
export const HORAS_RECORDATORIO = 48;
export const nombreProducto = (id) => PRODUCTOS.find((p) => p.id === id)?.nombre || id;
export const miles = (n) => Number(n || 0).toLocaleString('es-EC');

// ---------------------------------------------------------------- fechas (Ecuador, UTC-5)
const DESFASE_MS = 5 * 3600 * 1000;
const enEcuador = (cuando = new Date()) => new Date(new Date(cuando).getTime() - DESFASE_MS).toISOString();
export const hoyEcuador = (cuando) => enEcuador(cuando).slice(0, 10);
export const horaEcuador = (cuando) => enEcuador(cuando).slice(11, 16);
export const mesEcuador = (cuando) => enEcuador(cuando).slice(0, 7);
// Fecha y hora de Ecuador → instante
export const instante = (fecha, hora = '00:00') => new Date(`${fecha}T${hora}:00-05:00`);
export const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || '')) && !Number.isNaN(Date.parse(`${f}T00:00:00Z`));
export const horaValida = (h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || ''));

// ---------------------------------------------------------------- lugares
// Dos nombres son el mismo lugar si coinciden sin mayúsculas, tildes ni espacios
export const normalizarLugar = (nombre) => String(nombre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '');
export const limpiarNombre = (nombre) => String(nombre ?? '').replace(/\s+/g, ' ').trim();

export function nuevoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Respaldo para navegadores antiguos: UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

// Reutiliza el lugar existente o crea uno; nunca duplica. «uso» = 'carga' | 'destino'. Devuelve el lugar.
export function usarLugar(lugares, nombre, uso, { tipo = null, id = null, contar = true } = {}) {
  const limpio = limpiarNombre(nombre);
  const norm = normalizarLugar(limpio);
  if (!norm) return null;
  let lugar = lugares.find((l) => l.nombreNormalizado === norm);
  if (!lugar) {
    lugar = { id: id || nuevoId(), nombre: limpio, nombreNormalizado: norm, tipo: tipo || null, usadoComoCarga: false, usadoComoDestino: false, vecesUsado: 0, activo: true };
    lugares.push(lugar);
  }
  if (tipo && !lugar.tipo) lugar.tipo = tipo;
  if (uso === 'carga') lugar.usadoComoCarga = true;
  if (uso === 'destino') lugar.usadoComoDestino = true;
  if (contar) lugar.vecesUsado = (lugar.vecesUsado || 0) + 1;
  return lugar;
}

// Sugerencias al escribir: primero los que empiezan con el texto, luego los que lo contienen; los más usados arriba
export function sugerirLugares(lugares, texto, uso = null, max = 6) {
  const q = normalizarLugar(texto);
  const sirven = lugares.filter((l) => l.activo !== false && (!q || l.nombreNormalizado.includes(q)));
  const delUso = (l) => ((uso === 'carga' ? l.usadoComoCarga : uso === 'destino' ? l.usadoComoDestino : true) ? 0 : 1);
  const empieza = (l) => (q && l.nombreNormalizado.startsWith(q) ? 0 : 1);
  return sirven.sort((a, b) => empieza(a) - empieza(b) || delUso(a) - delUso(b) || (b.vecesUsado || 0) - (a.vecesUsado || 0) || a.nombre.localeCompare(b.nombre)).slice(0, max);
}

// ---------------------------------------------------------------- carga
// Devuelve el primer problema encontrado (texto que dice qué corregir) o null si todo está bien
export function errorProductos(productos) {
  if (!Array.isArray(productos) || !productos.length) return 'Agrega al menos un producto con sus galones y su número de guía.';
  if (productos.length > MAX_PRODUCTOS) return `Un viaje lleva máximo ${MAX_PRODUCTOS} productos.`;
  const vistos = new Set();
  for (const p of productos) {
    if (!PRODUCTOS.some((x) => x.id === p.producto)) return 'Elige el producto: Diésel, Súper o Ecopaís.';
    if (vistos.has(p.producto)) return `${nombreProducto(p.producto)} está repetido. Cada producto va una sola vez por viaje.`;
    vistos.add(p.producto);
    if (!Number.isInteger(p.galones) || p.galones <= 0) return `Escribe los galones de ${nombreProducto(p.producto)} como número entero mayor a cero.`;
    if (!String(p.numeroGuia ?? '').trim()) return `Escribe el número de guía de ${nombreProducto(p.producto)}.`;
  }
  return null;
}
export const volumenTotal = (productos) => (productos || []).reduce((s, p) => s + (Number(p.galones) || 0), 0);

// ---------------------------------------------------------------- viaje
export function errorSalida(v, hoy = hoyEcuador()) {
  if (!fechaValida(v.fechaSalida)) return 'Indica la fecha de salida.';
  if (v.fechaSalida > hoy) return 'La fecha de salida no puede ser futura. Elige hoy o un día anterior.';
  if (!horaValida(v.horaSalida)) return 'Indica la hora de salida (por ejemplo 06:30).';
  if (!limpiarNombre(v.origen)) return 'Escribe el lugar de carga.';
  if (!limpiarNombre(v.destino)) return 'Escribe el destino final.';
  if (!Number.isInteger(v.kmSalida) || v.kmSalida < 0) return 'Escribe el kilometraje de salida que marca el tablero.';
  return null;
}

export function errorCierre(v, hoy = hoyEcuador()) {
  if (!Number.isInteger(v.kmLlegada)) return 'Escribe el kilometraje de llegada que marca el tablero.';
  if (v.kmLlegada <= v.kmSalida) {
    return `El km de llegada (${miles(v.kmLlegada)}) debe ser mayor al de salida (${miles(v.kmSalida)}). Revisa el número del tablero y corrígelo.`;
  }
  if (!fechaValida(v.fechaRetorno)) return 'Indica la fecha de retorno.';
  if (v.fechaRetorno > hoy) return 'La fecha de retorno no puede ser futura.';
  if (!horaValida(v.horaRetorno)) return 'Indica la hora de retorno (por ejemplo 18:45).';
  if (instante(v.fechaRetorno, v.horaRetorno) < instante(v.fechaSalida, v.horaSalida)) return 'El retorno no puede ser antes de la salida. Revisa la fecha y la hora.';
  return null;
}

// Solo un viaje abierto por vehículo
export const viajeAbierto = (viajes, cabezalId) => viajes.find((v) => v.activo !== false && v.estado === 'abierto' && (!cabezalId || v.cabezalId === cabezalId)) || null;
export const horasAbierto = (v, ahora = new Date()) => (ahora - instante(v.fechaSalida, v.horaSalida)) / 3600000;
export const pideRecordatorio = (v, ahora = new Date()) => v.estado === 'abierto' && horasAbierto(v, ahora) > HORAS_RECORDATORIO;

// ¿El km de llegada mueve el odómetro? Solo si supera al actual (un viaje atrasado no lo baja)
export const actualizaOdometro = (kmLlegada, kmActual) => Number.isInteger(kmLlegada) && (kmActual === null || kmActual === undefined || kmLlegada > kmActual);

export const kmRecorridos = (v) => (Number.isInteger(v.kmLlegada) && Number.isInteger(v.kmSalida) ? Math.max(0, v.kmLlegada - v.kmSalida) : 0);
export const galonesTanqueados = (tanqueos, viajeId) => tanqueos.filter((t) => t.activo !== false && t.viajeId === viajeId).reduce((s, t) => s + (Number(t.galones) || 0), 0);
// Rendimiento: se calcula y se guarda, pero no se muestra en el reporte
export const kmPorGalon = (km, galones) => (km > 0 && galones > 0 ? Math.round((km / galones) * 100) / 100 : null);

// ---------------------------------------------------------------- mensaje para copiar
const rellenar = (texto, datos) => texto.replace(/\{(\w+)\}/g, (_, k) => (datos[k] ?? ''));
export function mensajeViaje(v, tanqueos = []) {
  const productos = (v.productos || []).map((p) => rellenar(LINEA_PRODUCTO, { producto: nombreProducto(p.producto), galones: miles(p.galones), guia: p.numeroGuia })).join('\n');
  return rellenar(PLANTILLA_VIAJE, {
    fecha: v.fechaSalida, carga: v.origen, destino: v.destino, productos,
    km_salida: miles(v.kmSalida), km_llegada: Number.isInteger(v.kmLlegada) ? miles(v.kmLlegada) : 'en viaje',
    tanqueos: miles(galonesTanqueados(tanqueos, v.id)),
  });
}

// ---------------------------------------------------------------- tanqueo
export function errorTanqueo(t, ahora = new Date()) {
  if (!fechaValida(t.fecha) || !horaValida(t.hora)) return 'Indica la fecha y la hora del tanqueo.';
  if (instante(t.fecha, t.hora) > new Date(ahora.getTime() + 5 * 60000)) return 'La fecha y hora del tanqueo no pueden ser futuras.';
  if (!(Number(t.galones) > 0)) return 'Escribe cuántos galones tanqueaste (un número mayor a cero).';
  return null;
}
