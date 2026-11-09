// Almacenamiento local (funciona sin conexión). Los identificadores se generan en el cliente
// para que una futura sincronización con el servidor no duplique registros (sección 14).
const CLAVE = 'registro-unidades-v1';

const vacio = () => ({
  version: 2,
  usuario: { id: 'usuario-local', nombre: '', telefono: '' },
  unidades: [],
  componentes: [],
  odometro: [],
  intervalos: [],
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
    if (migrar(cache)) guardar();
  }
  return cache;
}

// v1 → v2: quita los datos de ejemplo que cargaba la primera versión del prototipo.
function migrar(d) {
  if ((d.version || 1) >= 2) return false;
  const ejemplo = d.unidades.filter(
    (u) => (u.placa === 'PCX-2020' && u.atributos?.km_inicial === 845300) || (u.placa === 'PTQ-1010' && u.modelo === 'Tanquero 10.000 gal'),
  );
  const ids = new Set(ejemplo.map((u) => u.id));
  d.unidades = d.unidades.filter((u) => !ids.has(u.id));
  d.componentes = d.componentes.filter((c) => !ids.has(c.unidad_id));
  d.odometro = d.odometro.filter((o) => !ids.has(o.unidad_id));
  d.asignaciones = d.asignaciones.filter((a) => !ids.has(a.unidad_id));
  d.acoplamientos = d.acoplamientos.filter((a) => !ids.has(a.cabezal_id) && !ids.has(a.remolque_id));
  d.auditoria = d.auditoria.filter((a) => !ids.has(a.entidad_id));
  const enUso = new Set(d.asignaciones.map((a) => a.conductor_id));
  d.conductores = d.conductores.filter((c) => !(c.esUsuario && c.nombre === 'Juan Pérez' && c.cedula === '1710034065' && !enUso.has(c.id)));
  if (d.usuario?.nombre === 'Juan Pérez' && d.usuario?.telefono === '+593991234567') Object.assign(d.usuario, { nombre: '', telefono: '' });
  d.intervalos ??= [];
  d.borrador = null;
  d.version = 2;
  return true;
}

// Usa un conjunto de datos en memoria (sin tocar el almacenamiento), p. ej. para la vista 3D de la demo.
export function usarDatos(d) {
  cache = d;
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
