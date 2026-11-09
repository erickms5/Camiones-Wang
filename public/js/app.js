import { T, miles } from './textos.js';
import { CONFIG, DECISIONES } from './config.js';
import { plantilla, plantillasPorRol, CATALOGO, ICONOS } from './plantillas.js';
import * as V from './validaciones.js';
import { db, guardar, uid, auditar, resetear, ahora } from './store.js';

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoy = () => new Date().toISOString().slice(0, 10);
const fecha = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const anioMax = () => new Date().getFullYear() + 1;

// ---------------------------------------------------------------- consultas
const unidad = (id) => db().unidades.find((u) => u.id === id);
const activas = () => db().unidades.filter((u) => u.activa);
const conductor = (id) => db().conductores.find((c) => c.id === id);
const nombreUnidad = (u) => [u.marca, u.modelo, u.anio].filter(Boolean).join(' ');
const acopleActivo = (id) => db().acoplamientos.find((a) => !a.hasta && (a.cabezal_id === id || a.remolque_id === id));
function pareja(id) {
  const a = acopleActivo(id);
  return a ? unidad(a.cabezal_id === id ? a.remolque_id : a.cabezal_id) : null;
}
const asignacionActiva = (id) => db().asignaciones.find((a) => !a.hasta && a.unidad_id === id);
const conductorDe = (id) => {
  const a = asignacionActiva(id);
  return a ? conductor(a.conductor_id) : null;
};
const lecturasKm = (id) => db().odometro.filter((o) => o.unidad_id === id).sort((a, b) => b.registrado_en.localeCompare(a.registrado_en));
const compartimentosDe = (id) => db().componentes.filter((c) => c.unidad_id === id && c.tipo === 'compartimento' && c.activo).sort((a, b) => a.orden - b.orden);
const unidadesDeConductor = (cid) => db().asignaciones.filter((a) => !a.hasta && a.conductor_id === cid).map((a) => unidad(a.unidad_id)).filter((u) => u?.activa);
const conductorYo = () => db().conductores.find((c) => c.esUsuario);

function kmDe(u) {
  if (u.rol === 'cabezal') return { km: lecturasKm(u.id)[0]?.km, desde: null };
  const cab = pareja(u.id);
  return cab ? { km: lecturasKm(cab.id)[0]?.km, desde: cab } : { km: undefined, desde: null };
}

// ---------------------------------------------------------------- piezas de interfaz
function placaHTML(p, grande = false) {
  return `<span class="placa ${grande ? 'placa-grande' : ''}"><span class="placa-pais">ECUADOR</span>${esc(p || '———')}</span>`;
}

function opcion(bind, valor, actual, titulo, sub = '', icono = '') {
  const sel = actual === valor;
  return `<button type="button" class="opcion ${sel ? 'sel' : ''} ${icono ? 'con-icono' : ''}" aria-pressed="${sel}" data-accion="elegir" data-bind="${bind}" data-valor="${esc(valor)}">
    ${icono ? `<span class="opcion-icono">${icono}</span>` : ''}
    <span class="opcion-texto"><strong>${titulo}</strong>${sub ? `<small>${sub}</small>` : ''}</span>
    <span class="marca-check" aria-hidden="true"></span>
  </button>`;
}

function campoNumero(key, bind, etiqueta, valor, { min = 0, max, delta = 1, unidad = '', ayuda = '', opcional = false, vista = false, inicio } = {}) {
  return `<div class="campo">
    <label for="f-${key}">${etiqueta}${opcional ? ' <span class="opcional">(opcional)</span>' : ''}</label>
    <div class="stepper">
      <button type="button" class="btn-paso" data-accion="paso-num" data-target="f-${key}" data-delta="-${delta}" data-min="${min}" ${inicio !== undefined ? `data-inicio="${inicio}"` : ''} aria-label="Restar ${miles(delta)}">−</button>
      <input id="f-${key}" class="input" inputmode="numeric" autocomplete="off" data-bind="${bind}" data-entero="1" ${vista ? 'data-vista="1"' : ''} value="${esc(valor ?? '')}" aria-describedby="e-${key}${ayuda ? ` a-${key}` : ''}">
      <button type="button" class="btn-paso" data-accion="paso-num" data-target="f-${key}" data-delta="${delta}" ${max !== undefined ? `data-max="${max}"` : ''} ${inicio !== undefined ? `data-inicio="${inicio}"` : ''} aria-label="Sumar ${miles(delta)}">+</button>
      ${unidad ? `<span class="unidad">${unidad}</span>` : ''}
    </div>
    ${vista ? `<p class="vista-numero" id="v-${key}" aria-live="polite">${valor ? `Se leerá: <strong>${miles(valor)} ${unidad}</strong>` : ''}</p>` : ''}
    ${ayuda ? `<p class="ayuda" id="a-${key}">${ayuda}</p>` : ''}
    <p class="error" id="e-${key}"></p>
  </div>`;
}

function campoTexto(key, bind, etiqueta, valor, { ayuda = '', opcional = false, extra = '', chips = '' } = {}) {
  return `<div class="campo">
    <label for="f-${key}">${etiqueta}${opcional ? ' <span class="opcional">(opcional)</span>' : ''}</label>
    <input id="f-${key}" class="input" data-bind="${bind}" value="${esc(valor ?? '')}" autocomplete="off" ${extra} aria-describedby="e-${key}${ayuda ? ` a-${key}` : ''}">
    ${chips}
    ${ayuda ? `<p class="ayuda" id="a-${key}">${ayuda}</p>` : ''}
    <p class="error" id="e-${key}"></p>
  </div>`;
}

function campoPlantilla(c, valor) {
  const key = `attr-${c.id}`;
  const bind = `atributos.${c.id}`;
  const opcional = !c.requerido;
  if (c.tipo === 'numero') return campoNumero(key, bind, c.etiqueta, valor, { min: c.min ?? 0, max: c.max, unidad: c.unidad || '', ayuda: c.ayuda, opcional, vista: (c.max ?? 1e9) > 9999, delta: c.unidad === 'km' ? 1000 : 1 });
  if (c.tipo === 'texto') return campoTexto(key, bind, c.etiqueta, valor, { ayuda: c.ayuda, opcional, extra: `maxlength="${c.max ?? 80}"` });
  if (c.tipo === 'placa') return campoTexto(key, bind, c.etiqueta, valor, { ayuda: c.ayuda, opcional, extra: 'autocapitalize="characters" spellcheck="false" maxlength="9"' });
  const opciones = c.tipo === 'sino' ? [['si', 'Sí'], ['no', 'No']] : c.opciones.map((o) => [o, o]);
  return `<fieldset class="campo" id="f-${key}" tabindex="-1">
    <legend>${c.etiqueta}${opcional ? ' <span class="opcional">(opcional)</span>' : ''}</legend>
    ${c.ayuda ? `<p class="ayuda">${c.ayuda}</p>` : ''}
    <div class="opciones ${c.tipo === 'sino' ? 'opciones-2' : ''}">${opciones.map(([v, t]) => opcion(bind, v, valor, t)).join('')}</div>
    <p class="error" id="e-${key}"></p>
  </fieldset>`;
}

function chips(bind, lista, actual) {
  if (!lista.length) return '';
  return `<div class="chips" role="group" aria-label="Sugerencias">${lista.map((m) => `<button type="button" class="chip ${m === actual ? 'sel' : ''}" data-accion="elegir" data-bind="${bind}" data-valor="${esc(m)}">${esc(m)}</button>`).join('')}</div>`;
}

function valorAtributo(c, v) {
  if (v === undefined || v === null || v === '') return '';
  if (c.tipo === 'sino') return v === 'si' ? 'Sí' : 'No';
  if (c.tipo === 'numero') return `${miles(v)}${c.unidad ? ' ' + c.unidad : ''}`;
  return v;
}

// Dibujo lateral del tanque, dividido en proporción a los galones (RF-24).
function svgTanque(total, comps, { activo = -1 } = {}) {
  const x0 = 24, x1 = 384, y0 = 26, h = 80, ancho = x1 - x0;
  const gal = comps.map((c) => V.aEntero(c.galones) || 0);
  const asignado = gal.reduce((a, b) => a + b, 0);
  const t = V.aEntero(total) || 0;
  const base = Math.max(t, asignado, 1);
  const sobra = t > 0 && asignado > t;
  const id = 'c' + Math.random().toString(36).slice(2, 8);
  let x = x0;
  const partes = gal.map((g, i) => {
    const w = (ancho * g) / base;
    const p = { x, w, g, i };
    x += w;
    return p;
  });
  const libreX = x, libreW = x1 - x;
  const desc = `Tanque de ${miles(t)} galones con ${comps.length} compartimento${comps.length === 1 ? '' : 's'}: ${gal.map(miles).join(', ')} galones`;
  const rect = (p) => `<rect x="${p.x}" y="${y0}" width="${p.w}" height="${h}" class="t-comp ${p.i % 2 ? 't-b' : 't-a'} ${p.i === activo ? 't-activo' : ''}" data-i="${p.i}"/>`;
  const etiqueta = (p) => {
    const cx = p.x + p.w / 2;
    const cls = p.i === activo ? 't-txt t-txt-activo' : 't-txt';
    let s = '';
    if (p.w >= 22) s += `<text x="${cx}" y="${y0 + 36}" class="${cls} t-num">${p.i + 1}</text>`;
    if (p.w >= 50) s += `<text x="${cx}" y="${y0 + 62}" class="${cls} t-gal">${miles(p.g)}</text>`;
    return s;
  };
  return `<svg viewBox="0 0 400 168" class="svg-tanque" role="img" aria-label="${esc(desc)}">
    <defs>
      <clipPath id="${id}"><rect x="${x0}" y="${y0}" width="${ancho}" height="${h}" rx="40"/></clipPath>
      <pattern id="${id}r" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" class="t-libre"/><line x1="0" y1="0" x2="0" y2="12" class="t-raya"/></pattern>
    </defs>
    ${partes.filter((p) => p.w > 0).map((p) => `<rect x="${p.x + p.w / 2 - 12}" y="${y0 - 10}" width="24" height="11" rx="3" class="t-boca"/>`).join('')}
    <rect x="12" y="110" width="376" height="8" rx="2" class="t-chasis"/>
    <rect x="40" y="116" width="10" height="9" class="t-chasis"/>
    <rect x="128" y="116" width="7" height="30" class="t-chasis"/><rect x="120" y="144" width="23" height="5" rx="2" class="t-chasis"/>
    ${[290, 324, 358].map((cx) => `<circle cx="${cx}" cy="136" r="15" class="t-rueda"/><circle cx="${cx}" cy="136" r="6" class="t-cubo"/>`).join('')}
    <g clip-path="url(#${id})">
      <rect x="${x0}" y="${y0}" width="${ancho}" height="${h}" fill="url(#${id}r)"/>
      ${partes.map(rect).join('')}
      ${partes.slice(1).map((p) => `<line x1="${p.x}" y1="${y0}" x2="${p.x}" y2="${y0 + h}" class="t-divisor"/>`).join('')}
    </g>
    <rect x="${x0}" y="${y0}" width="${ancho}" height="${h}" rx="40" class="t-borde ${sobra ? 't-borde-mal' : ''}"/>
    ${partes.map(etiqueta).join('')}
    ${libreW > 70 && t > 0 && asignado < t ? `<text x="${libreX + libreW / 2}" y="${y0 + 49}" class="t-txt-libre">Sin asignar</text>` : ''}
  </svg>`;
}

