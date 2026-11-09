// Almacenamiento local (funciona sin conexión). Los identificadores se generan en el cliente
// para que una futura sincronización con el servidor no duplique registros (sección 14).
const CLAVE = 'registro-unidades-v1';

const vacio = () => ({
  version: 1,
  usuario: { id: 'usuario-local', nombre: 'Juan Pérez', telefono: '+593991234567' },
  unidades: [],
  componentes: [],
  odometro: [],
  conductores: [],
  asignaciones: [],
  acoplamientos: [],
  auditoria: [],
  borrador: null,
});

let cache = null;

export function db() {
  if (!cache) {
    try {
      cache = JSON.parse(localStorage.getItem(CLAVE)) || vacio();
    } catch {
      cache = vacio();
    }
  }
  return cache;
}

export function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(cache));
  } catch (e) {
    console.warn('No se pudo guardar', e);
  }
  window.dispatchEvent(new CustomEvent('guardado'));
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export const ahora = () => new Date().toISOString();

export function auditar(accion, entidad, entidadId, detalle = '') {
  const a = db().auditoria;
  a.unshift({ id: uid(), accion, entidad, entidad_id: entidadId, detalle, en: ahora() });
  if (a.length > 300) a.length = 300;
}

export function resetear() {
  cache = vacio();
  guardar();
}
