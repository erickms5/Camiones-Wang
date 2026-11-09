// Vista interactiva del camión: panel de control con modelo 3D holográfico (Three.js),
// puntos por componente, paneles flotantes unidos con líneas y sensores.
// Los datos de sensores son SIMULADOS (con aviso visible) hasta la fase de lectura automática.
import { miles } from './textos.js';
import * as V from './validaciones.js';
import { plantilla } from './plantillas.js';
import { db } from './store.js';
import {
  esc, unidad, activas, pareja, acopleActivo, compartimentosDe, componentesDe, lecturasKm, conductorDe, nombreUnidad, intervalosDe,
} from './consultas.js';

const CIAN = 0x38e1ff;
const CIAN_CLARO = 0xbff6ff;
const ACTIVO = 0xeaffff;

// Geometría base (metros). X hacia el frente del camión, Y arriba, Z hacia el lado del conductor.
const TANQUE = { xFrente: -2.05, xFondo: -12.65, y: 2.35, r: 1.0 };
const EJES_CAB = [3.0, -1.5, -2.85];
const EJES_REM = [-10.1, -11.35, -12.6];

// Encuadres de cámara: objetivo y posición relativa
const ENCUADRES = {
  todo: { objetivo: [-4.4, 1.7, 0], radio: 27, azimut: 0.95, polar: 1.2, estrecho: 1 },
  cab: { objetivo: [0.9, 1.7, 0], radio: 12.5, azimut: 1.08, polar: 1.25, estrecho: 0.5 },
  rem: { objetivo: [-7.3, 2.0, 0], radio: 17.5, azimut: 0.72, polar: 1.18, estrecho: 1 },
};

const PUNTOS_CAB = {
  Motor: ['motor', [3.05, 1.6, 0.95]],
  'Transmisión': ['transmision', [1.95, 1.0, 0.75]],
  'Quinta rueda': ['quinta', [-2.2, 1.3, 0.75]],
  'Eje delantero': ['eje-0', [EJES_CAB[0], 0.52, 1.28]],
  'Eje trasero 1': ['eje-1', [EJES_CAB[1], 0.52, 1.42]],
  'Eje trasero 2': ['eje-2', [EJES_CAB[2], 0.52, 1.42]],
};
const PUNTOS_REM = {
  'Quinta rueda': ['quinta', [-2.25, 1.32, 0.7]],
  Tanque: ['tanque', [-7.35, 3.45, 0.2]],
  'Válvulas': ['valvulas', [-6.4, 1.15, 0.85]],
  'Eje 1': ['eje-0', [EJES_REM[0], 0.5, 1.42]],
  'Eje 2': ['eje-1', [EJES_REM[1], 0.5, 1.42]],
  'Eje 3': ['eje-2', [EJES_REM[2], 0.5, 1.42]],
  Piso: ['piso', [-7.3, 1.62, 1.25]],
  'Twist locks': ['twist', [-2.3, 1.72, 1.15]],
  Puertas: ['puertas', [-13.0, 2.7, 0.6]],
  'Equipo de frío': ['frio', [-1.5, 3.5, 0.5]],
};

// Sensores simulados: valor inicial, rango y variación por segundo.
const SENSORES = {
  motor_temp: { v: 85, min: 79, max: 94, paso: 0.9, unidad: '°C', alto: 100, alerta: 93 },
  motor_aceite: { v: 45, min: 39, max: 54, paso: 1.1, unidad: 'PSI', alto: 80 },
  motor_carga: { v: 50, min: 28, max: 78, paso: 4, unidad: '%', alto: 100 },
  motor_rend: { v: 70, min: 40, max: 92, paso: 6, unidad: '%', alto: 100 },
  llanta_presion: { v: 110, min: 104, max: 114, paso: 0.6, unidad: 'PSI', alto: 130 },
  llanta_temp: { v: 42, min: 36, max: 48, paso: 0.5, unidad: '°C', alto: 80, alerta: 47.5 },
  llanta_desgaste: { v: 64, min: 63, max: 65, paso: 0.05, unidad: '%', alto: 100 },
  frenos_temp: { v: 96, min: 70, max: 140, paso: 5, unidad: '°C', alto: 250, alerta: 136 },
  frenos_vida: { v: 72, min: 71, max: 73, paso: 0.05, unidad: '%', alto: 100 },
  trans_temp: { v: 78, min: 70, max: 92, paso: 0.8, unidad: '°C', alto: 120, alerta: 91 },
};
const SENSORES_DE = {
  Motor: ['motor_temp', 'motor_aceite'],
  Llantas: ['llanta_presion', 'llanta_temp'],
  Frenos: ['frenos_temp', 'frenos_vida'],
  'Transmisión': ['trans_temp'],
};
const NOMBRE_SENSOR = {
  motor_temp: 'Temperatura', motor_aceite: 'Presión de aceite', motor_carga: 'Carga', llanta_presion: 'Presión',
  llanta_temp: 'Temperatura', llanta_desgaste: 'Vida útil', frenos_temp: 'Temperatura', frenos_vida: 'Vida útil', trans_temp: 'Temperatura del aceite',
};

const PREF_SIM = 'vista-simulacion';
const CLAVE_DETALLES = 'mi_trailer_detalles';
const NOMBRE_POS = { izq: 'Izquierda', der: 'Derecha', 'izq-ext': 'Izquierda exterior', 'izq-int': 'Izquierda interior', 'der-int': 'Derecha interior', 'der-ext': 'Derecha exterior' };
const CAMPOS_LLANTA = [
  ['marca', 'Marca', 'text', 'Ej: Michelin'], ['medida', 'Medida', 'text', 'Ej: 295/80R22.5'], ['serie', 'DOT / N.º de serie', 'text', ''],
  ['labrado', 'Labrado (mm)', 'number', ''], ['presion', 'Presión recomendada (PSI)', 'number', ''], ['fecha', 'Fecha de instalación', 'date', ''],
  ['km', 'Km de instalación', 'number', ''], ['estado', 'Estado', 'select', 'Nueva|Buena|Regular|Cambiar pronto'], ['notas', 'Notas', 'text', ''],
];
const CAMPOS_FRENO = [
  ['tipo', 'Tipo', 'select', 'Tambor|Disco'], ['marca', 'Marca de zapatas / pastillas', 'text', ''], ['fecha', 'Fecha del último cambio', 'date', ''],
  ['km', 'Km del último cambio', 'number', ''], ['vida', 'Vida restante (%)', 'number', ''], ['estado', 'Estado', 'select', 'Nuevo|Bueno|Regular|Cambiar pronto'],
  ['notas', 'Notas', 'text', ''],
];
const posiciones = (ejeId, delantero) => ({
  llanta: delantero ? ['izq', 'der'] : ['izq-ext', 'izq-int', 'der-int', 'der-ext'],
  freno: ['izq', 'der'],
});
function leerDetalles() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_DETALLES)) || {};
  } catch {
    return {};
  }
}
const claveDetalle = (d) => `${d.eje}|${d.tipo}|${d.pos}`;
let estado = null;

// ---------------------------------------------------------------- datos
function armar(id) {
  const u = unidad(id);
  if (!u) return null;
  const otro = pareja(id);
  const cab = u.rol === 'cabezal' ? u : otro?.rol === 'cabezal' ? otro : null;
  const rem = u.rol === 'remolque' ? u : otro?.rol === 'remolque' ? otro : null;
  const puntos = [];
  if (cab && rem) {
    puntos.push({ id: 'u-cab', grupo: 'todo', pos: [0.9, 3.95, 1.0], nombre: `Cabezal ${cab.placa}`, ir: 'cab', unidad: cab });
    puntos.push({ id: 'u-rem', grupo: 'todo', pos: [-7.35, 3.55, 0.6], nombre: `Remolque ${rem.placa}`, ir: 'rem', unidad: rem });
  }
  if (cab) {
    componentesDe(cab.id).forEach((c) => {
      const p = PUNTOS_CAB[c.nombre];
      if (p) puntos.push({ id: `cab-${p[0]}`, grupo: 'cab', pos: p[1], nombre: c.nombre, parte: `cab-${p[0]}`, unidad: cab, componente: c.nombre });
    });
  }
  let comps = [];
  if (rem) {
    componentesDe(rem.id).forEach((c) => {
      const p = PUNTOS_REM[c.nombre];
      if (p) puntos.push({ id: `rem-${p[0]}`, grupo: 'rem', pos: p[1], nombre: c.nombre, parte: `rem-${p[0]}`, unidad: rem, componente: c.nombre });
    });
    if (plantilla(rem.tipo_unidad_id)?.tanque) {
      comps = compartimentosDe(rem.id);
      tramosTanque(comps).forEach((t, i) => {
        puntos.push({ id: `rem-comp-${i}`, grupo: 'rem', pos: [(t.x0 + t.x1) / 2, TANQUE.y + 0.15, 1.03], nombre: `Compartimento ${comps[i].orden}`, parte: `rem-comp-${i}`, unidad: rem, compartimento: comps[i] });
      });
    }
  }
  const foco = cab ? 'cab' : 'rem';
  return { u, cab, rem, comps, puntos, focoInicial: foco };
}