// ---------------------------------------------------------------- modal y avisos
const dialogo = document.getElementById('dialogo');
function modal({ titulo, texto = '', botones }) {
  return new Promise((res) => {
    dialogo.innerHTML = `<form method="dialog">
      <h2>${titulo}</h2>
      ${texto ? `<div class="dlg-texto">${texto}</div>` : ''}
      <div class="dlg-botones">${botones.map((b, i) => `<button class="btn ${b.clase || 'btn-secundario'}" value="${i}">${b.texto}</button>`).join('')}</div>
    </form>`;
    // Se resuelve con el clic del botón (no se depende solo del evento "close").
    let listo = false;
    const fin = (v) => {
      if (listo) return;
      listo = true;
      if (dialogo.open) dialogo.close();
      res(v);
    };
    dialogo.querySelectorAll('.dlg-botones button').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        fin(botones[Number(b.value)].valor);
      }),
    );
    dialogo.onclose = null;
    dialogo.oncancel = () => fin(null); // tecla Esc o botón atrás
    dialogo.showModal();
    dialogo.querySelector('input')?.focus();
  });
}
const confirmar = (titulo, texto, si = 'Sí, continuar', clase = 'btn-primario') =>
  modal({ titulo, texto, botones: [{ texto: si, valor: true, clase }, { texto: 'No, volver', valor: false }] });

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = '✓ ' + msg;
  el.classList.add('ver');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('ver'), 2600);
}

function estadoConexion() {
  const el = document.getElementById('estado');
  const online = navigator.onLine;
  el.className = 'estado ' + (online ? 'en-linea' : 'sin-linea');
  el.innerHTML = online ? `<span aria-hidden="true">●</span> ${T.app.guardado}` : `<span aria-hidden="true">●</span> ${T.app.sinInternet} · ${T.app.guardado.toLowerCase()}`;
}
window.addEventListener('online', estadoConexion);
window.addEventListener('offline', estadoConexion);
window.addEventListener('guardado', () => {
  const el = document.getElementById('estado');
  el.classList.remove('pulso');
  void el.offsetWidth;
  el.classList.add('pulso');
});

