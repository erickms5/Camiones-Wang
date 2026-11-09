// Consultas de solo lectura sobre los datos guardados en el teléfono.
import { db } from './store.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const unidad = (id) => db().unidades.find((u) => u.id === id);
export const activas = () => db().unidades.filter((u) => u.activa);
export const conductor = (id) => db().conductores.find((c) => c.id === id);
export const nombreUnidad = (u) => [u.marca, u.modelo, u.anio].filter(Boolean).join(' ');
export const acopleActivo = (id) => db().acoplamientos.find((a) => !a.hasta && (a.cabezal_id === id || a.remolque_id === id));
export function pareja(id) {
  const a = acopleActivo(id);
  return a ? unidad(a.cabezal_id === id ? a.remolque_id : a.cabezal_id) : null;
}
export const asignacionActiva = (id) => db().asignaciones.find((a) => !a.hasta && a.unidad_id === id);
export const conductorDe = (id) => {
  const a = asignacionActiva(id);
  return a ? conductor(a.conductor_id) : null;
};
export const lecturasKm = (id) => db().odometro.filter((o) => o.unidad_id === id).sort((a, b) => b.registrado_en.localeCompare(a.registrado_en));
export const compartimentosDe = (id) => db().componentes.filter((c) => c.unidad_id === id && c.tipo === 'compartimento' && c.activo).sort((a, b) => a.orden - b.orden);
export const unidadesDeConductor = (cid) => db().asignaciones.filter((a) => !a.hasta && a.conductor_id === cid).map((a) => unidad(a.unidad_id)).filter((u) => u?.activa);
export const conductorYo = () => db().conductores.find((c) => c.esUsuario);

export function kmDe(u) {
  if (u.rol === 'cabezal') return { km: lecturasKm(u.id)[0]?.km, desde: null };
  const cab = pareja(u.id);
  return cab ? { km: lecturasKm(cab.id)[0]?.km, desde: cab } : { km: undefined, desde: null };
}
export const intervalosDe = (id) => db().intervalos.filter((x) => x.unidad_id === id).sort((a, b) => a.orden - b.orden);
export const componentesDe = (id) => db().componentes.filter((c) => c.unidad_id === id && c.tipo === 'general' && c.activo).sort((a, b) => a.orden - b.orden);