function tramosTanque(comps) {
  const gal = comps.map((c) => Number(c.capacidad_galones) || 0);
  const llenos = gal.filter((g) => g > 0);
  const ref = llenos.length ? llenos.reduce((a, b) => a + b, 0) / llenos.length : 1;
  const pesos = gal.map((g) => g || ref);
  const base = pesos.reduce((a, b) => a + b, 0) || 1;
  const largo = TANQUE.xFrente - TANQUE.xFondo;
  let x = TANQUE.xFrente;
  return pesos.map((p) => {
    const x0 = x;
    x -= (largo * p) / base;
    return { x0, x1: x };
  });
}

const kmCab = (e) => (e.cab ? lecturasKm(e.cab.id)[0]?.km : undefined);
const totalTanque = (comps) => V.totalCompartimentos(comps.map((c) => ({ galones: c.capacidad_galones })));

function simulacionActiva() {
  try {
    return localStorage.getItem(PREF_SIM) !== 'no';
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------- HTML
const ICONO_NAV = {
  flota: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 7h11v9H2zM13 10h4l3 3v3h-7z"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
  mantenimiento: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/><path d="M5 5l4 4M3 7l4-4"/></svg>',
  diagnostico: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  telemetria: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/><circle cx="12" cy="16" r="1.4"/></svg>',
};

// opciones.inicio: página principal; opciones.ultimoServicio(unidad, componente, compartimento) → texto o null
export function htmlVista(id, opciones = {}) {
  const inicio = opciones.inicio || '#/';
  if (estado?.detener) estado.detener();
  const e = armar(id);
  if (!e) return `<a class="volver" href="${inicio}">‹ Volver</a><h1 tabindex="-1">No se encontró la unidad</h1>`;
  const usuario = db().usuario;
  const avisos = activas().filter((u) => !conductorDe(u.id) || (u.rol === 'remolque' && !pareja(u.id))).length;
  const iniciales = (usuario.nombre || 'Mi cuenta').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  estado = {
    e, puntos: e.puntos, foco: e.focoInicial, ultimoServicio: opciones.ultimoServicio, alSeleccionar: opciones.alSeleccionar, detalle: null, modo: 'telemetria', sim: simulacionActiva(), etiquetas: false, info: true,
    paneles: { izq: null, der: null }, historial: Array.from({ length: 40 }, (_, i) => 70 + 12 * Math.sin(i / 3)),
    sensores: JSON.parse(JSON.stringify(SENSORES)),
  };
  crearSensoresEjes(e.puntos, estado.sensores);
  const vistas = e.cab && e.rem ? [['todo', 'Conjunto'], ['cab', 'Cabezal'], ['rem', 'Remolque']] : [];
  return `<div class="tos ${opciones.embebido ? 'tos-embebido' : ''}" id="tos">
  <header class="tos-top">
    <button type="button" class="tos-icono-btn tos-menu" data-v="menu" aria-label="Mostrar u ocultar el menú lateral">☰</button>
    <a class="tos-logo" href="${opciones.inicio || `#/unidad/${e.u.id}`}" aria-label="Volver"><span class="tos-volver" aria-hidden="true">‹</span><b>CAMIONES</b><span>WANG</span></a>
    <label class="tos-buscar"><span class="sr-only">Buscar una parte</span><span aria-hidden="true">⌕</span><input id="tos-q" type="search" placeholder="Buscar parte" autocomplete="off"></label>
    ${vistas.length ? `<div class="tos-vistas" role="group" aria-label="Encuadre">${vistas.map(([k, t]) => `<button type="button" class="tos-vista" data-v="foco" data-foco="${k}" title="${t}"><span class="tos-vista-pt" aria-hidden="true"></span><span class="tos-vista-txt">${t}</span></button>`).join('')}</div>` : ''}
    <span class="tos-espacio"></span>
    <button type="button" class="tos-control" data-v="sim" aria-pressed="${estado.sim}"><span aria-hidden="true">◉</span> <span class="tos-control-txt">Simulación</span></button>
    <a class="tos-icono-btn tos-campana" href="${inicio}" aria-label="Avisos: ${avisos}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>${avisos ? '<span class="tos-punto-rojo"></span>' : ''}</a>
    <a class="tos-usuario" href="${opciones.cuenta || '#/cuenta'}"><span class="tos-avatar" aria-hidden="true">${esc(iniciales)}</span><span class="tos-usuario-txt">${esc(usuario.nombre || 'Mi cuenta')}<small>${esc([e.cab?.placa, e.rem?.placa].filter(Boolean).join(' + '))}</small></span></a>
  </header>
  <nav class="tos-lateral" aria-label="Secciones">
    <a class="tos-nav" href="${inicio}">${ICONO_NAV.flota}<span>Flota</span></a>
    <button type="button" class="tos-nav" data-v="modo" data-modo="mantenimiento">${ICONO_NAV.mantenimiento}<span>Mantenimiento</span></button>
    <button type="button" class="tos-nav" data-v="modo" data-modo="diagnostico">${ICONO_NAV.diagnostico}<span>Diagnóstico</span></button>
    <button type="button" class="tos-nav" data-v="modo" data-modo="telemetria">${ICONO_NAV.telemetria}<span>Telemetría</span></button>
  </nav>
  <main class="tos-main">
    <div class="tos-zona" id="tos-zona">
      <div class="tos-escena" id="tos-escena">
        <canvas id="tos-canvas" aria-hidden="true"></canvas>
        <svg class="tos-lineas" id="tos-lineas" aria-hidden="true"></svg>
        <div class="tos-puntos" id="tos-puntos">
          ${e.puntos.map((p) => `<button type="button" class="tos-pt ${p.ir ? 'tos-pt-unidad' : ''}" data-v="punto" data-id="${p.id}" aria-label="${esc(p.nombre)}" hidden><span class="tos-pt-anillo" aria-hidden="true"></span><span class="tos-pt-txt">${esc(p.nombre)}</span></button>`).join('')}
        </div>
        <div class="tos-herr">
          <button type="button" class="tos-chip" data-v="etiquetas" aria-pressed="false"><span aria-hidden="true">☰</span> Etiquetas</button>
          <button type="button" class="tos-chip" data-v="info" aria-pressed="true"><span aria-hidden="true">ⓘ</span> Información</button>
        </div>
        <p class="tos-sim-aviso" id="tos-sim-aviso">SIMULADO · los sensores llegan en la fase 2</p>
        <p class="tos-ayuda" aria-hidden="true">Arrastre para girar · pellizque para acercar</p>
        <p class="tos-sin3d" id="tos-sin3d" hidden>Este teléfono no puede mostrar el modelo 3D. Use la lista de partes.</p>
      </div>
      <div class="tos-paneles" id="tos-paneles" aria-live="polite">
        <aside class="tos-panel" id="tos-izq" hidden></aside>
        <aside class="tos-panel tos-panel-der" id="tos-der" hidden></aside>
      </div>
    </div>
    <div class="tos-partes" id="tos-partes" role="group" aria-label="Partes"></div>
  </main>
</div>`;
}

// ---------------------------------------------------------------- paneles
const fila = (k, v, cls = '') => (v === '' || v === undefined || v === null ? '' : `<div class="${cls}"><dt>${k}</dt><dd>${esc(v)}</dd></div>`);

function valorSensor(k) {
  const s = estado.sensores[k];
  return estado.sim ? `${Math.round(s.v)} ${s.unidad}` : '—';
}

function filaSensor(k) {
  return `<div><dt>${nombreSensor(k)}</dt><dd data-s="${k}" data-f="texto" class="tos-sensor">${valorSensor(k)}</dd></div>`;
}

function barraSensor(k, etiqueta, color) {
  const s = estado.sensores[k];
  const pct = estado.sim ? Math.round(((s.v - 0) / s.alto) * 100) : 0;
  return `<div class="tos-barra-fila"><span>${etiqueta}</span><span data-s="${k}" data-f="texto" class="tos-sensor">${valorSensor(k)}</span>
    <span class="tos-barra ${estado.sim ? '' : 'tos-barra-vacia'}"><span data-s="${k}" data-f="barra" style="width:${pct}%;--c:${color}"></span></span></div>`;
}

function grafico() {
  return `<div class="tos-grafico"><span class="tos-graf-ej" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></span>
    <svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="30" x2="200" y2="30" class="tos-graf-media"/><polyline id="tos-graf" points="${puntosGrafico()}"/><circle id="tos-graf-pt" r="3" cx="${200 * 0.8}" cy="30"/></svg></div>`;
}

function puntosGrafico() {
  if (!estado.sim) return '0,58 200,58';
  const h = estado.historial;
  return h.map((v, i) => `${((i / (h.length - 1)) * 200).toFixed(1)},${(60 - (v / 100) * 56).toFixed(1)}`).join(' ');
}

function etiquetaSim() {
  return estado.sim ? '<span class="tos-sim">SIMULADO</span>' : '<span class="tos-sim tos-sim-off">SIN SENSOR</span>';
}

const esEje = (p) => /^(cab|rem)-eje-\d$/.test(p?.id || '');
const clavesEje = (id) => [`${id}-presion`, `${id}-temp`, `${id}-freno`, `${id}-vida`];
const NOMBRE_EJE = { presion: 'Presión de llantas', temp: 'Temperatura de llantas', freno: 'Temperatura de frenos', vida: 'Vida útil de frenos' };
const nombreSensor = (k) => NOMBRE_SENSOR[k] || NOMBRE_EJE[k.split('-').pop()] || k;
function clavesDe(p) {
  return esEje(p) ? clavesEje(p.id) : SENSORES_DE[p?.componente] || null;
}
function crearSensoresEjes(puntos, sensores) {
  puntos.filter(esEje).forEach((p) => {
    const r = Math.random();
    const vida = 55 + Math.round(r * 35);
    sensores[`${p.id}-presion`] = { ...SENSORES.llanta_presion, v: 106 + r * 6 };
    sensores[`${p.id}-temp`] = { ...SENSORES.llanta_temp, v: 38 + r * 7 };
    sensores[`${p.id}-freno`] = { ...SENSORES.frenos_temp, v: 80 + r * 40 };
    sensores[`${p.id}-vida`] = { ...SENSORES.frenos_vida, v: vida, min: vida - 1, max: vida + 1 };
  });
}

function estadoComponente(claves) {
  if (typeof claves === 'string') claves = claves ? claves.split(',') : null;
  if (!estado.sim || !claves?.length) return { texto: 'Sin datos', cls: '' };
  const fuera = claves.some((k) => estado.sensores[k].v > (estado.sensores[k].alerta ?? Infinity));
  return fuera ? { texto: 'Revisar', cls: 'tos-aviso' } : { texto: 'Óptimo', cls: 'tos-ok' };
}

function intervalosHTML(u, componente, limite = 3) {
  if (u.rol !== 'cabezal') return '<p class="tos-nota">Sin intervalos definidos todavía.</p>';
  const nombres = [].concat(componente);
  const lista = intervalosDe(u.id).filter((x) => nombres.includes(x.componente));
  if (!lista.length) return '<p class="tos-nota">Sin intervalos para esta parte.</p>';
  const txt = (x) => [x.cada_km ? `${miles(x.cada_km)} km` : '', x.cada_meses ? `${x.cada_meses} meses` : ''].filter(Boolean).join(' o ');
  return `<ul class="tos-lista">${lista.slice(0, limite).map((x) => `<li><span>${esc(x.tarea)}</span><strong>cada ${txt(x)}</strong></li>`).join('')}</ul>`;
}

function cabecera(titulo, sub, id) {
  return `<div class="tos-p-cab">
    <button type="button" class="tos-p-titulo" data-v="plegar" data-panel="${id}" aria-expanded="true"><span>${esc(titulo)}</span>${sub ? `<small>/ ${esc(sub)}</small>` : ''}<span class="tos-p-flecha" aria-hidden="true">⌄</span></button>
    <button type="button" class="tos-p-cerrar" data-v="cerrar" data-panel="${id}" aria-label="Cerrar panel">×</button>
  </div>`;
}

function contenidoPanel(p, lado) {
  const e = estado.e;
  if (p.ir) {
    const u = p.unidad;
    const pl = plantilla(u.tipo_unidad_id);
    const km = kmCab(e);
    return `${cabecera(u.rol === 'cabezal' ? 'Cabezal' : pl?.nombre || 'Remolque', u.placa, lado)}
      <div class="tos-p-cuerpo"><dl class="tos-datos">
        ${fila('Unidad', nombreUnidad(u))}
        ${fila('Kilometraje', km !== undefined ? `${miles(km)} km` : 'Sin registrar')}
        ${pl?.tanque ? fila('Capacidad', `${miles(totalTanque(e.comps))} gal`) : ''}
        ${fila('Conductor', conductorDe(u.id)?.nombre || 'Sin asignar')}
      </dl>
      <button type="button" class="tos-p-accion" data-v="foco" data-foco="${p.ir}">Ver partes ›</button></div>`;
  }
  if (p.compartimento) {
    const c = p.compartimento;
    const total = totalTanque(e.comps);
    const pct = total ? Math.round((Number(c.capacidad_galones) / total) * 100) : 0;
    return `${cabecera(`Compartimento ${c.orden}`, c.nombre || p.unidad.placa, lado)}
      <div class="tos-p-cuerpo">
        <p class="tos-grande">${miles(c.capacidad_galones)}<small> gal</small></p>
        <div class="tos-barra-fila"><span>Del tanque</span><span>${pct} %</span><span class="tos-barra"><span style="width:${pct}%;--c:#38e1ff"></span></span></div>
        <dl class="tos-datos">${fila('Capacidad total', `${miles(total)} gal`)}${fila('Posición', c.orden === 1 ? 'Adelante' : `${c.orden} de ${e.comps.length}`)}</dl>
        <p class="tos-nota">Último mantenimiento: ${esc(estado.ultimoServicio?.(p.unidad, null, c) || 'sin registros todavía')}.</p>
      </div>`;
  }
  const n = p.componente;
  const u = p.unidad;
  const a = u.atributos || {};
  const claves = clavesDe(p);
  const est = estadoComponente(claves);
  const attrEstado = esc((claves || []).join(','));
  let cuerpo = '';
  if (estado.modo === 'mantenimiento') {
    cuerpo = `<dl class="tos-datos">${fila('Kilometraje', kmCab(e) !== undefined ? `${miles(kmCab(e))} km` : 'Sin registrar')}${fila('Último servicio', estado.ultimoServicio?.(u, n) || 'Sin registrar')}</dl>
      <h3 class="tos-p-sec">Intervalos</h3>${intervalosHTML(u, esEje(p) ? ['Llantas', 'Frenos', 'Ejes'] : n, 8)}`;
  } else if (estado.modo === 'diagnostico') {
    cuerpo = `<dl class="tos-datos">
        <div><dt>Estado</dt><dd class="${est.cls}" data-estado="${attrEstado}">${est.texto}</dd></div>
        ${fila('Alertas', estado.sim ? 'Ninguna' : 'Sin datos')}
        ${(claves || []).map(filaSensor).join('')}
      </dl>${claves ? etiquetaSim() : ''}`;
  } else if (esEje(p)) {
    const [kp, kt, kf, kv] = clavesEje(p.id);
    const s = estado.sensores;
    const pct = (k) => (estado.sim ? Math.round((s[k].v / s[k].alto) * 100) : 0);
    const delantero = n === 'Eje delantero';
    cuerpo = `<dl class="tos-datos"><div><dt>Estado</dt><dd class="${est.cls}" data-estado="${attrEstado}">${est.texto}</dd></div></dl>
      <div class="tos-dos">
        <div><span class="tos-mini">Presión:</span><span class="tos-grande tos-verde" data-s="${kp}" data-f="texto">${valorSensor(kp)}</span>
          <span class="tos-barra ${estado.sim ? '' : 'tos-barra-vacia'}"><span data-s="${kp}" data-f="barra" style="width:${pct(kp)}%;--c:#5cf2a0"></span></span></div>
        <div><span class="tos-mini">Temperatura:</span><span class="tos-grande tos-amarillo" data-s="${kt}" data-f="texto">${valorSensor(kt)}</span>
          <span class="tos-barra ${estado.sim ? '' : 'tos-barra-vacia'}"><span data-s="${kt}" data-f="barra" style="width:${pct(kt)}%;--c:#ffd166"></span></span></div>
      </div>
      ${barraSensor(kf, 'Temperatura de frenos', '#ff9f43')}
      ${barraSensor(kv, 'Vida útil de frenos', '#a8f05c')}
      ${etiquetaSim()}
      <dl class="tos-datos tos-datos-reales">
        ${fila('Llantas en este eje', delantero ? '2 (sencillas)' : '4 (dobles)')}
        ${fila('Último servicio', estado.ultimoServicio?.(u, n) || 'Sin registrar')}
      </dl>
      ${listaDetallesEje(p.id, delantero)}
      <h3 class="tos-p-sec">Mantenimiento</h3>${intervalosHTML(u, ['Llantas', 'Frenos', 'Ejes'], 4)}`;
    if (estado.detalle?.eje === p.id) cuerpo = formularioDetalle(estado.detalle) + cuerpo;
  } else if (n === 'Motor') {
    cuerpo = `<dl class="tos-datos">
        <div><dt>Estado</dt><dd class="${est.cls}" data-estado="${attrEstado}">${est.texto}</dd></div>
        ${filaSensor('motor_temp')}${filaSensor('motor_aceite')}
      </dl>
      <h3 class="tos-p-sec">Estado de rendimiento ${etiquetaSim()}</h3>
      ${grafico()}
      ${barraSensor('motor_temp', 'Temperatura', '#38e1ff')}
      ${barraSensor('motor_carga', 'Carga', '#ff9f43')}
      ${barraSensor('motor_aceite', 'Aceite', '#ff6b5a')}
      <dl class="tos-datos tos-datos-reales">${fila('Motor', a.motor)}${fila('Kilometraje', kmCab(e) !== undefined ? `${miles(kmCab(e))} km` : '')}</dl>`;
  } else if (n === 'Llantas') {
    const s = estado.sensores;
    const pctP = estado.sim ? Math.round((s.llanta_presion.v / s.llanta_presion.alto) * 100) : 0;
    const pctT = estado.sim ? Math.round((s.llanta_temp.v / s.llanta_temp.alto) * 100) : 0;
    cuerpo = `<p class="tos-linea-top">Presión: <strong class="tos-ok" data-s="llanta_presion" data-f="texto">${valorSensor('llanta_presion')}</strong> ${etiquetaSim()}</p>
      <div class="tos-dos">
        <div><span class="tos-mini">Presión:</span><span class="tos-grande tos-verde" data-s="llanta_presion" data-f="texto">${valorSensor('llanta_presion')}</span>
          <span class="tos-barra ${estado.sim ? '' : 'tos-barra-vacia'}"><span data-s="llanta_presion" data-f="barra" style="width:${pctP}%;--c:#5cf2a0"></span></span></div>
        <div><span class="tos-mini">Temperatura:</span><span class="tos-grande tos-amarillo" data-s="llanta_temp" data-f="texto">${valorSensor('llanta_temp')}</span>
          <span class="tos-barra ${estado.sim ? '' : 'tos-barra-vacia'}"><span data-s="llanta_temp" data-f="barra" style="width:${pctT}%;--c:#ffd166"></span></span></div>
      </div>
      ${barraSensor('llanta_desgaste', 'Vida útil', '#a8f05c')}
      <dl class="tos-datos tos-datos-reales">${fila('Número de llantas', u.num_llantas)}</dl>`;
  } else {
    let datos = '';
    if (n === 'Transmisión') datos = fila('Tipo', a.transmision || 'Sin registrar');
    if (n === 'Ejes') datos = fila('Número de ejes', u.num_ejes);
    if (n === 'Frenos') datos = fila('Ejes con freno', u.num_ejes);
    if (n === 'Quinta rueda') {
      const otro = pareja(u.id);
      datos = otro ? fila('Enganchado con', otro.placa) + fila('Desde', acopleActivo(u.id)?.desde) : fila('Estado', 'Sin enganchar');
    }
    if (n === 'Tanque') {
      const total = totalTanque(e.comps);
      datos = fila('Material', a.material) + fila('Transporta', a.producto) + fila('Placa del tanque', a.placa_tanque);
      cuerpo = `<p class="tos-grande">${miles(total)}<small> gal</small></p>
        <ul class="tos-comps">${e.comps.map((c) => {
          const pct = total ? Math.round((Number(c.capacidad_galones) / total) * 100) : 0;
          return `<li><span>${c.orden}${c.nombre ? ` · ${esc(c.nombre)}` : ''}</span><span class="tos-barra"><span style="width:${pct}%;--c:#38e1ff"></span></span><strong>${miles(c.capacidad_galones)}</strong></li>`;
        }).join('')}</ul>`;
    }
    if (n === 'Válvulas') datos = fila('Compartimentos', e.comps.length);
    if (n === 'Piso') datos = fila('Largo', a.largo_pies ? `${a.largo_pies} pies` : '');
    if (n === 'Twist locks') datos = fila('Twist locks', a.twist_locks === 'si' ? 'Sí' : a.twist_locks === 'no' ? 'No' : '');
    if (n === 'Puertas') datos = fila('Número de puertas', a.puertas);
    if (n === 'Equipo de frío') datos = fila('Refrigerado', a.refrigerado === 'si' ? 'Sí' : a.refrigerado === 'no' ? 'No' : '');
    const sens = claves;
    cuerpo += `${sens ? `<dl class="tos-datos"><div><dt>Estado</dt><dd class="${est.cls}" data-estado="${attrEstado}">${est.texto}</dd></div>${sens.map(filaSensor).join('')}</dl>${etiquetaSim()}` : ''}
      ${datos ? `<dl class="tos-datos tos-datos-reales">${datos}</dl>` : ''}
      <h3 class="tos-p-sec">Mantenimiento</h3>${intervalosHTML(u, n)}`;
  }
  const sub = n === 'Motor' && a.motor ? a.motor : `${u.rol === 'cabezal' ? 'Cabezal' : 'Remolque'} ${u.placa}`;
  return `${cabecera(n === 'Llantas' ? 'Neumáticos' : n, sub, lado)}<div class="tos-p-cuerpo">${cuerpo}</div>`;
}

function resumenDetalle(d) {
  if (!d) return '<span class="tos-nota">Sin datos</span>';
  const partes = [d.marca, d.medida || d.tipo, d.estado].filter(Boolean);
  return esc(partes.join(' · ') || 'Con notas');
}

function listaDetallesEje(ejeId, delantero) {
  const datos = leerDetalles();
  const pos = posiciones(ejeId, delantero);
  const item = (tipo, p) => {
    const d = { eje: ejeId, tipo, pos: p };
    const sel = estado.detalle && claveDetalle(estado.detalle) === claveDetalle(d);
    return `<li><button type="button" class="tos-det ${sel ? 'sel' : ''}" data-v="detalle" data-eje="${ejeId}" data-tipo="${tipo}" data-pos="${p}">
      <span>${tipo === 'llanta' ? 'Llanta' : 'Freno'} ${NOMBRE_POS[p].toLowerCase()}</span><small>${resumenDetalle(datos[claveDetalle(d)])}</small></button></li>`;
  };
  return `<h3 class="tos-p-sec">Llantas</h3><ul class="tos-dets">${pos.llanta.map((p) => item('llanta', p)).join('')}</ul>
    <h3 class="tos-p-sec">Frenos</h3><ul class="tos-dets">${pos.freno.map((p) => item('freno', p)).join('')}</ul>
    <p class="tos-nota">También puede tocar cada llanta o freno en el camión.</p>`;
}

function formularioDetalle(d) {
  const campos = d.tipo === 'llanta' ? CAMPOS_LLANTA : CAMPOS_FRENO;
  const v = leerDetalles()[claveDetalle(d)] || {};
  const campo = ([k, et, tipo, extra]) => {
    const id = `det-${k}`;
    const val = esc(v[k] ?? '');
    const control = tipo === 'select'
      ? `<select id="${id}" data-campo="${k}"><option value="">—</option>${extra.split('|').map((o) => `<option ${v[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
      : `<input id="${id}" data-campo="${k}" type="${tipo}" ${tipo === 'number' ? 'inputmode="decimal" min="0" step="any"' : ''} value="${val}" placeholder="${esc(extra)}">`;
    return `<label class="tos-campo" for="${id}"><span>${et}</span>${control}</label>`;
  };
  return `<form class="tos-form" id="tos-form-detalle" data-v-form="detalle">
    <h3 class="tos-p-sec tos-form-titulo">${d.tipo === 'llanta' ? 'Llanta' : 'Freno'} ${NOMBRE_POS[d.pos].toLowerCase()}</h3>
    ${campos.map(campo).join('')}
    ${v.actualizado ? `<p class="tos-nota">Actualizado: ${esc(new Date(v.actualizado).toLocaleString('es-EC'))}</p>` : ''}
    <div class="tos-form-botones"><button type="submit" class="tos-p-accion">Guardar</button><button type="button" class="tos-p-accion tos-sec" data-v="cerrar-detalle">Cerrar</button></div>
  </form>`;
}

function abrirDetalle(d) {
  estado.detalle = d;
  if (estado.paneles.izq !== d.eje && estado.paneles.der !== d.eje) seleccionar(d.eje);
  else pintarPaneles();
  estado.alSeleccionar?.(estado.puntos.find((x) => x.id === d.eje), d);
  const lado = estado.paneles.izq === d.eje ? 'izq' : 'der';
  const panel = document.getElementById(`tos-${lado}`);
  panel.classList.remove('plegado');
  panel.scrollTop = 0;
  panel.querySelector('#det-marca, #det-tipo')?.focus({ preventScroll: true });
}

function guardarDetalle(form) {
  const datos = leerDetalles();
  const v = {};
  form.querySelectorAll('[data-campo]').forEach((el) => {
    if (el.value.trim() !== '') v[el.dataset.campo] = el.value.trim();
  });
  v.actualizado = new Date().toISOString();
  datos[claveDetalle(estado.detalle)] = v;
  try {
    localStorage.setItem(CLAVE_DETALLES, JSON.stringify(datos));
  } catch {}
  estado.detalle = null;
  pintarPaneles();
}

function pintarPaneles() {
  ['izq', 'der'].forEach((lado) => {
    const el = document.getElementById(`tos-${lado}`);
    const id = estado.paneles[lado];
    const p = estado.puntos.find((x) => x.id === id);
    el.hidden = !p || !estado.info;
    if (p) {
      const plegado = el.classList.contains('plegado') && el.dataset.id === id;
      el.dataset.id = id;
      el.innerHTML = contenidoPanel(p, lado);
      el.classList.toggle('plegado', plegado);
      el.querySelector('.tos-p-titulo')?.setAttribute('aria-expanded', String(!plegado));
    }
  });
  document.querySelectorAll('#tos-puntos .tos-pt').forEach((b) => b.classList.toggle('sel', Object.values(estado.paneles).includes(b.dataset.id)));
  document.querySelectorAll('#tos-partes .tos-parte').forEach((b) => b.setAttribute('aria-pressed', String(Object.values(estado.paneles).includes(b.dataset.id))));
  resaltarPartes();
}

// ---------------------------------------------------------------- sensores simulados
function tickSensores() {
  if (!document.getElementById('tos')) return;
  if (estado.sim) {
    Object.values(estado.sensores).forEach((s) => {
      s.v = Math.min(s.max, Math.max(s.min, s.v + (Math.random() - 0.5) * 2 * s.paso));
    });
    estado.historial.push(estado.sensores.motor_rend.v);
    estado.historial.shift();
  }
  document.querySelectorAll('#tos [data-s]').forEach((el) => {
    const k = el.dataset.s;
    const s = estado.sensores[k];
    if (el.dataset.f === 'texto') el.textContent = valorSensor(k);
    if (el.dataset.f === 'barra') el.style.width = `${estado.sim ? Math.round((s.v / s.alto) * 100) : 0}%`;
  });
  document.querySelectorAll('#tos [data-estado]').forEach((el) => {
    const est = estadoComponente(el.dataset.estado);
    el.textContent = est.texto;
    el.className = est.cls;
  });
  const g = document.getElementById('tos-graf');
  if (g) {
    g.setAttribute('points', puntosGrafico());
    const pt = document.getElementById('tos-graf-pt');
    const v = estado.historial[Math.round(0.8 * (estado.historial.length - 1))];
    pt.setAttribute('cy', estado.sim ? (60 - (v / 100) * 56).toFixed(1) : 58);
  }
}

// ---------------------------------------------------------------- 3D
let T = null;

function texturaPunto() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(190,246,255,.8)');
  r.addColorStop(1, 'rgba(56,225,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new T.CanvasTexture(c);
}

function muestrear(geo, densidad) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const tri = [];
  let total = 0;
  const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const area = new T.Vector3().subVectors(b, a).cross(new T.Vector3().subVectors(c, a)).length() / 2;
    total += area;
    tri.push(total);
  }
  const n = Math.min(1400, Math.max(12, Math.round(total * densidad)));
  const out = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const r = Math.random() * total;
    let lo = 0, hi = tri.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tri[m] < r) lo = m + 1; else hi = m; }
    const i = lo * 3;
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    out[k * 3] = a.x + (b.x - a.x) * u + (c.x - a.x) * v;
    out[k * 3 + 1] = a.y + (b.y - a.y) * u + (c.y - a.y) * v;
    out[k * 3 + 2] = a.z + (b.z - a.z) * u + (c.z - a.z) * v;
  }
  const res = new T.BufferGeometry();
  res.setAttribute('position', new T.BufferAttribute(out, 3));
  return res;
}

function crearFabrica(sprite) {
  const base = {
    linea: new T.LineBasicMaterial({ color: CIAN, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }),
    puntos: new T.PointsMaterial({ color: CIAN_CLARO, size: 0.055, map: sprite, transparent: true, opacity: 0.75, blending: T.AdditiveBlending, depthWrite: false }),
    relleno: new T.MeshBasicMaterial({ color: 0x1a8fd6, transparent: true, opacity: 0.07, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }),
  };
  const partes = {};
  const unidades = {};
  // Añade una pieza holográfica (relleno tenue + aristas + nube de puntos) a una parte.
  const tocables = [];
  const pieza = (clave, geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, densidad = 70, umbral = 25, sinPuntos = false, opacidad = 1, pick = null } = {}) => {
    const grupo = partes[clave];
    const obj = new T.Group();
    obj.position.set(x, y, z);
    obj.rotation.set(rx, ry, rz);
    const relleno = new T.Mesh(geo, base.relleno.clone());
    relleno.userData.tipo = 'relleno';
    const aristas = new T.LineSegments(new T.EdgesGeometry(geo, umbral), base.linea.clone());
    aristas.material.opacity *= opacidad;
    aristas.userData.tipo = 'linea';
    obj.add(relleno, aristas);
    if (!sinPuntos) {
      const pts = new T.Points(muestrear(geo, densidad), base.puntos.clone());
      pts.userData.tipo = 'puntos';
      obj.add(pts);
    }
    if (pick) {
      obj.userData.pick = pick;
      relleno.userData.pick = pick;
      tocables.push(relleno);
    }
    grupo.add(obj);
    return obj;
  };
  const linea = (clave, puntos, cerrada = false) => {
    const geo = new T.BufferGeometry().setFromPoints(puntos.map((p) => new T.Vector3(...p)));
    const l = new (cerrada ? T.LineLoop : T.Line)(geo, base.linea.clone());
    l.userData.tipo = 'linea';
    partes[clave].add(l);
  };
  const parte = (clave, unidadClave) => {
    const g = new T.Group();
    g.userData.clave = clave;
    partes[clave] = g;
    unidades[unidadClave].add(g);
  };
  const unidadGrupo = (clave, raiz) => {
    const g = new T.Group();
    unidades[clave] = g;
    raiz.add(g);
  };
  return { pieza, linea, parte, partes, unidades, unidadGrupo, tocables };
}

const caja = (w, h, d) => new T.BoxGeometry(w, h, d);
const cilX = (r, largo, seg = 20) => new T.CylinderGeometry(r, r, largo, seg).rotateZ(Math.PI / 2);
const cilZ = (r, ancho, seg = 24) => new T.CylinderGeometry(r, r, ancho, seg).rotateX(Math.PI / 2);
function extruir(puntos, prof, bisel = 0.05) {
  const s = new T.Shape();
  s.moveTo(...puntos[0]);
  puntos.slice(1).forEach((p) => (p.length === 4 ? s.quadraticCurveTo(...p) : s.lineTo(...p)));
  s.closePath();
  return new T.ExtrudeGeometry(s, { depth: prof, bevelEnabled: bisel > 0, bevelThickness: bisel, bevelSize: bisel, bevelSegments: 2, curveSegments: 10 }).translate(0, 0, -prof / 2);
}

function ruedas(f, clave, x, z0, dual, r = 0.52) {
  // clave = parte del eje, p. ej. 'cab-eje-0'
  // z positivo = lado del conductor (izquierdo)
  const lados = dual ? [[z0 - 0.3, 'int'], [z0, 'ext']] : [[z0, '']];
  [1, -1].forEach((sig) =>
    lados.forEach(([z, capa]) => {
      const pick = { tipo: 'llanta', eje: clave, pos: [sig > 0 ? 'izq' : 'der', capa].filter(Boolean).join('-') };
      f.pieza(clave, cilZ(r, 0.27, 28), { x, y: r, z: sig * z, densidad: 55, umbral: 30, pick });
      f.pieza(clave, cilZ(r * 0.6, 0.29, 20), { x, y: r, z: sig * z, sinPuntos: true, opacidad: 0.6, pick });
    }),
  );
  [1, -1].forEach((sig) =>
    f.pieza(clave, cilZ(r * 0.45, 0.18, 18), { x, y: r, z: sig * (z0 - (dual ? 0.5 : 0.25)), densidad: 40, pick: { tipo: 'freno', eje: clave, pos: sig > 0 ? 'izq' : 'der' } }),
  );
  f.pieza(clave, cilZ(0.07, z0 * 2, 10), { x, y: r, densidad: 20 });
  [1, -1].forEach((sig) => f.pieza(clave, cilZ(0.14, 0.12, 12), { x, y: r, z: sig * (z0 + 0.12), sinPuntos: true }));
}

function construirCabezal(f) {
  ['cab-cuerpo', 'cab-motor', 'cab-transmision', 'cab-quinta', 'cab-eje-0', 'cab-eje-1', 'cab-eje-2'].forEach((k) => f.parte(k, 'cab'));
  // cabina con dormitorio (perfil lateral extruido)
  f.pieza('cab-cuerpo', extruir([[2.15, 1.15], [2.15, 2.2], [1.55, 3.05], [1.45, 3.17, 1.28, 3.17], [-0.25, 3.2], [-0.55, 3.78, -1.15, 3.8], [-1.15, 1.15]], 2.3, 0.06), { densidad: 45, umbral: 20 });
  // capó
  f.pieza('cab-cuerpo', extruir([[3.95, 1.0], [3.95, 1.78], [3.88, 2.02, 3.5, 2.05], [2.15, 2.22], [2.15, 1.0]], 1.9, 0.08), { densidad: 45, umbral: 20 });
  // parrilla, paragolpes, faros
  f.pieza('cab-cuerpo', caja(0.08, 0.72, 1.12), { x: 4.0, y: 1.42, densidad: 50 });
  for (let i = -4; i <= 4; i++) f.linea('cab-cuerpo', [[4.05, 1.1, i * 0.12], [4.05, 1.74, i * 0.12]]);
  f.pieza('cab-cuerpo', caja(0.28, 0.34, 2.42), { x: 4.05, y: 0.84, densidad: 40 });
  [1, -1].forEach((s) => f.pieza('cab-cuerpo', caja(0.16, 0.18, 0.36), { x: 3.93, y: 1.28, z: s * 0.86, densidad: 60 }));
  // parabrisas, ventanas y puertas
  f.linea('cab-cuerpo', [[2.13, 2.28, -1.02], [2.13, 2.28, 1.02], [1.6, 3.0, 1.02], [1.6, 3.0, -1.02]], true);
  [1, -1].forEach((s) => {
    const z = s * 1.17;
    f.linea('cab-cuerpo', [[1.98, 2.35, z], [1.52, 2.98, z], [0.62, 2.98, z], [0.62, 2.35, z]], true);
    f.linea('cab-cuerpo', [[2.02, 1.28, z], [2.02, 2.28, z], [0.56, 2.28, z], [0.56, 1.28, z]], true);
    f.linea('cab-cuerpo', [[-0.15, 2.3, z], [-0.15, 2.85, z], [-0.85, 2.85, z], [-0.85, 2.3, z]], true);
    f.pieza('cab-cuerpo', caja(0.08, 0.5, 0.18), { x: 2.25, y: 2.45, z: s * 1.42, densidad: 60 });
    f.linea('cab-cuerpo', [[2.2, 2.2, s * 1.16], [2.25, 2.25, s * 1.38]]);
    // guardafango delantero y tanque de combustible
    f.pieza('cab-cuerpo', new T.TorusGeometry(0.66, 0.05, 6, 22, Math.PI), { x: EJES_CAB[0], y: 0.52, z: s * 1.13, densidad: 30 });
    f.pieza('cab-cuerpo', cilX(0.34, 1.15), { x: 0.95, y: 0.78, z: s * 1.02, densidad: 50 });
    f.pieza('cab-cuerpo', caja(0.5, 0.06, 0.32), { x: 1.75, y: 0.7, z: s * 1.02, sinPuntos: true });
  });
  // chasis y escape
  [1, -1].forEach((s) => f.pieza('cab-cuerpo', caja(7.1, 0.26, 0.12), { x: 0.4, y: 0.98, z: s * 0.48, densidad: 25 }));
  f.pieza('cab-cuerpo', cilZ(0.07, 2.6, 8).rotateX(Math.PI / 2), { x: -1.25, y: 2.45, z: 1.0, densidad: 30 });
  // motor bajo el capó
  f.pieza('cab-motor', caja(1.25, 0.72, 0.9), { x: 3.05, y: 1.45, densidad: 80 });
  for (let i = 0; i < 6; i++) f.pieza('cab-motor', caja(0.16, 0.12, 0.5), { x: 2.55 + i * 0.2, y: 1.9, sinPuntos: true });
  f.pieza('cab-motor', cilX(0.36, 0.06, 24), { x: 3.75, y: 1.45, sinPuntos: true });
  // transmisión y cardán
  f.pieza('cab-transmision', cilX(0.21, 0.95), { x: 1.95, y: 1.0, densidad: 80 });
  f.pieza('cab-transmision', cilX(0.06, 3.0, 8), { x: 0.05, y: 0.82, densidad: 25 });
  // quinta rueda
  f.pieza('cab-quinta', new T.CylinderGeometry(0.55, 0.55, 0.1, 28), { x: -2.2, y: 1.17, densidad: 90 });
  f.pieza('cab-quinta', caja(0.9, 0.08, 1.2), { x: -2.2, y: 1.08, sinPuntos: true });
  // ruedas, frenos y ejes
  ruedas(f, 'cab-eje-0', EJES_CAB[0], 1.1, false);
  ruedas(f, 'cab-eje-1', EJES_CAB[1], 1.25, true);
  ruedas(f, 'cab-eje-2', EJES_CAB[2], 1.25, true);
}

function construirRemolque(f, rem, comps, enganchado) {
  const p = plantilla(rem.tipo_unidad_id);
  ['rem-cuerpo', 'rem-tanque', 'rem-valvulas', 'rem-quinta', 'rem-eje-0', 'rem-eje-1', 'rem-eje-2', 'rem-piso', 'rem-twist', 'rem-puertas', 'rem-frio'].forEach((k) => f.parte(k, 'rem'));
  // bastidor, patas de apoyo y parachoques
  [1, -1].forEach((s) => f.pieza('rem-cuerpo', caja(11.3, 0.22, 0.12), { x: -7.4, y: 1.22, z: s * 0.5, densidad: 20 }));
  const pata = enganchado ? 0.75 : 1.05;
  [1, -1].forEach((s) => f.pieza('rem-cuerpo', caja(0.12, pata, 0.12), { x: -3.6, y: 1.12 - pata / 2, z: s * 0.85, densidad: 40 }));
  f.pieza('rem-cuerpo', caja(0.2, 0.18, 2.4), { x: -13.05, y: 0.82, densidad: 30 });
  [1, -1].forEach((s) => f.pieza('rem-cuerpo', caja(0.05, 0.6, 0.5), { x: -12.95, y: 0.62, z: s * 1.0, sinPuntos: true }));
  f.pieza('rem-quinta', caja(0.9, 0.08, 1.4), { x: -2.25, y: 1.3, densidad: 70 });
  f.pieza('rem-quinta', cilZ(0.06, 0.2, 8).rotateX(Math.PI / 2), { x: -2.2, y: 1.18, sinPuntos: true });

  if (p?.tanque) {
    const { xFrente, xFondo, y, r } = TANQUE;
    const largo = xFrente - xFondo;
    const perfil = [];
    const a = 0.45;
    for (let i = 0; i <= 10; i++) { const t = (i / 10) * (Math.PI / 2); perfil.push(new T.Vector2(r * Math.sin(t), -largo / 2 - a * Math.cos(t))); }
    for (let i = 10; i >= 0; i--) { const t = (i / 10) * (Math.PI / 2); perfil.push(new T.Vector2(r * Math.sin(t), largo / 2 + a * Math.cos(t))); }
    const geoT = new T.LatheGeometry(perfil, 36).rotateZ(Math.PI / 2);
    f.pieza('rem-tanque', geoT, { x: (xFrente + xFondo) / 2, y, densidad: 26, umbral: 40 });
    // anillos de refuerzo, pasarela y bocas
    for (let i = 0; i <= 8; i++) {
      const x = xFrente - (largo * i) / 8;
      const anillo = [];
      for (let k = 0; k <= 36; k++) { const t = (k / 36) * Math.PI * 2; anillo.push([x, y + r * Math.cos(t), r * Math.sin(t)]); }
      f.linea('rem-tanque', anillo);
    }
    f.linea('rem-tanque', [[xFrente - 0.3, y + r + 0.32, 0.45], [xFondo + 0.3, y + r + 0.32, 0.45]]);
    f.linea('rem-tanque', [[xFrente - 0.3, y + r + 0.32, -0.45], [xFondo + 0.3, y + r + 0.32, -0.45]]);
    // compartimentos proporcionales a los galones
    tramosTanque(comps).forEach((t, i) => {
      const clave = `rem-comp-${i}`;
      f.parte(clave, 'rem');
      const l = t.x0 - t.x1;
      const vacio = !(Number(comps[i].capacidad_galones) > 0);
      f.pieza(clave, cilX(r * 1.012, l, 36).deleteAttribute('normal'), { x: (t.x0 + t.x1) / 2, y, densidad: vacio ? 6 : 14, umbral: 80, opacidad: vacio ? 0.4 : 1 });
      f.pieza(clave, new T.CylinderGeometry(0.26, 0.26, 0.16, 18), { x: (t.x0 + t.x1) / 2, y: y + r + 0.06, densidad: 60 });
      if (i > 0) {
        const anillo = [];
        for (let k = 0; k <= 40; k++) { const a2 = (k / 40) * Math.PI * 2; anillo.push([t.x0, y + r * 1.02 * Math.cos(a2), r * 1.02 * Math.sin(a2)]); }
        f.linea(clave, anillo);
      }
    });
    // válvulas de descarga
    f.pieza('rem-valvulas', cilX(0.07, 5.2, 10), { x: -6.5, y: 1.08, z: 0.62, densidad: 30 });
    [-4.6, -5.9, -7.2, -8.5].forEach((x) => f.pieza('rem-valvulas', caja(0.2, 0.22, 0.2), { x, y: 1.18, z: 0.62, densidad: 80 }));
  } else if (rem.tipo_unidad_id === 'plataforma') {
    f.pieza('rem-piso', caja(11.4, 0.2, 2.5), { x: -7.35, y: 1.45, densidad: 18 });
    [-2.3, -7.35, -12.6].forEach((x) => [1, -1].forEach((s) => f.pieza('rem-twist', caja(0.18, 0.12, 0.18), { x, y: 1.6, z: s * 1.1, densidad: 90 })));
  } else if (rem.tipo_unidad_id === 'furgon') {
    f.pieza('rem-cuerpo', caja(11.4, 2.6, 2.5), { x: -7.35, y: 2.65, densidad: 12 });
    for (let i = 1; i < 12; i++) f.linea('rem-cuerpo', [[-1.65 - i * 0.95, 1.36, 1.26], [-1.65 - i * 0.95, 3.94, 1.26]]);
    f.pieza('rem-puertas', caja(0.06, 2.5, 2.4), { x: -13.08, y: 2.65, densidad: 30 });
    f.pieza('rem-frio', caja(0.35, 0.8, 1.6), { x: -1.48, y: 3.3, densidad: 60 });
  } else {
    f.pieza('rem-cuerpo', caja(11.4, 2.2, 2.5), { x: -7.35, y: 2.45, densidad: 6, opacidad: 0.6 });
  }
  EJES_REM.forEach((x, i) => ruedas(f, `rem-eje-${i}`, x, 1.25, true, 0.5));
}

function construirEntorno(escena, sprite) {
  // piso con rejilla que se desvanece
  const rejilla = new T.GridHelper(80, 80, CIAN, CIAN);
  rejilla.material.transparent = true;
  rejilla.material.opacity = 0.12;
  rejilla.material.depthWrite = false;
  rejilla.position.set(-5, 0, 0);
  escena.add(rejilla);
  const halo = new T.Mesh(new T.CircleGeometry(9, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: CIAN, transparent: true, opacity: 0.05, blending: T.AdditiveBlending, depthWrite: false }));
  halo.scale.set(1.6, 1, 0.5);
  halo.position.set(-4.5, 0.01, 0);
  escena.add(halo);
  // partículas flotantes
  const n = 420;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = -18 + Math.random() * 28;
    pos[i * 3 + 1] = Math.random() * 7;
    pos[i * 3 + 2] = -6 + Math.random() * 12;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  const part = new T.Points(geo, new T.PointsMaterial({ color: 0x8ff3ff, size: 0.07, map: sprite, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false }));
  escena.add(part);
  return part;
}

function colorearParte(grupo, modo) {
  grupo.traverse((o) => {
    if (!o.material || !o.userData.tipo) return;
    o.userData.base ??= { color: o.material.color.getHex(), opacity: o.material.opacity };
    const b = o.userData.base;
    if (modo === 'elegido') {
      o.material.color.setHex(o.userData.tipo === 'relleno' ? 0xffb020 : 0xffd166);
      o.material.opacity = o.userData.tipo === 'relleno' ? 0.45 : 1;
    } else if (modo === 'activo') {
      o.material.color.setHex(o.userData.tipo === 'relleno' ? CIAN : ACTIVO);
      o.material.opacity = o.userData.tipo === 'relleno' ? 0.2 : 1;
    } else {
      o.material.color.setHex(b.color);
      o.material.opacity = b.opacity * (modo === 'tenue' ? 0.1 : 1);
    }
  });
}

function resaltarPartes() {
  if (!estado.tres) return;
  const { partes } = estado.tres.fabrica;
  const activas = new Set(Object.values(estado.paneles).map((id) => estado.puntos.find((p) => p.id === id)?.parte).filter(Boolean));
  Object.entries(partes).forEach(([clave, g]) => {
    const deUnidad = clave.startsWith('cab') ? 'cab' : 'rem';
    const tenue = estado.foco !== 'todo' && deUnidad !== estado.foco;
    colorearParte(g, activas.has(clave) ? 'activo' : tenue ? 'tenue' : 'normal');
  });
  if (estado.detalle) {
    const k = claveDetalle(estado.detalle);
    partes[estado.detalle.eje]?.children.forEach((obj) => {
      const pk = obj.userData.pick;
      if (pk && claveDetalle(pk) === k) colorearParte(obj, 'elegido');
    });
  }
}

async function iniciar3D() {
  const canvas = document.getElementById('tos-canvas');
  try {
    T = T || (await import('../vendor/three.module.min.js'));
  } catch {
    document.getElementById('tos-sin3d').hidden = false;
    return null;
  }
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    document.getElementById('tos-sin3d').hidden = false;
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const escena = new T.Scene();
  escena.fog = new T.FogExp2(0x050c14, 0.028);
  const camara = new T.PerspectiveCamera(32, 1, 0.1, 200);
  const sprite = texturaPunto();
  const fabrica = crearFabrica(sprite);
  const raiz = new T.Group();
  escena.add(raiz);
  fabrica.unidadGrupo('cab', raiz);
  fabrica.unidadGrupo('rem', raiz);
  const e = estado.e;
  if (e.cab) construirCabezal(fabrica);
  if (e.rem) construirRemolque(fabrica, e.rem, e.comps, !!e.cab);
  const particulas = construirEntorno(escena, sprite);

  const orb = { ...ENCUADRES[estado.foco], objetivo: new T.Vector3(...ENCUADRES[estado.foco].objetivo) };
  const tres = { renderer, escena, camara, fabrica, particulas, orb, anim: null, ultimoToque: 0, raf: 0, vivo: true };
  estado.tres = tres;

  const tamano = () => {
    const r = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camara.aspect = r.width / Math.max(r.height, 1);
    camara.updateProjectionMatrix();
  };
  tamano();
  tres.tamano = tamano;

  // girar arrastrando, acercar con rueda o pellizco
  const punteros = new Map();
  let distInicial = 0, radioInicial = 0;
  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    tres.anim = null;
    if (punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      distInicial = Math.hypot(a.x - b.x, a.y - b.y);
      radioInicial = orb.radio;
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!punteros.has(ev.pointerId)) return;
    const prev = punteros.get(ev.pointerId);
    punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    tres.ultimoToque = performance.now();
    if (punteros.size === 1) {
      orb.azimut -= (ev.clientX - prev.x) * 0.006;
      orb.polar = Math.min(1.45, Math.max(0.55, orb.polar - (ev.clientY - prev.y) * 0.004));
    } else if (punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const base = ENCUADRES[estado.foco].radio;
      orb.radio = Math.min(base * 1.6, Math.max(base * 0.55, (radioInicial * distInicial) / Math.max(d, 1)));
    }
  });
  const rayo = new T.Raycaster();
  let inicioToque = null;
  canvas.addEventListener('pointerdown', (ev) => (inicioToque = { x: ev.clientX, y: ev.clientY }));
  const soltar = (ev) => {
    punteros.delete(ev.pointerId);
    if (ev.type !== 'pointerup' || !inicioToque || Math.hypot(ev.clientX - inicioToque.x, ev.clientY - inicioToque.y) > 8) return;
    const r = canvas.getBoundingClientRect();
    rayo.setFromCamera(new T.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camara);
    const visibles = fabrica.tocables.filter((m) => estado.puntos.some((p) => p.id === m.userData.pick.eje));
    const hit = rayo.intersectObjects(visibles, false)[0];
    if (hit) abrirDetalle({ ...hit.object.userData.pick });
  };
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const base = ENCUADRES[estado.foco].radio;
    orb.radio = Math.min(base * 1.6, Math.max(base * 0.55, orb.radio * (1 + Math.sign(ev.deltaY) * 0.08)));
    tres.ultimoToque = performance.now();
  }, { passive: false });

  const vec = new T.Vector3();
  const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cuadro = (t) => {
    if (!tres.vivo) return;
    if (!document.getElementById('tos-canvas')) return detener();
    if (tres.anim) {
      const k = Math.min(1, (t - tres.anim.t0) / 900);
      const f = 1 - Math.pow(1 - k, 3);
      const { de, a } = tres.anim;
      orb.objetivo.lerpVectors(de.objetivo, a.objetivo, f);
      orb.radio = de.radio + (a.radio - de.radio) * f;
      orb.azimut = de.azimut + (a.azimut - de.azimut) * f;
      orb.polar = de.polar + (a.polar - de.polar) * f;
      if (k >= 1) tres.anim = null;
    }
    const balanceo = !reducir && t - tres.ultimoToque > 4000 && !tres.anim ? Math.sin(t / 4000) * 0.07 : 0;
    const az = orb.azimut + balanceo;
    const radio = orb.radio * Math.pow(Math.max(1, 1.45 / camara.aspect), ENCUADRES[estado.foco].estrecho);
    camara.position.set(
      orb.objetivo.x + radio * Math.sin(orb.polar) * Math.sin(az),
      orb.objetivo.y + radio * Math.cos(orb.polar),
      orb.objetivo.z + radio * Math.sin(orb.polar) * Math.cos(az),
    );
    camara.lookAt(orb.objetivo);
    if (!reducir) {
      const p = particulas.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + 0.004;
        if (y > 7) y = 0;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
    renderer.render(escena, camara);
    // puntos HTML proyectados desde 3D y líneas hacia los paneles
    const ancho = canvas.clientWidth, alto = canvas.clientHeight;
    estado.pantalla = {};
    document.querySelectorAll('#tos-puntos .tos-pt').forEach((b) => {
      const pto = estado.puntos.find((x) => x.id === b.dataset.id);
      vec.set(...pto.pos).project(camara);
      const sx = (vec.x * 0.5 + 0.5) * ancho;
      const sy = (-vec.y * 0.5 + 0.5) * alto;
      estado.pantalla[pto.id] = [sx, sy];
      b.style.transform = `translate(${sx}px, ${sy}px)`;
    });
    const { izq, der } = estado.paneles;
    const pi = estado.pantalla[izq], pd = estado.pantalla[der];
    if (pi && pd && pi[0] > pd[0] + 60) {
      estado.paneles = { izq: der, der: izq };
      pintarPaneles();
    }
    dibujarLineas();
    tres.raf = requestAnimationFrame(cuadro);
  };
  tres.raf = requestAnimationFrame(cuadro);
  resaltarPartes();
  return tres;
}

function encuadrar(foco) {
  const t = estado.tres;
  if (!t) return;
  const destino = ENCUADRES[foco];
  t.anim = {
    t0: performance.now(),
    de: { objetivo: t.orb.objetivo.clone(), radio: t.orb.radio, azimut: t.orb.azimut, polar: t.orb.polar },
    a: { objetivo: new T.Vector3(...destino.objetivo), radio: destino.radio, azimut: destino.azimut, polar: destino.polar },
  };
}

function dibujarLineas() {
  const svg = document.getElementById('tos-lineas');
  if (!svg) return;
  if (!estado.info || !matchMedia('(min-width: 900px)').matches) {
    svg.innerHTML = '';
    return;
  }
  const escena = document.getElementById('tos-escena').getBoundingClientRect();
  let s = '';
  ['izq', 'der'].forEach((lado) => {
    const id = estado.paneles[lado];
    const panel = document.getElementById(`tos-${lado}`);
    const pt = estado.pantalla?.[id];
    if (!id || !pt || panel.hidden) return;
    const r = panel.getBoundingClientRect();
    const ax = lado === 'izq' ? r.right - escena.left : r.left - escena.left;
    const ay = r.top - escena.top + Math.min(64, r.height / 2);
    const codo = lado === 'izq' ? ax + 26 : ax - 26;
    const pts = `${ax},${ay} ${codo},${ay} ${pt[0]},${pt[1]}`;
    s += `<polyline class="tos-linea-fondo" points="${pts}"/><polyline points="${pts}"/><circle cx="${ax}" cy="${ay}" r="3.5"/><circle cx="${pt[0]}" cy="${pt[1]}" r="2.5"/>`;
  });
  svg.innerHTML = s;
}

function detener() {
  if (!estado) return;
  clearInterval(estado.reloj);
  if (estado.tres) {
    estado.tres.vivo = false;
    cancelAnimationFrame(estado.tres.raf);
    estado.tres.renderer.dispose();
    estado.tres = null;
  }
  window.removeEventListener('resize', estado.alRedimensionar);
}

// ---------------------------------------------------------------- interacción
function ponerFoco(foco) {
  estado.foco = foco;
  const visibles = estado.puntos.filter((p) => p.grupo === foco);
  document.querySelectorAll('#tos-puntos .tos-pt').forEach((b) => (b.hidden = !visibles.some((p) => p.id === b.dataset.id)));
  document.querySelectorAll('.tos-vista').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.foco === foco)));
  document.getElementById('tos-partes').innerHTML = visibles
    .map((p) => `<button type="button" class="tos-parte ${p.ir ? 'tos-parte-unidad' : ''}" data-v="punto" data-id="${p.id}">${esc(p.nombre)}</button>`)
    .join('');
  // paneles por defecto, como en un tablero: uno a cada lado
  const id = (x) => (visibles.some((p) => p.id === x) ? x : null);
  if (foco === 'todo') estado.paneles = { izq: id('u-cab'), der: id('u-rem') };
  else if (foco === 'cab') estado.paneles = { izq: id('cab-motor'), der: id('cab-eje-0') || id('cab-llantas') };
  else estado.paneles = { izq: id('rem-tanque') || visibles[0]?.id || null, der: id('rem-eje-0') || id('rem-llantas') };
  pintarPaneles();
  encuadrar(foco);
}

function seleccionar(id) {
  const p = estado.puntos.find((x) => x.id === id);
  if (!p) return;
  if (p.grupo !== estado.foco) ponerFoco(p.grupo);
  if (estado.detalle && estado.detalle.eje !== id) estado.detalle = null;
  estado.alSeleccionar?.(p, null);
  if (Object.values(estado.paneles).includes(id)) return enfocarPanel(id);
  const pos = estado.pantalla?.[id];
  const ancho = document.getElementById('tos-escena').clientWidth;
  const lado = pos ? (pos[0] < ancho / 2 ? 'izq' : 'der') : estado.paneles.izq ? 'der' : 'izq';
  estado.paneles[lado] = id;
  estado.info = true;
  document.querySelector('[data-v="info"]').setAttribute('aria-pressed', 'true');
  pintarPaneles();
  enfocarPanel(id);
}

function enfocarPanel(id) {
  const lado = estado.paneles.izq === id ? 'izq' : 'der';
  const el = document.getElementById(`tos-${lado}`);
  el.classList.remove('destello');
  void el.offsetWidth;
  el.classList.add('destello');
  if (!matchMedia('(min-width: 900px)').matches) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function ponerModo(modo) {
  estado.modo = modo;
  document.querySelectorAll('.tos-nav[data-modo]').forEach((b) => b.setAttribute('aria-current', b.dataset.modo === modo ? 'true' : 'false'));
  document.getElementById('tos').dataset.modo = modo;
  pintarPaneles();
}

function ponerSim(activa) {
  estado.sim = activa;
  try {
    localStorage.setItem(PREF_SIM, activa ? 'si' : 'no');
  } catch {}
  document.querySelector('[data-v="sim"]').setAttribute('aria-pressed', String(activa));
  document.getElementById('tos-sim-aviso').hidden = !activa;
  pintarPaneles();
}

function buscar(texto) {
  const q = texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const coincide = (p) => p.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q);
  document.querySelectorAll('#tos-puntos .tos-pt').forEach((b) => {
    const p = estado.puntos.find((x) => x.id === b.dataset.id);
    b.classList.toggle('atenuado', !!q && !coincide(p));
  });
  return q ? estado.puntos.filter((p) => !p.ir && coincide(p)) : [];
}

export function refrescarPaneles() {
  if (estado && document.getElementById('tos')) pintarPaneles();
}

export async function montarVista() {
  const raiz = document.getElementById('tos');
  if (!estado || !raiz) return;
  raiz.dataset.modo = estado.modo;
  document.getElementById('tos-sim-aviso').hidden = !estado.sim;
  raiz.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-v]');
    if (!el) return;
    const v = el.dataset.v;
    if (v === 'foco') ponerFoco(el.dataset.foco);
    if (v === 'punto') seleccionar(el.dataset.id);
    if (v === 'modo') ponerModo(el.dataset.modo);
    if (v === 'sim') ponerSim(!estado.sim);
    if (v === 'menu') raiz.classList.toggle('sin-lateral');
    if (v === 'etiquetas') {
      estado.etiquetas = !estado.etiquetas;
      el.setAttribute('aria-pressed', String(estado.etiquetas));
      raiz.classList.toggle('con-etiquetas', estado.etiquetas);
    }
    if (v === 'info') {
      estado.info = !estado.info;
      el.setAttribute('aria-pressed', String(estado.info));
      pintarPaneles();
    }
    if (v === 'cerrar') {
      estado.paneles[el.dataset.panel] = null;
      pintarPaneles();
    }
    if (v === 'detalle') abrirDetalle({ eje: el.dataset.eje, tipo: el.dataset.tipo, pos: el.dataset.pos });
    if (v === 'cerrar-detalle') {
      estado.detalle = null;
      pintarPaneles();
    }
    if (v === 'plegar') {
      const panel = document.getElementById(`tos-${el.dataset.panel}`);
      const plegado = panel.classList.toggle('plegado');
      el.setAttribute('aria-expanded', String(!plegado));
    }
  });
  raiz.addEventListener('submit', (ev) => {
    if (!ev.target.matches('[data-v-form="detalle"]')) return;
    ev.preventDefault();
    guardarDetalle(ev.target);
  });
  const q = document.getElementById('tos-q');
  q.addEventListener('input', () => buscar(q.value));
  q.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const r = buscar(q.value);
    if (r[0]) seleccionar(r[0].id);
  });
  ponerModo('telemetria');
  ponerFoco(estado.foco);
  estado.reloj = setInterval(tickSensores, 1000);
  estado.detener = detener;
  estado.alRedimensionar = () => estado.tres?.tamano();
  window.addEventListener('resize', estado.alRedimensionar);
  await iniciar3D();
  if (estado?.tres) {
    // arrancar sin animación en el encuadre inicial
    const d = ENCUADRES[estado.foco];
    Object.assign(estado.tres.orb, { radio: d.radio, azimut: d.azimut, polar: d.polar });
    estado.tres.orb.objetivo.set(...d.objetivo);
    estado.tres.anim = null;
  }
}