// ---------------------------------------------------------------- rutas
const ruta = () => {
  const [v, id] = location.hash.replace(/^#\/?/, '').split('/');
  return { v: v || 'inicio', id };
};
const ir = (h) => {
  if (location.hash === h) render();
  else location.hash = h;
};
window.addEventListener('hashchange', () => render());

function render() {
  const { v, id } = ruta();
  document.body.classList.toggle('en-registro', v === 'registro');
  if (v === 'registro') return renderRegistro();
  const vistas = { inicio: vistaInicio, unidad: vistaUnidad, conductores: vistaConductores, conductor: vistaConductor, cuenta: vistaCuenta };
  app.innerHTML = (vistas[v] || vistaInicio)(id);
  window.scrollTo(0, 0);
  app.querySelector('h1')?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- inicio
function tarjetaUnidad(u) {
  const p = plantilla(u.tipo_unidad_id);
  const par = pareja(u.id);
  const c = conductorDe(u.id);
  let dato = '';
  if (u.rol === 'cabezal') {
    const km = lecturasKm(u.id)[0]?.km;
    dato = km !== undefined ? `${miles(km)} km` : 'Sin kilometraje';
  } else if (p?.tanque) {
    dato = `${miles(u.atributos.capacidad_galones)} gal · ${compartimentosDe(u.id).length} compartimentos`;
  }
  return `<a class="tarjeta tarjeta-unidad" href="#/unidad/${u.id}">
    <span class="tu-icono">${ICONOS[u.tipo_unidad_id] || ICONOS.otro}</span>
    <span class="tu-info">
      ${placaHTML(u.placa)}
      <strong>${u.rol === 'cabezal' ? 'Cabezal' : p?.nombre || 'Remolque'} · ${esc(nombreUnidad(u))}</strong>
      ${dato ? `<span>${dato}</span>` : ''}
      <span class="tu-meta">${par ? `Enganchado con ${esc(par.placa)}` : u.rol === 'remolque' ? '<span class="aviso-txt">Sin cabezal: no tendrá km</span>' : 'Sin remolque'}${c ? ` · ${esc(c.nombre)}` : ''}</span>
    </span>
    <span class="tu-flecha" aria-hidden="true">›</span>
  </a>`;
}

function vistaInicio() {
  const D = db();
  const lista = activas();
  const bajas = D.unidades.filter((u) => !u.activa);
  const b = D.borrador;
  const sinConductor = lista.filter((u) => !conductorDe(u.id));
  let html = `<h1 tabindex="-1">Mis unidades</h1>`;
  if (b) {
    const pasos = pasosDe(b.datos);
    html += `<div class="tarjeta banner">
      <p><strong>${b.editandoId ? 'Tiene cambios sin guardar' : 'Tiene un registro sin terminar'}</strong>${b.datos.placa ? ` (${esc(b.datos.placa)})` : ''}. Quedó en el paso ${pasos.indexOf(b.paso) + 1} de ${pasos.length}.</p>
      <div class="fila-botones"><button class="btn btn-primario" data-accion="continuar-registro">Continuar</button><button class="btn btn-secundario" data-accion="descartar-borrador">Descartar</button></div>
    </div>`;
  }
  if (!lista.length) {
    html += `<div class="vacio">
      ${ICONOS.cabezal}
      <p class="lead">Todavía no hay unidades registradas.</p>
      <p>Empiece por la placa del cabezal o del remolque.</p>
    </div>`;
  } else {
    html += `<div class="lista">${lista.map(tarjetaUnidad).join('')}</div>`;
    sinConductor.forEach((u) => {
      html += `<p class="recordatorio">La unidad <strong>${esc(u.placa)}</strong> no tiene conductor. <a href="#/unidad/${u.id}">Asignar</a></p>`;
    });
  }
  html += `<div class="acciones-inicio">
    <button class="btn btn-primario btn-bloque" data-accion="nuevo-registro">＋ Registrar unidad</button>
    ${!lista.length ? `<button class="btn btn-secundario btn-bloque" data-accion="cargar-ejemplo">Ver ejemplo: Freightliner Columbia 2020 + tanquero</button>` : ''}
    <a class="btn btn-secundario btn-bloque" href="#/conductores">Conductores</a>
    <a class="btn btn-secundario btn-bloque" href="#/cuenta">Mi cuenta y ajustes</a>
  </div>`;
  if (bajas.length) {
    html += `<details class="bajas"><summary>Unidades dadas de baja (${bajas.length})</summary>
      ${bajas.map((u) => `<div class="fila-baja">${placaHTML(u.placa)} <span>${esc(nombreUnidad(u))}</span><button class="btn btn-secundario btn-chico" data-accion="reactivar" data-id="${u.id}">Reactivar</button></div>`).join('')}
    </details>`;
  }
  return html;
}

// ---------------------------------------------------------------- detalle de unidad
function vistaUnidad(id) {
  const u = unidad(id);
  if (!u) return `<a class="volver" href="#/">‹ Mis unidades</a><h1 tabindex="-1">No se encontró la unidad</h1>`;
  const p = plantilla(u.tipo_unidad_id);
  const par = pareja(u.id);
  const ac = acopleActivo(u.id);
  const c = conductorDe(u.id);
  const comps = compartimentosDe(u.id);
  const km = kmDe(u);
  const generales = [
    ['Tipo', u.rol === 'cabezal' ? 'Cabezal (tractocamión)' : `Remolque · ${p?.nombre}`],
    ['Marca', u.marca], ['Modelo', u.modelo], ['Año', u.anio],
    ['Ejes', u.num_ejes], ['Llantas', u.num_llantas],
    ...(p?.campos || []).filter((f) => f.id !== 'km_inicial').map((f) => [f.etiqueta, valorAtributo(f, u.atributos[f.id])]).filter(([, v]) => v !== ''),
  ];
  const historial = db().auditoria.filter((a) => a.entidad_id === u.id).slice(0, 6);
  return `<a class="volver" href="#/">‹ Mis unidades</a>
  <div class="cabecera-unidad">
    <span class="tu-icono grande">${ICONOS[u.tipo_unidad_id] || ICONOS.otro}</span>
    <div>${placaHTML(u.placa, true)}<h1 tabindex="-1">${esc(nombreUnidad(u))}</h1>${!u.activa ? '<span class="insignia">Dada de baja</span>' : ''}</div>
  </div>

  <section class="tarjeta">
    <h2>Kilometraje</h2>
    ${u.rol === 'cabezal'
      ? `<p class="numero-grande">${km.km !== undefined ? miles(km.km) + ' km' : '—'}</p>
         ${lecturasKm(u.id)[0] ? `<p class="ayuda">Registrado el ${fecha(lecturasKm(u.id)[0].registrado_en)} · fuente: manual</p>` : ''}
         <button class="btn btn-primario btn-bloque" data-accion="registrar-km" data-id="${u.id}">Registrar kilometraje</button>`
      : km.desde
        ? `<p class="numero-grande">${km.km !== undefined ? miles(km.km) + ' km' : '—'}</p><p class="ayuda">Se usa el km del cabezal ${esc(km.desde.placa)}.</p>`
        : `<p class="aviso">${T.avisos.remolqueSinCabezal}</p>`}
  </section>

  ${p?.tanque ? `<section class="tarjeta">
    <h2>Tanque · ${miles(u.atributos.capacidad_galones)} galones</h2>
    ${u.atributos.placa_tanque ? `<p>Placa del tanque: ${placaHTML(u.atributos.placa_tanque)}</p>` : ''}
    ${svgTanque(u.atributos.capacidad_galones, comps.map((x) => ({ galones: x.capacidad_galones })))}
    <ol class="lista-simple">${comps.map((x) => `<li><span>Compartimento ${x.orden}${x.nombre ? ` · ${esc(x.nombre)}` : ''}</span><strong>${miles(x.capacidad_galones)} gal</strong></li>`).join('')}</ol>
    ${u.atributos.diferencia_aceptada ? `<p class="aviso">La suma de compartimentos no coincide con el total (aceptado al registrar).</p>` : ''}
  </section>` : ''}

  <section class="tarjeta">
    <h2>${u.rol === 'cabezal' ? 'Remolque enganchado' : 'Cabezal'}</h2>
    ${par ? `<p>${placaHTML(par.placa)} ${esc(nombreUnidad(par))}</p><p class="ayuda">Desde el ${fecha(ac.desde)}</p>` : `<p>Ninguno por ahora.</p>`}
    <div class="fila-botones">
      <button class="btn btn-secundario" data-accion="editar" data-id="${u.id}" data-paso="acople">${par ? 'Cambiar' : 'Enganchar'}</button>
      ${par ? `<button class="btn btn-secundario" data-accion="desacoplar" data-id="${u.id}">Desenganchar</button>` : ''}
    </div>
  </section>

  <section class="tarjeta">
    <h2>Conductor</h2>
    ${c ? `<p><strong>${esc(c.nombre)}</strong>${c.esUsuario ? ' (usted)' : ''}</p><p>Cédula ${V.mascaraCedula(c.cedula) || '—'} · ${V.formatoTelefono(c.telefono)}</p>` : `<p class="aviso">Sin conductor asignado.</p>`}
    <button class="btn btn-secundario" data-accion="editar" data-id="${u.id}" data-paso="conductor">${c ? 'Cambiar conductor' : 'Asignar conductor'}</button>
  </section>

  <section class="tarjeta">
    <h2>Datos</h2>
    <dl class="datos">${generales.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
  </section>

  <section class="tarjeta">
    <h2>Componentes</h2>
    <p class="ayuda">Partes a las que se les podrá registrar mantenimiento.</p>
    <ul class="etiquetas">${db().componentes.filter((x) => x.unidad_id === u.id && x.activo).sort((a, b) => (a.tipo === b.tipo ? a.orden - b.orden : a.tipo === 'general' ? -1 : 1)).map((x) => `<li>${x.tipo === 'compartimento' ? `Compartimento ${x.orden}` : esc(x.nombre)}</li>`).join('')}</ul>
  </section>

  <div class="acciones-inicio">
    <button class="btn btn-primario btn-bloque" data-accion="editar" data-id="${u.id}">Editar datos</button>
    ${u.activa ? `<button class="btn btn-peligro btn-bloque" data-accion="baja" data-id="${u.id}">Dar de baja</button>` : `<button class="btn btn-secundario btn-bloque" data-accion="reactivar" data-id="${u.id}">Reactivar</button>`}
  </div>
  ${historial.length ? `<section class="historial"><h2>Historial de cambios</h2><ul>${historial.map((h) => `<li><span>${fecha(h.en)}</span> ${esc(h.detalle || h.accion)}</li>`).join('')}</ul></section>` : ''}`;
}

// ---------------------------------------------------------------- conductores
function vistaConductores() {
  const lista = db().conductores;
  return `<a class="volver" href="#/">‹ Mis unidades</a>
  <h1 tabindex="-1">Conductores</h1>
  ${lista.length ? `<div class="lista">${lista.map((c) => {
    const us = unidadesDeConductor(c.id);
    return `<a class="tarjeta tarjeta-unidad" href="#/conductor/${c.id}">
      <span class="avatar" aria-hidden="true">${esc(c.nombre.trim()[0] || '?')}</span>
      <span class="tu-info"><strong>${esc(c.nombre)}${c.esUsuario ? ' (usted)' : ''}</strong>
      <span>Cédula ${V.mascaraCedula(c.cedula) || '—'} · ${V.formatoTelefono(c.telefono)}</span>
      <span class="tu-meta">${!c.activo ? '<span class="insignia">Inactivo</span> ' : ''}${us.length ? 'Maneja ' + us.map((u) => esc(u.placa)).join(', ') : 'Sin unidad asignada'}</span></span>
      <span class="tu-flecha" aria-hidden="true">›</span></a>`;
  }).join('')}</div>` : '<p class="lead">Todavía no hay conductores. Se agregan al registrar una unidad o aquí.</p>'}
  <div class="acciones-inicio"><a class="btn btn-primario btn-bloque" href="#/conductor/nuevo">＋ Nuevo conductor</a></div>`;
}

function formConductor(c = {}, { nuevo = true, pref = 'c' } = {}) {
  const cedulaHTML = !nuevo && c.cedula
    ? `<div class="campo" id="bloque-cedula"><span class="label">Cédula</span><p class="dato-fijo">${V.mascaraCedula(c.cedula)} <button type="button" class="btn btn-texto" data-accion="cambiar-cedula">Cambiar</button></p></div>`
    : `<div class="campo"><label for="f-${pref}-cedula">Cédula${CONFIG.cedulaObligatoria ? '' : ' <span class="opcional">(opcional)</span>'}</label>
       <input id="f-${pref}-cedula" class="input" inputmode="numeric" maxlength="10" autocomplete="off" data-bind="conductor.cedula" data-validar="cedula" value="${esc(nuevo ? c.cedula : '')}" aria-describedby="e-${pref}-cedula">
       <p class="ayuda">10 números, sin guion.</p><p class="error" id="e-${pref}-cedula"></p></div>`;
  return `
    ${campoTexto(`${pref}-nombre`, 'conductor.nombre', 'Nombre completo', c.nombre, { extra: 'autocomplete="name" maxlength="80" autocapitalize="words"' })}
    ${cedulaHTML}
    <div class="campo"><label for="f-${pref}-telefono">Celular</label>
      <input id="f-${pref}-telefono" class="input" type="tel" inputmode="tel" autocomplete="tel" data-bind="conductor.telefono" data-validar="telefono" value="${esc(c.telefono && c.telefono.startsWith('+') ? V.formatoTelefono(c.telefono) : c.telefono || '')}" aria-describedby="e-${pref}-telefono">
      <p class="ayuda">Ejemplo: 099 123 4567</p><p class="error" id="e-${pref}-telefono"></p></div>
    ${nuevo ? `<div class="campo"><label class="check-grande"><input type="checkbox" id="f-${pref}-consentimiento" data-bind="conductor.consentimiento" ${c.consentimiento ? 'checked' : ''}> <span>${T.consentimiento}</span></label><p class="error" id="e-${pref}-consentimiento"></p></div>` : ''}`;
}

function revisarConductor(c, { pref = 'c', excluirId = null, pedirCedula = true, pedirConsentimiento = true } = {}) {
  const errores = {};
  const n = V.validarNombre(c.nombre);
  if (n.error) errores[`${pref}-nombre`] = n.error; else c.nombre = n.valor;
  if (pedirCedula && (CONFIG.cedulaObligatoria || c.cedula)) {
    const r = V.validarCedula(c.cedula);
    if (r.error) errores[`${pref}-cedula`] = r.error;
    else {
      c.cedula = r.valor;
      const dup = db().conductores.find((x) => x.cedula === r.valor && x.id !== excluirId);
      if (dup) errores[`${pref}-cedula`] = T.cedula.duplicada(dup.nombre);
    }
  }
  const t = V.normalizarTelefono(c.telefono);
  if (t.error) errores[`${pref}-telefono`] = t.error; else c.telefono = t.valor;
  if (pedirConsentimiento && !c.consentimiento) errores[`${pref}-consentimiento`] = T.errores.consentimiento;
  return errores;
}

let edicionConductor = {};
function vistaConductor(id) {
  const nuevo = id === 'nuevo';
  const c = nuevo ? {} : conductor(id);
  if (!c) return `<a class="volver" href="#/conductores">‹ Conductores</a><h1 tabindex="-1">No se encontró el conductor</h1>`;
  edicionConductor = nuevo ? { consentimiento: false } : { ...c, cedula: '' };
  const us = nuevo ? [] : unidadesDeConductor(c.id);
  return `<a class="volver" href="#/conductores">‹ Conductores</a>
  <h1 tabindex="-1">${nuevo ? 'Nuevo conductor' : esc(c.nombre)}</h1>
  ${!nuevo && !c.activo ? '<p><span class="insignia">Inactivo</span></p>' : ''}
  <div class="form-conductor">${formConductor(c, { nuevo })}</div>
  ${us.length ? `<p class="ayuda">Maneja: ${us.map((u) => esc(u.placa)).join(', ')}</p>` : ''}
  <div class="acciones-inicio">
    <button class="btn btn-primario btn-bloque" data-accion="guardar-conductor" data-id="${esc(id)}">Guardar</button>
    ${!nuevo && !c.esUsuario ? `<button class="btn ${c.activo ? 'btn-peligro' : 'btn-secundario'} btn-bloque" data-accion="estado-conductor" data-id="${c.id}">${c.activo ? 'Desactivar conductor' : 'Activar conductor'}</button>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- cuenta
function vistaCuenta() {
  const u = db().usuario;
  edicionConductor = { nombre: u.nombre, telefono: V.formatoTelefono(u.telefono) };
  return `<a class="volver" href="#/">‹ Mis unidades</a>
  <h1 tabindex="-1">Mi cuenta</h1>
  <p class="ayuda">Si usted maneja la unidad, estos datos se llenan solos al registrar el conductor.</p>
  ${campoTexto('u-nombre', 'conductor.nombre', 'Su nombre', u.nombre, { extra: 'autocomplete="name"' })}
  <div class="campo"><label for="f-u-telefono">Su celular</label><input id="f-u-telefono" class="input" type="tel" inputmode="tel" data-bind="conductor.telefono" data-validar="telefono" value="${esc(V.formatoTelefono(u.telefono))}"><p class="error" id="e-u-telefono"></p></div>
  <button class="btn btn-primario btn-bloque" data-accion="guardar-cuenta">Guardar</button>

  <section class="tarjeta">
    <h2>Decisiones por confirmar con el cliente</h2>
    <dl class="decisiones">${DECISIONES.map((d) => `<div><dt>${d.id} · ${d.pregunta}</dt><dd>En el prototipo: ${d.prototipo}</dd></div>`).join('')}</dl>
  </section>

  <section class="tarjeta">
    <h2>Sobre este prototipo</h2>
    <p>Los datos se guardan solo en este teléfono o navegador y funcionan sin internet. La sincronización con un servidor, el cifrado de la cédula y los mantenimientos llegan en la siguiente fase.</p>
    <div class="fila-botones">
      <button class="btn btn-secundario" data-accion="cargar-ejemplo">Cargar ejemplo</button>
      <button class="btn btn-peligro" data-accion="borrar-todo">Borrar todos los datos</button>
    </div>
  </section>`;
}

// ---------------------------------------------------------------- asistente de registro
function candidatosAcople(d) {
  const rolOtro = d.rol === 'cabezal' ? 'remolque' : 'cabezal';
  const b = db().borrador;
  return activas().filter((u) => u.rol === rolOtro && u.id !== b?.editandoId);
}

function pasosDe(d) {
  const p = ['placa', 'tipo', 'generales', 'especificos'];
  if (plantilla(d.tipo)?.tanque) p.push('tanque');
  if (d.rol && (candidatosAcople(d).length || (d.acoplarCon && d.acoplarCon !== 'ninguno'))) p.push('acople');
  p.push('conductor', 'resumen');
  return p;
}

function aplicarDefectos(d) {
  const p = plantilla(d.tipo);
  if (!p) return;
  if (!d.generalesEditados) Object.assign(d, p.defectos);
}

const PASOS = {
  placa: {
    titulo: () => T.pasos.placa.titulo,
    ayuda: () => T.pasos.placa.ayuda,
    html: (b) => `<div class="campo">
      <label for="f-placa">Placa</label>
      <input id="f-placa" class="input input-placa" data-bind="placa" value="${esc(b.datos.placa ?? '')}" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" aria-describedby="a-placa e-placa">
      <p class="ayuda" id="a-placa">Ejemplo: ABC-1234 o ABC-123. Puede escribirla con o sin guion.</p>
      <div class="vista-previa" id="prev-placa" aria-live="polite">${vistaPlaca(b.datos.placa)}</div>
      <p class="error" id="e-placa"></p>
    </div>`,
    revisar(b) {
      const d = b.datos;
      const r = V.normalizarPlaca(d.placa);
      if (r.error) return { errores: { placa: r.error } };
      const dup = db().unidades.find((u) => u.placa === r.valor && u.id !== b.editandoId);
      if (dup) return { errores: { placa: dup.activa ? T.placa.duplicada(r.valor) : T.placa.duplicadaBaja(r.valor) } };
      d.placa = r.valor;
      return { errores: {} };
    },
  },

  tipo: {
    titulo: () => T.pasos.tipo.titulo,
    html: (b) => {
      const d = b.datos;
      return `<fieldset class="campo" id="f-rol" tabindex="-1"><legend>Esta unidad es…</legend>
        <div class="opciones">
          ${opcion('rol', 'cabezal', d.rol, 'Cabezal', 'El camión con motor (tractocamión)', ICONOS.cabezal)}
          ${opcion('rol', 'remolque', d.rol, 'Remolque', 'La parte que se arrastra: tanque, plataforma o furgón', ICONOS.remolque)}
        </div><p class="error" id="e-rol"></p></fieldset>
        ${d.rol === 'remolque' ? `<fieldset class="campo" id="f-tipo" tabindex="-1"><legend>¿Qué tipo de remolque?</legend>
          <div class="opciones opciones-2">${plantillasPorRol('remolque').map((p) => opcion('tipo', p.id, d.tipo, p.nombre, p.descripcion, ICONOS[p.id])).join('')}</div>
          <p class="error" id="e-tipo"></p></fieldset>` : ''}`;
    },
    alElegir(d, bind, valor) {
      if (bind === 'rol') {
        if (valor === 'cabezal') d.tipo = 'tracto';
        else if (plantilla(d.tipo)?.rol !== 'remolque') d.tipo = null;
        d.acoplarCon = null;
      }
      aplicarDefectos(d);
    },
    revisar(b) {
      const d = b.datos;
      if (!d.rol) return { errores: { rol: T.errores.elegirRol } };
      if (!plantilla(d.tipo)) return { errores: { tipo: T.errores.elegirTipo } };
      return { errores: {} };
    },
  },

  generales: {
    titulo: () => T.pasos.generales.titulo,
    ayuda: () => T.pasos.generales.ayuda,
    html: (b) => {
      const d = b.datos;
      const cat = CATALOGO[d.rol] || {};
      const lim = limitesGenerales(d);
      return `
        ${campoTexto('marca', 'marca', 'Marca', d.marca, { extra: 'maxlength="40" autocapitalize="words"', chips: chips('marca', Object.keys(cat), d.marca) })}
        ${campoTexto('modelo', 'modelo', 'Modelo', d.modelo, { extra: 'maxlength="40"', chips: chips('modelo', cat[d.marca] || [], d.modelo) })}
        ${campoNumero('anio', 'anio', 'Año', d.anio, { min: CONFIG.anioMin, max: anioMax(), inicio: new Date().getFullYear() })}
        ${campoNumero('num_ejes', 'num_ejes', 'Número de ejes', d.num_ejes, lim.num_ejes)}
        ${campoNumero('num_llantas', 'num_llantas', 'Número de llantas', d.num_llantas, { ...lim.num_llantas, delta: 2, ayuda: 'Cuente todas, incluidas las dobles. Sin la de repuesto.' })}`;
    },
    alElegir(d, bind) {
      if (bind === 'marca' && !(CATALOGO[d.rol]?.[d.marca] || []).includes(d.modelo)) d.modelo = '';
    },
    revisar(b) {
      const d = b.datos;
      const errores = {};
      const lim = limitesGenerales(d);
      const chk = (k, r) => { if (r.error) errores[k] = r.error; else d[k] = r.valor; };
      chk('marca', V.validarTexto(d.marca, { nombre: 'la marca', min: 2, max: 40 }));
      chk('modelo', V.validarTexto(d.modelo, { nombre: 'el modelo', min: 1, max: 40 }));
      chk('anio', V.validarEntero(d.anio, { nombre: 'el año', min: CONFIG.anioMin, max: anioMax() }));
      chk('num_ejes', V.validarEntero(d.num_ejes, { nombre: 'el número de ejes', ...lim.num_ejes }));
      chk('num_llantas', V.validarEntero(d.num_llantas, { nombre: 'el número de llantas', ...lim.num_llantas }));
      return { errores };
    },
  },

  especificos: {
    titulo: (b) => T.pasos.especificos.titulo(plantilla(b.datos.tipo).nombre.toLowerCase()),
    html: (b) => plantilla(b.datos.tipo).campos.map((c) => campoPlantilla(c, b.datos.atributos[c.id])).join(''),
    revisar(b) {
      const d = b.datos;
      const errores = {}, advertencias = [];
      plantilla(d.tipo).campos.forEach((c) => {
        const r = V.validarCampo(c, d.atributos[c.id]);
        if (r.error) errores[`attr-${c.id}`] = r.error;
        else {
          d.atributos[c.id] = r.valor;
          if (r.advertencia) advertencias.push(r.advertencia);
          if (c.tipo === 'placa' && r.valor && r.valor === d.placa) errores[`attr-${c.id}`] = T.placa.igualCabezal;
        }
      });
      return { errores, advertencias };
    },
  },

  tanque: {
    titulo: () => T.pasos.tanque.titulo,
    ayuda: () => T.pasos.tanque.ayuda,
    html: (b) => {
      const d = b.datos;
      const n = d.compartimentos.length;
      return `
        ${campoNumero('capacidad', 'capacidad', 'Capacidad total del tanque', d.capacidad, { min: 1, max: CONFIG.maxGalonesTanque, delta: 500, unidad: 'gal', vista: true })}
        <div class="tarjeta editor-tanque">
          <div id="svg-tanque">${svgTanque(d.capacidad, d.compartimentos)}</div>
          <div id="estado-tanque" class="estado-tanque" aria-live="polite">${estadoTanqueHTML(d)}</div>
        </div>
        <fieldset class="campo"><legend>Plantillas rápidas</legend>
          <p class="ayuda">Divide el total en partes iguales. Luego puede cambiar cada una.</p>
          <div class="chips">${[1, 2, 3, 4].map((k) => `<button type="button" class="chip" data-accion="plantilla-comp" data-n="${k}">${k} igual${k > 1 ? 'es' : ''}</button>`).join('')}<button type="button" class="chip" data-accion="personalizado">Personalizado</button></div>
        </fieldset>
        <h2>Compartimentos (${n})</h2>
        <p class="ayuda">El compartimento 1 es el de adelante, junto al cabezal.</p>
        <ol class="lista-comp">${d.compartimentos.map((c, i) => `<li class="comp" data-i="${i}">
          <div class="comp-cab">
            <span class="comp-num" aria-hidden="true">${i + 1}</span>
            <input class="input input-chico" placeholder="Nombre (opcional)" maxlength="30" data-bind="compartimentos.${i}.nombre" value="${esc(c.nombre)}" aria-label="Nombre del compartimento ${i + 1} (opcional)">
            <button type="button" class="btn-icono" data-accion="quitar-comp" data-i="${i}" aria-label="Quitar compartimento ${i + 1}">✕</button>
          </div>
          <div class="stepper">
            <button type="button" class="btn-paso" data-accion="paso-num" data-target="f-comp-${i}" data-delta="-100" data-min="1" aria-label="Restar 100 galones al compartimento ${i + 1}">−</button>
            <input id="f-comp-${i}" class="input" inputmode="numeric" autocomplete="off" data-bind="compartimentos.${i}.galones" data-entero="1" value="${esc(c.galones ?? '')}" aria-label="Galones del compartimento ${i + 1}" aria-describedby="e-comp-${i}">
            <button type="button" class="btn-paso" data-accion="paso-num" data-target="f-comp-${i}" data-delta="100" aria-label="Sumar 100 galones al compartimento ${i + 1}">+</button>
            <span class="unidad">gal</span>
          </div>
          <p class="error" id="e-comp-${i}"></p>
        </li>`).join('')}</ol>
        <button type="button" class="btn btn-secundario btn-bloque" data-accion="agregar-comp" ${n >= CONFIG.maxCompartimentos ? 'disabled' : ''}>＋ Agregar compartimento${n >= CONFIG.maxCompartimentos ? ` (máximo ${CONFIG.maxCompartimentos})` : ''}</button>
        <div id="acepta-wrap" class="campo" ${V.resumenCompartimentos(d.capacidad, d.compartimentos).diferencia === 0 ? 'hidden' : ''}>
          <label class="check-grande aviso-borde"><input type="checkbox" id="f-tanque" data-bind="aceptaDiferencia" ${d.aceptaDiferencia ? 'checked' : ''}> <span>${T.tanque.aceptarCasilla}</span></label>
        </div>
        <p class="error" id="e-tanque"></p>`;
    },
    revisar(b) {
      const d = b.datos;
      const errores = {};
      const r = V.validarEntero(d.capacidad, { nombre: 'la capacidad total', min: 1, max: CONFIG.maxGalonesTanque });
      if (r.error) errores.capacidad = r.error; else d.capacidad = r.valor;
      Object.assign(errores, V.validarCompartimentos(d.capacidad, d.compartimentos, d.aceptaDiferencia));
      if (V.resumenCompartimentos(d.capacidad, d.compartimentos).diferencia === 0) d.aceptaDiferencia = false;
      return { errores };
    },
  },

  acople: {
    titulo: (b) => (b.datos.rol === 'cabezal' ? T.pasos.acople.tituloCabezal : T.pasos.acople.tituloRemolque),
    html: (b) => {
      const d = b.datos;
      const cands = candidatosAcople(d);
      return `<fieldset class="campo" id="f-acople" tabindex="-1"><legend class="sr-only">Elija una opción</legend>
        <div class="opciones">
          ${cands.map((u) => {
            const otro = pareja(u.id);
            return opcion('acoplarCon', u.id, d.acoplarCon, `${esc(u.placa)} · ${esc(nombreUnidad(u))}`, otro && otro.id !== b.editandoId ? `Ahora está con ${esc(otro.placa)}; se cambiará` : (plantilla(u.tipo_unidad_id)?.nombre || ''), ICONOS[u.tipo_unidad_id]);
          }).join('')}
          ${opcion('acoplarCon', 'ninguno', d.acoplarCon, 'Ninguno por ahora', 'Puede engancharlo después')}
        </div>
        <p class="error" id="e-acople"></p></fieldset>
        ${d.acoplarCon && d.acoplarCon !== 'ninguno' ? `<div class="campo"><label for="f-fechaAcople">¿Desde qué fecha?</label>
          <input id="f-fechaAcople" class="input" type="date" data-bind="fechaAcople" value="${esc(d.fechaAcople || hoy())}" max="${hoy()}"><p class="error" id="e-fechaAcople"></p></div>` : ''}
        ${d.rol === 'remolque' && d.acoplarCon === 'ninguno' ? `<p class="aviso">${T.avisos.remolqueSinCabezal}</p>` : ''}`;
    },
    alElegir(d, bind, valor) {
      if (valor !== 'ninguno' && !d.fechaAcople) d.fechaAcople = hoy();
    },
    revisar(b) {
      const d = b.datos;
      if (!d.acoplarCon) return { errores: { acople: T.errores.elegirAcople } };
      if (d.acoplarCon !== 'ninguno' && !d.fechaAcople) return { errores: { fechaAcople: T.errores.fecha } };
      return { errores: {} };
    },
  },

  conductor: {
    titulo: () => T.pasos.conductor.titulo,
    ayuda: () => (CONFIG.conductorObligatorio ? '' : T.pasos.conductor.ayuda),
    html: (b) => {
      const c = b.datos.conductor;
      const yo = conductorYo();
      const otros = db().conductores.filter((x) => x.activo && !x.esUsuario);
      const valor = c.modo === 'existente' ? `c:${c.conductorId}` : c.modo;
      const usuario = db().usuario;
      let form = '';
      if (c.modo === 'nuevo' || (c.modo === 'yo' && !yo)) form = `<div class="tarjeta form-conductor">${c.modo === 'yo' ? '<p class="ayuda">Llenamos su nombre y celular con los datos de su cuenta. Revíselos.</p>' : ''}${formConductor(c)}</div>`;
      if (c.modo === 'yo' && yo) form = `<p class="ayuda">Se usarán sus datos: ${esc(yo.nombre)} · cédula ${V.mascaraCedula(yo.cedula) || '—'}.</p>`;
      if (c.modo === 'despues') form = `<p class="aviso">${T.avisos.conductorDespues}</p>`;
      return `<fieldset class="campo" id="f-conductor" tabindex="-1"><legend class="sr-only">Elija una opción</legend>
        <div class="opciones">
          ${opcion('conductor.modo', 'yo', valor, 'Yo la manejo', esc(yo?.nombre || usuario.nombre))}
          ${otros.map((x) => opcion('conductor.modo', `c:${x.id}`, valor, esc(x.nombre), `Cédula ${V.mascaraCedula(x.cedula) || '—'}`)).join('')}
          ${opcion('conductor.modo', 'nuevo', valor, 'Otro conductor', 'Registrar a otra persona')}
          ${!CONFIG.conductorObligatorio ? opcion('conductor.modo', 'despues', valor, 'Registrar después', '') : ''}
        </div><p class="error" id="e-conductor"></p></fieldset>${form}`;
    },
    alElegir(d, bind, valor) {
      const c = d.conductor;
      if (valor.startsWith('c:')) Object.assign(c, { modo: 'existente', conductorId: valor.slice(2) });
      else if (valor === 'yo') {
        // CA-06: prellenado con los datos de la cuenta
        const u = db().usuario;
        Object.assign(c, { nombre: u.nombre, telefono: V.formatoTelefono(u.telefono), cedula: '', consentimiento: false, conductorId: null });
      } else if (valor === 'nuevo') Object.assign(c, { nombre: '', telefono: '', cedula: '', consentimiento: false, conductorId: null });
    },
    revisar(b) {
      const c = b.datos.conductor;
      if (!c.modo) return { errores: { conductor: T.errores.elegirConductor } };
      if (c.modo === 'nuevo' || (c.modo === 'yo' && !conductorYo())) return { errores: revisarConductor(c) };
      return { errores: {} };
    },
  },

  resumen: {
    titulo: (b) => (b.editandoId ? T.pasos.resumen.tituloEdicion : T.pasos.resumen.titulo),
    html: (b) => {
      const d = b.datos;
      const p = plantilla(d.tipo);
      const sec = (paso, titulo, cuerpo) => `<section class="tarjeta resumen-sec"><div class="resumen-cab"><h2>${titulo}</h2><button type="button" class="btn btn-texto" data-accion="ir-paso" data-paso="${paso}">Cambiar</button></div>${cuerpo}</section>`;
      const dl = (filas) => `<dl class="datos">${filas.filter(([, v]) => v !== '' && v !== undefined && v !== null).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
      const c = d.conductor;
      let cond = '<p>Se registrará después.</p>';
      if (c.modo === 'existente') { const x = conductor(c.conductorId); cond = `<p><strong>${esc(x?.nombre)}</strong></p>`; }
      if (c.modo === 'yo' || c.modo === 'nuevo') {
        const yo = c.modo === 'yo' && conductorYo();
        const x = yo || c;
        cond = `<p><strong>${esc(x.nombre)}</strong>${c.modo === 'yo' ? ' (usted)' : ''}</p><p>Cédula ${V.mascaraCedula(x.cedula) || '—'} · ${esc(x.telefono?.startsWith('+') ? V.formatoTelefono(x.telefono) : x.telefono)}</p>`;
      }
      const par = d.acoplarCon && d.acoplarCon !== 'ninguno' ? unidad(d.acoplarCon) : null;
      let html = sec('placa', 'Placa', placaHTML(d.placa, true));
      html += sec('tipo', 'Tipo', `<p class="resumen-tipo"><span class="tu-icono">${ICONOS[d.tipo]}</span> ${d.rol === 'cabezal' ? 'Cabezal (tractocamión)' : `Remolque · ${p.nombre}`}</p>`);
      html += sec('generales', 'Datos generales', dl([['Marca', d.marca], ['Modelo', d.modelo], ['Año', d.anio], ['Ejes', d.num_ejes], ['Llantas', d.num_llantas]]));
      html += sec('especificos', `Datos del ${p.nombre.toLowerCase()}`, dl(p.campos.map((f) => [f.etiqueta, valorAtributo(f, d.atributos[f.id])])));
      if (p.tanque) {
        const r = V.resumenCompartimentos(d.capacidad, d.compartimentos);
        html += sec('tanque', 'Tanque', `${svgTanque(d.capacidad, d.compartimentos)}
          <p class="estado-tanque ${r.diferencia ? 'mal' : 'bien'}"><strong>${miles(r.asignado)} de ${miles(r.total)} gal</strong> · ${r.mensaje}</p>
          <ol class="lista-simple">${d.compartimentos.map((x, i) => `<li><span>Compartimento ${i + 1}${x.nombre ? ` · ${esc(x.nombre)}` : ''}</span><strong>${miles(x.galones)} gal</strong></li>`).join('')}</ol>`);
      }
      if (pasosDe(d).includes('acople')) html += sec('acople', d.rol === 'cabezal' ? 'Remolque' : 'Cabezal', par ? `<p>${placaHTML(par.placa)} ${esc(nombreUnidad(par))}</p><p class="ayuda">Desde el ${fecha(d.fechaAcople)}</p>` : '<p>Ninguno por ahora.</p>');
      html += sec('conductor', 'Conductor', cond);
      return html;
    },
    revisar: () => ({ errores: {} }),
  },
};

function limitesGenerales(d) {
  const p = plantilla(d.tipo);
  return {
    num_ejes: { min: 1, max: 9, ...(p?.limites?.num_ejes || {}) },
    num_llantas: { min: 2, max: 40, ...(p?.limites?.num_llantas || {}) },
  };
}

function vistaPlaca(texto) {
  const r = V.normalizarPlaca(texto);
  return r.valor ? `Se guardará como ${placaHTML(r.valor)}` : '';
}

function estadoTanqueHTML(d) {
  const r = V.resumenCompartimentos(d.capacidad, d.compartimentos);
  if (!r.total) return `<span class="mal">${T.tanque.sinCapacidad}</span>`;
  return `<strong>${miles(r.asignado)} de ${miles(r.total)} gal</strong> asignados<br><span class="${r.diferencia ? 'mal' : 'bien'}">${r.diferencia ? '⚠' : '✓'} ${r.mensaje}</span>`;
}

function refrescarTanque(activo = -1) {
  const d = db().borrador.datos;
  const svg = document.getElementById('svg-tanque');
  if (!svg) return;
  svg.innerHTML = svgTanque(d.capacidad, d.compartimentos, { activo });
  document.getElementById('estado-tanque').innerHTML = estadoTanqueHTML(d);
  const r = V.resumenCompartimentos(d.capacidad, d.compartimentos);
  document.getElementById('acepta-wrap').hidden = r.diferencia === 0;
}

function nuevoBorrador() {
  return {
    id: uid(),
    editandoId: null,
    paso: 'placa',
    volverAResumen: false,
    datos: { atributos: {}, compartimentos: [], conductor: { modo: null }, acoplarCon: null },
  };
}

function borradorDesdeUnidad(u, paso = 'resumen') {
  const par = pareja(u.id);
  const c = conductorDe(u.id);
  const comps = compartimentosDe(u.id);
  return {
    id: u.id,
    editandoId: u.id,
    paso,
    volverAResumen: paso !== 'resumen',
    datos: {
      placa: u.placa, rol: u.rol, tipo: u.tipo_unidad_id, marca: u.marca, modelo: u.modelo, anio: u.anio,
      num_ejes: u.num_ejes, num_llantas: u.num_llantas, generalesEditados: true,
      atributos: { ...u.atributos },
      capacidad: u.atributos.capacidad_galones,
      compartimentos: comps.map((x) => ({ id: x.id, nombre: x.nombre, galones: x.capacidad_galones })),
      aceptaDiferencia: !!u.atributos.diferencia_aceptada,
      acoplarCon: par ? par.id : 'ninguno',
      fechaAcople: acopleActivo(u.id)?.desde || hoy(),
      conductor: c ? (c.esUsuario ? { modo: 'yo' } : { modo: 'existente', conductorId: c.id }) : { modo: 'despues' },
    },
  };
}

function renderRegistro({ mantenerScroll = false } = {}) {
  const b = db().borrador;
  if (!b) return ir('#/');
  const pasos = pasosDe(b.datos);
  if (!pasos.includes(b.paso)) b.paso = 'resumen';
  const i = pasos.indexOf(b.paso);
  const P = PASOS[b.paso];
  const y = window.scrollY;
  const ayuda = P.ayuda?.(b);
  const etiquetaSig = b.paso === 'resumen' ? (b.editandoId ? 'Guardar cambios' : 'Confirmar registro') : b.volverAResumen ? 'Volver al resumen' : 'Siguiente';
  app.innerHTML = `<div class="wizard">
    <div class="progreso">
      <div class="progreso-fila"><span><strong>Paso ${i + 1} de ${pasos.length}</strong></span><button type="button" class="btn btn-texto" data-accion="salir-registro">Guardar y salir</button></div>
      <div class="barra" role="progressbar" aria-valuemin="1" aria-valuemax="${pasos.length}" aria-valuenow="${i + 1}" aria-label="Progreso del registro"><div style="width:${((i + 1) / pasos.length) * 100}%"></div></div>
    </div>
    ${b.datos.placa && b.paso !== 'placa' && b.paso !== 'resumen' ? `<p class="contexto">${placaHTML(b.datos.placa)}${b.editandoId ? ' · editando' : ''}</p>` : ''}
    <h1 tabindex="-1" id="titulo-paso">${P.titulo(b)}</h1>
    ${ayuda ? `<p class="lead">${ayuda}</p>` : ''}
    <div id="paso-cuerpo">${P.html(b)}</div>
    <div class="barra-acciones">
      <button type="button" class="btn btn-secundario" data-accion="atras">${i === 0 && !b.volverAResumen ? 'Cancelar' : '‹ Atrás'}</button>
      <button type="button" class="btn btn-primario" data-accion="siguiente">${etiquetaSig}${b.paso === 'resumen' ? '' : ' ›'}</button>
    </div>
  </div>`;
  if (mantenerScroll) window.scrollTo(0, y);
  else {
    window.scrollTo(0, 0);
    document.getElementById('titulo-paso').focus({ preventScroll: true });
  }
}

function guardarBorrador() {
  db().borrador.actualizado = ahora();
  guardar();
}

function limpiarErrores() {
  app.querySelectorAll('.error').forEach((e) => (e.textContent = ''));
  app.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
}

function mostrarErrores(errores) {
  limpiarErrores();
  const claves = Object.keys(errores);
  claves.forEach((k) => {
    const el = document.getElementById('e-' + k);
    if (el) el.textContent = errores[k];
    document.getElementById('f-' + k)?.setAttribute('aria-invalid', 'true');
  });
  if (claves.length) {
    const k = claves[0];
    const f = document.getElementById('f-' + k) || document.getElementById('e-' + k);
    f?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    f?.focus?.({ preventScroll: true });
  }
  return claves.length > 0;
}

async function siguiente() {
  const b = db().borrador;
  const P = PASOS[b.paso];
  if (b.paso === 'resumen') {
    for (const paso of pasosDe(b.datos)) {
      if (paso === 'resumen') continue;
      const r = PASOS[paso].revisar(b);
      if (Object.keys(r.errores).length) {
        b.paso = paso;
        b.volverAResumen = true;
        renderRegistro();
        mostrarErrores(r.errores);
        toast(T.errores.revisePaso);
        return;
      }
    }
    const u = guardarUnidad(b);
    db().borrador = null;
    guardar();
    toast(b.editandoId ? T.toast.guardada : T.toast.registrada);
    return ir(`#/unidad/${u.id}`);
  }
  const r = P.revisar(b);
  if (mostrarErrores(r.errores)) return;
  if (r.advertencias?.length) {
    const ok = await confirmar('¿Está seguro?', r.advertencias.map((a) => `<p>${esc(a)}</p>`).join(''), 'Sí, está bien', 'btn-primario');
    if (!ok) return;
  }
  const pasos = pasosDe(b.datos);
  b.paso = b.volverAResumen ? 'resumen' : pasos[pasos.indexOf(b.paso) + 1];
  if (b.paso === 'resumen') b.volverAResumen = false;
  guardarBorrador();
  renderRegistro();
}

async function atras() {
  const b = db().borrador;
  const pasos = pasosDe(b.datos);
  const i = pasos.indexOf(b.paso);
  if (b.volverAResumen) {
    b.paso = 'resumen';
    b.volverAResumen = false;
  } else if (i === 0 || (b.editandoId && b.paso === 'resumen')) {
    return salirRegistro();
  } else {
    b.paso = pasos[i - 1];
  }
  guardarBorrador();
  renderRegistro();
}

async function salirRegistro() {
  const b = db().borrador;
  if (b.editandoId) {
    const ok = await confirmar('¿Salir sin guardar?', '<p>Los cambios que hizo no se guardarán en la unidad.</p>', 'Sí, salir', 'btn-peligro');
    if (!ok) return;
    db().borrador = null;
    guardar();
    return ir(`#/unidad/${b.editandoId}`);
  }
  guardarBorrador();
  ir('#/');
}

// Guarda la unidad, sus componentes, odómetro, acople y conductor (sección 11).
function guardarUnidad(b) {
  const d = b.datos, D = db(), t = ahora(), p = plantilla(d.tipo);
  const atributos = {};
  p.campos.forEach((c) => {
    const v = d.atributos[c.id];
    if (v !== undefined && v !== null && v !== '') atributos[c.id] = v;
  });
  if (p.tanque) {
    atributos.capacidad_galones = d.capacidad;
    atributos.diferencia_aceptada = V.resumenCompartimentos(d.capacidad, d.compartimentos).diferencia !== 0;
  }
  let u = b.editandoId ? unidad(b.editandoId) : null;
  const nuevo = !u;
  if (nuevo) {
    u = { id: b.id, usuario_id: D.usuario.id, activa: true, creado_en: t };
    D.unidades.push(u);
  }
  Object.assign(u, {
    tipo_unidad_id: d.tipo, rol: d.rol, placa: d.placa, marca: d.marca, modelo: d.modelo, anio: d.anio,
    num_ejes: d.num_ejes, num_llantas: d.num_llantas, atributos, actualizado_en: t,
  });

  if (nuevo) {
    p.componentes.forEach((nombre, i) => D.componentes.push({ id: uid(), unidad_id: u.id, tipo: 'general', nombre, orden: i + 1, capacidad_galones: null, activo: true }));
  }
  // Compartimentos como componentes; los quitados quedan con baja lógica.
  const conservar = new Set(p.tanque ? d.compartimentos.map((c) => c.id) : []);
  D.componentes.filter((c) => c.unidad_id === u.id && c.tipo === 'compartimento' && c.activo && !conservar.has(c.id)).forEach((c) => (c.activo = false));
  if (p.tanque) {
    d.compartimentos.forEach((c, i) => {
      let comp = D.componentes.find((x) => x.id === c.id);
      if (!comp) {
        comp = { id: c.id || uid(), unidad_id: u.id, tipo: 'compartimento', activo: true };
        D.componentes.push(comp);
      }
      Object.assign(comp, { nombre: (c.nombre || '').trim(), orden: i + 1, capacidad_galones: V.aEntero(c.galones) });
    });
  }

  if (nuevo && d.rol === 'cabezal' && d.atributos.km_inicial !== undefined && d.atributos.km_inicial !== null) {
    D.odometro.push({ id: uid(), unidad_id: u.id, km: d.atributos.km_inicial, fuente: 'manual', registrado_en: t });
  }

  // Acople (RF-10)
  if (d.acoplarCon) {
    const actual = acopleActivo(u.id);
    const actualPar = actual ? (actual.cabezal_id === u.id ? actual.remolque_id : actual.cabezal_id) : null;
    if (d.acoplarCon === 'ninguno') {
      if (actual) actual.hasta = t;
    } else if (actualPar !== d.acoplarCon) {
      if (actual) actual.hasta = t;
      const otro = acopleActivo(d.acoplarCon);
      if (otro) otro.hasta = t;
      const cab = d.rol === 'cabezal' ? u.id : d.acoplarCon;
      const rem = d.rol === 'cabezal' ? d.acoplarCon : u.id;
      D.acoplamientos.push({ id: uid(), cabezal_id: cab, remolque_id: rem, desde: d.fechaAcople || hoy(), hasta: null });
      auditar('acoplar', 'unidad', u.id, `Enganchado con ${unidad(d.acoplarCon).placa}`);
    }
  }

  // Conductor y asignación (RF-34): el cambio cierra la asignación anterior, no la borra.
  const c = d.conductor;
  let conductorId = null;
  if (c.modo === 'existente') conductorId = c.conductorId;
  else if (c.modo === 'yo') conductorId = (conductorYo() || crearConductor(c, true)).id;
  else if (c.modo === 'nuevo') conductorId = crearConductor(c, false).id;
  const asig = asignacionActiva(u.id);
  if (conductorId && asig?.conductor_id !== conductorId) {
    if (asig) asig.hasta = t;
    D.asignaciones.push({ id: uid(), conductor_id: conductorId, unidad_id: u.id, desde: t, hasta: null });
    auditar('asignar', 'unidad', u.id, `Conductor: ${conductor(conductorId).nombre}`);
  } else if (!conductorId && asig) {
    asig.hasta = t;
  }
  auditar(nuevo ? 'crear' : 'editar', 'unidad', u.id, nuevo ? `Registrada ${u.placa}` : 'Datos editados');
  return u;
}

function crearConductor(c, esUsuario) {
  const nuevo = { id: uid(), usuario_id: db().usuario.id, nombre: c.nombre, cedula: c.cedula || '', telefono: c.telefono, esUsuario, consentimiento_en: ahora(), activo: true };
  db().conductores.push(nuevo);
  auditar('crear', 'conductor', nuevo.id, `Conductor registrado: ${nuevo.nombre}`);
  return nuevo;
}

function cargarEjemplo() {
  const D = db();
  const cab = nuevoBorrador();
  Object.assign(cab.datos, {
    placa: 'PCX-2020', rol: 'cabezal', tipo: 'tracto', marca: 'Freightliner', modelo: 'Columbia', anio: 2020, num_ejes: 3, num_llantas: 10,
    atributos: { km_inicial: 845300, motor: 'Detroit DD15', transmision: 'Manual 10 velocidades' },
    acoplarCon: null,
    conductor: { modo: 'yo', nombre: D.usuario.nombre, cedula: '1710034065', telefono: D.usuario.telefono, consentimiento: true },
  });
  const u1 = guardarUnidad(cab);
  const tq = nuevoBorrador();
  Object.assign(tq.datos, {
    placa: 'PTQ-1010', rol: 'remolque', tipo: 'tanquero', marca: 'Fabricación nacional', modelo: 'Tanquero 10.000 gal', anio: 2020, num_ejes: 3, num_llantas: 12,
    atributos: { material: 'Aluminio', producto: 'Combustible' },
    capacidad: 10000,
    compartimentos: [3000, 2000, 2000, 3000].map((g) => ({ id: uid(), nombre: '', galones: g })),
    acoplarCon: u1.id, fechaAcople: hoy(),
    conductor: { modo: 'yo' },
  });
  guardarUnidad(tq);
  guardar();
  toast(T.toast.ejemplo);
}

// ---------------------------------------------------------------- eventos
function setPath(obj, path, valor) {
  const k = path.split('.');
  let o = obj;
  for (let i = 0; i < k.length - 1; i++) o = o[k[i]] ??= {};
  o[k[k.length - 1]] = valor;
}

const acciones = {
  'nuevo-registro': async () => {
    const b = db().borrador;
    if (b && !b.editandoId) {
      const r = await modal({ titulo: 'Tiene un registro sin terminar', texto: `<p>¿Quiere continuarlo o empezar uno nuevo?</p>`, botones: [{ texto: 'Continuar el anterior', valor: 'seguir', clase: 'btn-primario' }, { texto: 'Empezar de nuevo', valor: 'nuevo' }] });
      if (!r) return;
      if (r === 'nuevo') db().borrador = nuevoBorrador();
    } else if (b && b.editandoId) {
      const ok = await confirmar('Tiene cambios sin guardar', '<p>Si empieza un registro nuevo, se descartarán los cambios que estaba haciendo.</p>', 'Descartar y empezar');
      if (!ok) return;
      db().borrador = nuevoBorrador();
    } else db().borrador = nuevoBorrador();
    guardar();
    ir('#/registro');
  },
  'continuar-registro': () => ir('#/registro'),
  'descartar-borrador': async () => {
    if (!(await confirmar('¿Descartar?', '<p>Se borrarán los datos que llenó en este registro.</p>', 'Sí, descartar', 'btn-peligro'))) return;
    db().borrador = null;
    guardar();
    render();
  },
  'salir-registro': salirRegistro,
  atras,
  siguiente,
  'ir-paso': (el) => {
    const b = db().borrador;
    b.paso = el.dataset.paso;
    b.volverAResumen = true;
    guardarBorrador();
    renderRegistro();
  },
  elegir: (el) => {
    const b = db().borrador;
    if (!b) return;
    const { bind, valor } = el.dataset;
    setPath(b.datos, bind, valor);
    PASOS[b.paso].alElegir?.(b.datos, bind, valor);
    guardarBorrador();
    renderRegistro({ mantenerScroll: true });
    // Mantener el foco en la opción elegida para quien usa teclado o lector de pantalla
    app.querySelector(`[data-accion="elegir"][data-bind="${bind}"][data-valor="${CSS.escape(valor)}"]`)?.focus({ preventScroll: true });
  },
  'paso-num': (el) => {
    const input = document.getElementById(el.dataset.target);
    const actual = V.aEntero(input.value);
    let n = !Number.isFinite(actual) && el.dataset.inicio ? Number(el.dataset.inicio) : (Number.isFinite(actual) ? actual : 0) + Number(el.dataset.delta);
    if (el.dataset.min !== undefined) n = Math.max(Number(el.dataset.min), n);
    if (el.dataset.max !== undefined) n = Math.min(Number(el.dataset.max), n);
    n = Math.max(0, n);
    input.value = n;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  },
  'plantilla-comp': (el) => {
    const d = db().borrador.datos;
    const total = V.aEntero(d.capacidad);
    if (!total) return mostrarErrores({ capacidad: T.tanque.sinCapacidad });
    const n = Number(el.dataset.n);
    d.compartimentos = V.dividirIguales(total, n).map((g, i) => ({ id: d.compartimentos[i]?.id || uid(), nombre: d.compartimentos[i]?.nombre || '', galones: g }));
    d.aceptaDiferencia = false;
    guardarBorrador();
    renderRegistro({ mantenerScroll: true });
  },
  personalizado: () => {
    const d = db().borrador.datos;
    if (!d.compartimentos.length) return acciones['agregar-comp']();
    document.getElementById('f-comp-0')?.focus();
  },
  'agregar-comp': () => {
    const d = db().borrador.datos;
    if (d.compartimentos.length >= CONFIG.maxCompartimentos) return;
    const r = V.resumenCompartimentos(d.capacidad, d.compartimentos);
    d.compartimentos.push({ id: uid(), nombre: '', galones: r.diferencia < 0 ? -r.diferencia : null });
    guardarBorrador();
    renderRegistro({ mantenerScroll: true });
    document.getElementById(`f-comp-${d.compartimentos.length - 1}`)?.focus();
  },
  'quitar-comp': async (el) => {
    const b = db().borrador;
    const i = Number(el.dataset.i);
    const comp = b.datos.compartimentos[i];
    if (b.editandoId && db().componentes.some((x) => x.id === comp.id)) {
      const ok = await confirmar(`¿Quitar el compartimento ${i + 1}?`, '<p>Si tiene mantenimientos registrados, se conservarán en el historial.</p>', 'Sí, quitar', 'btn-peligro');
      if (!ok) return;
    }
    b.datos.compartimentos.splice(i, 1);
    guardarBorrador();
    renderRegistro({ mantenerScroll: true });
  },
  editar: async (el) => {
    const u = unidad(el.dataset.id);
    const b = db().borrador;
    if (b && !(b.editandoId === u.id)) {
      const ok = await confirmar('Tiene un registro sin terminar', '<p>Si edita esta unidad ahora, se descartará el registro que dejó a medias.</p>', 'Descartar y editar');
      if (!ok) return;
    }
    db().borrador = borradorDesdeUnidad(u, el.dataset.paso || 'resumen');
    guardar();
    ir('#/registro');
  },
  baja: async (el) => {
    const u = unidad(el.dataset.id);
    const ok = await confirmar(`¿Dar de baja ${u.placa}?`, '<p>Ya no aparecerá en «Mis unidades», pero su historial se conserva. Puede reactivarla después.</p>', 'Sí, dar de baja', 'btn-peligro');
    if (!ok) return;
    const t = ahora();
    u.activa = false;
    u.actualizado_en = t;
    const a = acopleActivo(u.id);
    if (a) a.hasta = t;
    auditar('baja', 'unidad', u.id, 'Dada de baja');
    guardar();
    toast(T.toast.baja);
    ir('#/');
  },
  reactivar: (el) => {
    const u = unidad(el.dataset.id);
    if (db().unidades.some((x) => x.activa && x.placa === u.placa && x.id !== u.id)) return modal({ titulo: 'No se puede reactivar', texto: `<p>${T.placa.duplicada(u.placa)}</p>`, botones: [{ texto: 'Entendido', valor: true, clase: 'btn-primario' }] });
    u.activa = true;
    auditar('reactivar', 'unidad', u.id, 'Reactivada');
    guardar();
    toast(T.toast.reactivada);
    render();
  },
  desacoplar: async (el) => {
    const u = unidad(el.dataset.id);
    const par = pareja(u.id);
    const ok = await confirmar('¿Desenganchar?', `<p>${esc(u.placa)} y ${esc(par.placa)} quedarán separados. El historial se conserva.</p>`, 'Sí, desenganchar');
    if (!ok) return;
    acopleActivo(u.id).hasta = ahora();
    auditar('desacoplar', 'unidad', u.id, `Desenganchado de ${par.placa}`);
    auditar('desacoplar', 'unidad', par.id, `Desenganchado de ${u.placa}`);
    guardar();
    render();
  },
  'registrar-km': async (el) => {
    const u = unidad(el.dataset.id);
    const ultimo = lecturasKm(u.id)[0]?.km;
    let error = '', valor = '';
    for (;;) {
      const r = await modal({
        titulo: 'Registrar kilometraje',
        texto: `<label for="m-km">Kilometraje del tablero</label><input id="m-km" class="input" inputmode="numeric" value="${esc(valor)}" autocomplete="off">
          ${ultimo !== undefined ? `<p class="ayuda">Último registrado: ${miles(ultimo)} km</p>` : ''}<p class="error">${esc(error)}</p>`,
        botones: [{ texto: 'Guardar', valor: true, clase: 'btn-primario' }, { texto: 'Cancelar', valor: false }],
      });
      if (!r) return;
      valor = dialogo.querySelector('#m-km').value;
      const v = V.validarEntero(valor, { nombre: 'el kilometraje', min: 0, advertirSobre: CONFIG.kmAdvertencia });
      if (v.error) { error = v.error; continue; }
      if (v.advertencia && !(await confirmar('¿Está seguro?', `<p>${esc(v.advertencia)}</p>`, 'Sí, está bien'))) return;
      if (ultimo !== undefined && v.valor < ultimo && !(await confirmar('¿Está seguro?', `<p>${T.avisos.kmMenor(miles(v.valor), miles(ultimo))}</p>`, 'Sí, está bien'))) return;
      db().odometro.push({ id: uid(), unidad_id: u.id, km: v.valor, fuente: 'manual', registrado_en: ahora() });
      auditar('km', 'unidad', u.id, `Kilometraje: ${miles(v.valor)} km`);
      guardar();
      toast(T.toast.km);
      return render();
    }
  },
  'cambiar-cedula': () => {
    const bloque = document.getElementById('bloque-cedula');
    bloque.outerHTML = `<div class="campo"><label for="f-c-cedula">Nueva cédula</label><input id="f-c-cedula" class="input" inputmode="numeric" maxlength="10" data-bind="conductor.cedula" data-validar="cedula"><p class="error" id="e-c-cedula"></p></div>`;
    document.getElementById('f-c-cedula').focus();
  },
  'guardar-conductor': (el) => {
    const id = el.dataset.id;
    const nuevo = id === 'nuevo';
    const c = edicionConductor;
    const cambiaCedula = nuevo || !!document.getElementById('f-c-cedula');
    const errores = revisarConductor(c, { excluirId: nuevo ? null : id, pedirCedula: cambiaCedula, pedirConsentimiento: nuevo });
    if (mostrarErrores(errores)) return;
    if (nuevo) crearConductor(c, false);
    else {
      const x = conductor(id);
      x.nombre = c.nombre;
      x.telefono = c.telefono;
      if (cambiaCedula) x.cedula = c.cedula;
      auditar('editar', 'conductor', id, 'Datos del conductor editados');
    }
    guardar();
    toast(T.toast.conductor);
    ir('#/conductores');
  },
  'estado-conductor': async (el) => {
    const x = conductor(el.dataset.id);
    if (x.activo) {
      const ok = await confirmar(`¿Desactivar a ${esc(x.nombre)}?`, '<p>Dejará de estar asignado a sus unidades. Su historial de mantenimientos se conserva.</p>', 'Sí, desactivar', 'btn-peligro');
      if (!ok) return;
      const t = ahora();
      db().asignaciones.filter((a) => !a.hasta && a.conductor_id === x.id).forEach((a) => (a.hasta = t));
    }
    x.activo = !x.activo;
    auditar(x.activo ? 'activar' : 'desactivar', 'conductor', x.id, x.activo ? 'Activado' : 'Desactivado');
    guardar();
    render();
  },
  'guardar-cuenta': () => {
    const c = edicionConductor;
    const errores = revisarConductor(c, { pref: 'u', pedirCedula: false, pedirConsentimiento: false });
    if (mostrarErrores(errores)) return;
    Object.assign(db().usuario, { nombre: c.nombre, telefono: c.telefono });
    guardar();
    toast('Datos guardados');
  },
  'cargar-ejemplo': async () => {
    if (db().unidades.some((u) => u.placa === 'PCX-2020' || u.placa === 'PTQ-1010')) return toast('El ejemplo ya está cargado');
    cargarEjemplo();
    ir('#/');
  },
  'borrar-todo': async () => {
    const ok = await confirmar('¿Borrar todos los datos?', '<p>Se borrarán todas las unidades, conductores y borradores de este teléfono. No se puede deshacer.</p>', 'Sí, borrar todo', 'btn-peligro');
    if (!ok) return;
    resetear();
    toast(T.toast.borrado);
    ir('#/');
  },
};

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-accion]');
  if (!el || el.disabled) return;
  e.preventDefault();
  acciones[el.dataset.accion]?.(el, e);
});

app.addEventListener('input', (e) => {
  const el = e.target;
  const bind = el.dataset.bind;
  if (!bind) return;
  let valor = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.entero) {
    const n = V.aEntero(valor);
    valor = n === null ? null : Number.isNaN(n) ? el.value : n;
  }
  const err = document.getElementById('e-' + el.id.replace(/^f-/, ''));
  if (err) err.textContent = '';
  el.removeAttribute('aria-invalid');

  const b = db().borrador;
  if (ruta().v !== 'registro' || !b) {
    setPath({ conductor: edicionConductor }, bind, valor);
    return;
  }
  setPath(b.datos, bind, valor);
  if (['marca', 'modelo', 'anio', 'num_ejes', 'num_llantas'].includes(bind)) b.datos.generalesEditados = true;
  if (bind === 'placa') document.getElementById('prev-placa').innerHTML = vistaPlaca(valor);
  if (el.dataset.vista) {
    const v = document.getElementById('v-' + el.id.replace(/^f-/, ''));
    const u = el.closest('.stepper')?.querySelector('.unidad')?.textContent || '';
    if (v) v.innerHTML = typeof valor === 'number' && valor >= 1000 ? `Se leerá: <strong>${miles(valor)} ${u}</strong>` : '';
  }
  if (b.paso === 'tanque') {
    const li = el.closest('.comp');
    refrescarTanque(li ? Number(li.dataset.i) : -1);
    if (document.getElementById('e-tanque')) document.getElementById('e-tanque').textContent = '';
  }
  guardarBorrador();
});

// Al tocar un compartimento, se resalta en el dibujo.
app.addEventListener('focusin', (e) => {
  const li = e.target.closest?.('.comp');
  if (li && db().borrador?.paso === 'tanque') refrescarTanque(Number(li.dataset.i));
});

// Validación temprana de cédula y teléfono al salir del campo.
app.addEventListener('focusout', (e) => {
  const el = e.target;
  const tipo = el.dataset?.validar;
  if (!tipo || !el.value.trim()) return;
  const r = tipo === 'cedula' ? V.validarCedula(el.value) : V.normalizarTelefono(el.value);
  const err = document.getElementById('e-' + el.id.replace(/^f-/, ''));
  if (err) err.textContent = r.error || '';
  if (r.error) el.setAttribute('aria-invalid', 'true');
});

// ---------------------------------------------------------------- inicio
estadoConexion();
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
