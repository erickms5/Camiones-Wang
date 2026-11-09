// Vista interactiva del camión (estilo holográfico): cabezal + remolque con puntos tocables
// por componente. Muestra solo datos reales del registro; los sensores (temperatura, presión)
// quedan marcados para la fase de lectura automática (GPS / ESP32 / J1939).
import { miles } from './textos.js';
import * as V from './validaciones.js';
import { plantilla } from './plantillas.js';
import {
  esc, unidad, pareja, acopleActivo, compartimentosDe, componentesDe, lecturasKm, conductorDe, nombreUnidad, intervalosDe,
} from './consultas.js';

// Zonas de la escena (coordenadas del dibujo, viewBox 1000 × 420)
const ZONA = {
  todo: { x: 8, y: 52, w: 984, h: 330 },
  cab: { x: 8, y: 52, w: 396, h: 320 },
  rem: { x: 284, y: 88, w: 708, h: 290 },
};
const TANQUE = { x0: 304, x1: 972, y0: 152, y1: 280 };
const RUEDAS_CAB = [90, 300, 366];
const RUEDAS_REM = [820, 884, 948];

// Posición del punto de cada componente y nombre corto de su grupo en el dibujo.
const PUNTOS_CAB = {
  Motor: [100, 252, 'motor'],
  'Transmisión': [171, 280, 'transmision'],
  'Quinta rueda': [335, 276, 'quinta'],
  Llantas: [90, 334, 'llantas'],
  Frenos: [300, 334, 'frenos'],
  Ejes: [366, 334, 'ejes'],
};
const PUNTOS_REM = {
  'Quinta rueda': [343, 300, 'quinta'],
  Ejes: [820, 334, 'ejes'],
  Frenos: [884, 334, 'frenos'],
  Llantas: [948, 334, 'llantas'],
  Tanque: [640, 120, 'tanque'],
  'Válvulas': [630, 306, 'valvulas'],
  Piso: [640, 268, 'piso'],
  'Twist locks': [334, 252, 'twist'],
  Puertas: [962, 196, 'puertas'],
  'Equipo de frío': [296, 160, 'frio'],
};
const CON_SENSORES = {
  Motor: ['Temperatura', 'Presión de aceite'],
  Llantas: ['Presión', 'Temperatura'],
  Frenos: ['Temperatura'],
};

let estado = null;

// ---------------------------------------------------------------- escena
function armarEscena(id) {
  const u = unidad(id);
  if (!u) return null;
  const otro = pareja(id);
  const cab = u.rol === 'cabezal' ? u : otro?.rol === 'cabezal' ? otro : null;
  const rem = u.rol === 'remolque' ? u : otro?.rol === 'remolque' ? otro : null;
  const puntos = [];
  if (cab && rem) {
    puntos.push({ id: 'u-cab', grupo: 'todo', x: 186, y: 168, nombre: `Cabezal ${cab.placa}`, ir: 'cab' });
    puntos.push({ id: 'u-rem', grupo: 'todo', x: 640, y: 214, nombre: `Remolque ${rem.placa}`, ir: 'rem' });
  }
  if (cab) {
    componentesDe(cab.id).forEach((c) => {
      const p = PUNTOS_CAB[c.nombre];
      if (p) puntos.push({ id: `cab-${p[2]}`, grupo: 'cab', x: p[0], y: p[1], nombre: c.nombre, parte: `p-cab-${p[2]}`, unidad: cab, componente: c.nombre });
    });
  }
  if (rem) {
    componentesDe(rem.id).forEach((c) => {
      const p = PUNTOS_REM[c.nombre];
      if (p) puntos.push({ id: `rem-${p[2]}`, grupo: 'rem', x: p[0], y: p[1], nombre: c.nombre, parte: `p-rem-${p[2]}`, unidad: rem, componente: c.nombre });
    });
    if (plantilla(rem.tipo_unidad_id)?.tanque) {
      const comps = compartimentosDe(rem.id);
      partesTanque(comps).forEach((p) => {
        const c = comps[p.i];
        puntos.push({ id: `rem-comp-${p.i}`, grupo: 'rem', x: p.x + p.w / 2, y: 216, nombre: `Compartimento ${c.orden}`, parte: `p-rem-comp-${p.i}`, unidad: rem, compartimento: c, comps });
      });
    }
  }
  return { u, cab, rem, puntos, focoInicial: cab && rem ? 'todo' : cab ? 'cab' : 'rem' };
}

function partesTanque(comps) {
  const gal = comps.map((c) => Number(c.capacidad_galones) || 0);
  const llenos = gal.filter((g) => g > 0);
  const ref = llenos.length ? llenos.reduce((a, b) => a + b, 0) / llenos.length : 1;
  const pesos = gal.map((g) => g || ref);
  const base = pesos.reduce((a, b) => a + b, 0) || 1;
  const ancho = TANQUE.x1 - TANQUE.x0;
  let x = TANQUE.x0;
  return pesos.map((p, i) => {
    const w = (ancho * p) / base;
    const parte = { x, w, i, g: gal[i] };
    x += w;
    return parte;
  });
}

// ---------------------------------------------------------------- dibujo
const rueda = (cx, r, cy = 330) => `<circle cx="${cx}" cy="${cy}" r="${r}"/><circle cx="${cx}" cy="${cy}" r="${r - 6}" class="h-fino"/>`;

function svgPiso() {
  const vp = { x: 500, y: 250 };
  const yTop = 364;
  let s = '';
  for (let x = -900; x <= 1900; x += 110) {
    const t = (yTop - vp.y) / (440 - vp.y);
    s += `<line x1="${vp.x + (x - vp.x) * t}" y1="${yTop}" x2="${x}" y2="440"/>`;
  }
  [364, 369, 377, 389, 405, 426].forEach((y) => (s += `<line x1="-200" y1="${y}" x2="1200" y2="${y}"/>`));
  return `<g class="h-piso">${s}</g><ellipse cx="500" cy="366" rx="470" ry="10" class="h-sombra"/>`;
}

function svgParticulas() {
  let s = '';
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 46; i++) {
    s += `<circle cx="${(azar() * 1000).toFixed(1)}" cy="${(40 + azar() * 300).toFixed(1)}" r="${(0.8 + azar() * 1.8).toFixed(1)}" style="animation-delay:${(azar() * 4).toFixed(2)}s"/>`;
  }
  return `<g class="h-particulas">${s}</g>`;
}

function svgCabezal() {
  const parrilla = [240, 248, 256].map((y) => `<line x1="42" y1="${y}" x2="54" y2="${y}"/>`).join('');
  return `<g class="h-unidad" id="u-cab">
    <g class="h-cuerpo">
      <path d="M28 300V276q0-6 6-6h10v30z"/>
      <path d="M40 288V236q2-18 24-22l86-16 6 90z"/>
      <path d="M150 198l16-70q3-12 16-12h50v180h-78z"/>
      <path d="M228 108q8-24 56-22l4 22z"/>
      <rect x="228" y="108" width="60" height="186" rx="6"/>
      <rect x="140" y="298" width="96" height="28" rx="14"/>
      <rect x="30" y="292" width="362" height="10" rx="2"/>
    </g>
    <g class="h-det">
      ${parrilla}
      <rect x="42" y="264" width="14" height="8" rx="2"/>
      <path d="M156 194l13-60q2-6 9-6h12v66z"/>
      <rect x="196" y="128" width="30" height="40" rx="4"/>
      <rect x="194" y="176" width="34" height="106" rx="4"/>
      <line x1="164" y1="140" x2="150" y2="150"/><rect x="143" y="146" width="8" height="26" rx="2"/>
      <rect x="221" y="62" width="7" height="64" rx="3"/>
      <rect x="244" y="150" width="34" height="50" rx="4"/><line x1="236" y1="136" x2="282" y2="136"/>
      <line x1="70" y1="220" x2="148" y2="206"/>
      <path d="M52 292q38-44 76 0"/><path d="M262 292q38-44 76 0" class="h-fino"/>
      <line x1="168" y1="298" x2="168" y2="326"/><line x1="208" y1="298" x2="208" y2="326"/>
      <rect x="200" y="288" width="24" height="4"/>
    </g>
    <g class="h-parte" id="p-cab-motor">
      <rect x="64" y="230" width="78" height="48" rx="6"/>
      ${[76, 92, 108, 124].map((x) => `<rect x="${x}" y="236" width="12" height="18" rx="2"/>`).join('')}
      <line x1="68" y1="264" x2="138" y2="264"/><circle cx="76" cy="270" r="5"/>
    </g>
    <g class="h-parte" id="p-cab-transmision"><rect x="144" y="270" width="54" height="18" rx="5"/><line x1="198" y1="279" x2="296" y2="279"/></g>
    <g class="h-parte" id="p-cab-quinta"><path d="M304 284h62l-5 8h-52z"/><line x1="335" y1="284" x2="335" y2="292"/></g>
    <g class="h-parte" id="p-cab-llantas">${RUEDAS_CAB.map((x) => rueda(x, 32)).join('')}</g>
    <g class="h-parte" id="p-cab-frenos">${RUEDAS_CAB.map((x) => `<circle cx="${x}" cy="330" r="17"/>`).join('')}</g>
    <g class="h-parte" id="p-cab-ejes">${RUEDAS_CAB.map((x) => `<circle cx="${x}" cy="330" r="6"/>`).join('')}<line x1="300" y1="330" x2="366" y2="330"/></g>
  </g>`;
}

function svgRemolque(rem, enganchado) {
  const p = plantilla(rem.tipo_unidad_id);
  const pata = enganchado ? 330 : 356;
  let cuerpo = '';
  if (p?.tanque) {
    const comps = compartimentosDe(rem.id);
    const partes = partesTanque(comps);
    cuerpo = `
      <defs><clipPath id="h-clip-tanque"><rect x="300" y="150" width="676" height="132" rx="66"/></clipPath></defs>
      <g clip-path="url(#h-clip-tanque)">
        ${partes.map((q) => `<g class="h-parte h-comp ${q.g ? '' : 'h-comp-vacio'} ${q.i % 2 ? 'h-comp-b' : ''}" id="p-rem-comp-${q.i}"><rect x="${q.x}" y="150" width="${q.w}" height="132"/></g>`).join('')}
        ${partes.slice(1).map((q) => `<line x1="${q.x}" y1="150" x2="${q.x}" y2="282" class="h-divisor"/>`).join('')}
      </g>
      ${partes.map((q) => `<text x="${q.x + q.w / 2}" y="${q.w > 70 ? 252 : 258}" class="h-txt">${q.w > 70 ? (q.g ? miles(q.g) + ' gal' : '—') : q.i + 1}</text>`).join('')}
      <g class="h-parte" id="p-rem-tanque">
        <rect x="300" y="150" width="676" height="132" rx="66" class="h-borde"/>
        ${partes.map((q) => `<rect x="${q.x + q.w / 2 - 14}" y="138" width="28" height="12" rx="3"/>`).join('')}
        <line x1="350" y1="132" x2="926" y2="132"/>
        ${[350, 494, 638, 782, 926].map((x) => `<line x1="${x}" y1="132" x2="${x}" y2="150"/>`).join('')}
      </g>
      <g class="h-parte" id="p-rem-valvulas">
        <line x1="480" y1="300" x2="772" y2="300"/>
        ${[514, 594, 674, 754].map((x) => `<rect x="${x - 7}" y="292" width="14" height="14" rx="2"/><line x1="${x}" y1="282" x2="${x}" y2="292"/>`).join('')}
      </g>`;
  } else if (rem.tipo_unidad_id === 'plataforma') {
    cuerpo = `
      <g class="h-parte" id="p-rem-piso"><rect x="300" y="262" width="676" height="20" rx="2"/>${[380, 480, 580, 680, 780, 880].map((x) => `<line x1="${x}" y1="262" x2="${x}" y2="282" class="h-fino"/>`).join('')}</g>
      <g class="h-parte" id="p-rem-twist"><rect x="326" y="250" width="16" height="12" rx="2"/><rect x="954" y="250" width="16" height="12" rx="2"/><rect x="630" y="250" width="16" height="12" rx="2"/></g>`;
  } else if (rem.tipo_unidad_id === 'furgon') {
    cuerpo = `
      <g class="h-cuerpo"><rect x="300" y="106" width="676" height="176" rx="6"/></g>
      <g class="h-det">${[380, 460, 540, 620, 700, 780, 860, 940].map((x) => `<line x1="${x}" y1="110" x2="${x}" y2="278"/>`).join('')}</g>
      <g class="h-parte" id="p-rem-puertas"><rect x="950" y="114" width="22" height="162" rx="3"/><line x1="961" y1="114" x2="961" y2="276"/></g>
      <g class="h-parte" id="p-rem-frio"><rect x="284" y="126" width="18" height="66" rx="4"/></g>`;
  } else {
    cuerpo = `<g class="h-cuerpo h-punteado"><rect x="300" y="140" width="676" height="142" rx="6"/></g>`;
  }
  return `<g class="h-unidad" id="u-rem">
    <g class="h-cuerpo"><rect x="330" y="282" width="646" height="10" rx="2"/><rect x="962" y="300" width="7" height="40" rx="2"/></g>
    ${cuerpo}
    <g class="h-det"><rect x="446" y="292" width="8" height="${pata - 292}"/><rect x="436" y="${pata}" width="28" height="6" rx="2"/></g>
    <g class="h-parte" id="p-rem-quinta"><rect x="318" y="282" width="50" height="8" rx="2"/><rect x="340" y="290" width="6" height="8"/></g>
    <g class="h-parte" id="p-rem-llantas">${RUEDAS_REM.map((x) => rueda(x, 30)).join('')}</g>
    <g class="h-parte" id="p-rem-frenos">${RUEDAS_REM.map((x) => `<circle cx="${x}" cy="330" r="16"/>`).join('')}</g>
    <g class="h-parte" id="p-rem-ejes">${RUEDAS_REM.map((x) => `<circle cx="${x}" cy="330" r="6"/>`).join('')}<line x1="820" y1="330" x2="948" y2="330"/></g>
  </g>`;
}

function svgEscena(e) {
  return `<svg id="holo-svg" class="holo-svg" viewBox="0 0 1000 420" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <filter id="h-glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <pattern id="h-puntos" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r=".9" class="h-punto-trama"/></pattern>
      <linearGradient id="h-scan-grad" x1="0" x2="1"><stop offset="0" stop-color="#38e1ff" stop-opacity="0"/><stop offset=".5" stop-color="#38e1ff" stop-opacity=".22"/><stop offset="1" stop-color="#38e1ff" stop-opacity="0"/></linearGradient>
    </defs>
    ${svgPiso()}
    ${svgParticulas()}
    <g class="h-modelo" filter="url(#h-glow)">
      ${e.rem ? svgRemolque(e.rem, !!e.cab) : ''}
      ${e.cab ? svgCabezal() : ''}
    </g>
    <rect class="h-scan" x="-120" y="40" width="120" height="340" fill="url(#h-scan-grad)"/>
  </svg>`;
}

// ---------------------------------------------------------------- paneles
const fila = (k, v) => (v === '' || v === undefined || v === null ? '' : `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`);
const kmCabezal = (e) => (e.cab ? lecturasKm(e.cab.id)[0]?.km : undefined);

function textoIntervalo(x) {
  const partes = [];
  if (x.cada_km) partes.push(`${miles(x.cada_km)} km`);
  if (x.cada_meses) partes.push(`${x.cada_meses} ${x.cada_meses === 1 ? 'mes' : 'meses'}`);
  return partes.join(' o ');
}

function cabeceraPanel(titulo, sub) {
  return `<div class="hp-cab"><h2 class="hp-titulo">${esc(titulo)}</h2>${sub ? `<p class="hp-sub">${sub}</p>` : ''}</div>`;
}

function panelResumen(e, foco) {
  const km = kmCabezal(e);
  const unidadFoco = foco === 'cab' ? e.cab : foco === 'rem' ? e.rem : null;
  const visibles = estado.puntos.filter((p) => p.grupo === foco).length;
  if (unidadFoco) return panelUnidad(e, unidadFoco, visibles);
  return `${cabeceraPanel('Conjunto', `${esc(e.cab.placa)} + ${esc(e.rem.placa)}`)}
    <p class="hp-ayuda">Toque el <strong>cabezal</strong> o el <strong>remolque</strong> para ver sus partes.</p>
    <dl class="hp-datos">
      ${fila('Kilometraje', km !== undefined ? `${miles(km)} km` : 'Sin registrar')}
      ${fila('Cabezal', nombreUnidad(e.cab))}
      ${fila('Remolque', `${plantilla(e.rem.tipo_unidad_id)?.nombre} · ${nombreUnidad(e.rem)}`)}
      ${fila('Conductor', conductorDe(e.cab.id)?.nombre || conductorDe(e.rem.id)?.nombre || 'Sin asignar')}
    </dl>`;
}

function panelUnidad(e, u, visibles) {
  const p = plantilla(u.tipo_unidad_id);
  const km = u.rol === 'cabezal' ? lecturasKm(u.id)[0]?.km : kmCabezal(e);
  const comps = p?.tanque ? compartimentosDe(u.id) : [];
  return `${cabeceraPanel(u.rol === 'cabezal' ? 'Cabezal' : p?.nombre || 'Remolque', esc(u.placa))}
    <p class="hp-ayuda">${visibles ? `Toque un punto brillante del dibujo o una parte de la lista para ver su información.` : 'Este tipo de unidad no tiene partes marcadas en el dibujo.'}</p>
    <dl class="hp-datos">
      ${fila('Unidad', nombreUnidad(u))}
      ${fila('Kilometraje', km !== undefined ? `${miles(km)} km` : u.rol === 'remolque' && !e.cab ? 'Sin cabezal' : 'Sin registrar')}
      ${p?.tanque ? fila('Capacidad', `${miles(V.totalCompartimentos(comps.map((c) => ({ galones: c.capacidad_galones }))))} gal`) : ''}
      ${fila('Conductor', conductorDe(u.id)?.nombre || 'Sin asignar')}
    </dl>
    <a class="hp-enlace" href="#/unidad/${u.id}">Abrir ficha de ${esc(u.placa)} ›</a>`;
}

function bloqueMantenimiento(u, componente) {
  if (u.rol !== 'cabezal') return `<h3 class="hp-sec">Mantenimiento</h3><p class="hp-nota">Sin intervalos definidos todavía.</p>`;
  const lista = intervalosDe(u.id).filter((x) => x.componente === componente);
  if (!lista.length) return `<h3 class="hp-sec">Mantenimiento</h3><p class="hp-nota">Sin intervalos para esta parte.</p>`;
  return `<h3 class="hp-sec">Mantenimiento</h3>
    <ul class="hp-lista">${lista.map((x) => `<li><span>${esc(x.tarea)}</span><strong>cada ${textoIntervalo(x)}</strong></li>`).join('')}</ul>
    <p class="hp-nota">Último servicio: sin registrar.</p>`;
}

function bloqueSensores(componente) {
  const s = CON_SENSORES[componente];
  if (!s) return '';
  return `<h3 class="hp-sec">Sensores</h3>
    <dl class="hp-datos hp-sensores">${s.map((n) => `<div><dt>${n}</dt><dd>—</dd></div>`).join('')}</dl>
    <p class="hp-nota">Sin sensor conectado. Se activará con la lectura automática del camión (fase 2).</p>`;
}

function panelComponente(e, punto) {
  const u = punto.unidad;
  const a = u.atributos || {};
  const n = punto.componente;
  const par = acopleActivo(u.id);
  const otro = pareja(u.id);
  let datos = '';
  if (n === 'Motor') datos = fila('Motor', a.motor) + fila('Vehículo', nombreUnidad(u)) + fila('Kilometraje', kmCabezal(e) !== undefined ? `${miles(kmCabezal(e))} km` : 'Sin registrar');
  if (n === 'Transmisión') datos = fila('Tipo', a.transmision || 'Sin registrar');
  if (n === 'Llantas') datos = fila('Número de llantas', u.num_llantas);
  if (n === 'Ejes') datos = fila('Número de ejes', u.num_ejes);
  if (n === 'Frenos') datos = fila('Ejes con freno', u.num_ejes);
  if (n === 'Quinta rueda') datos = otro ? fila('Enganchado con', otro.placa) + fila('Desde', par.desde) : fila('Estado', 'Sin enganchar');
  if (n === 'Piso') datos = fila('Largo', a.largo_pies ? `${a.largo_pies} pies` : '');
  if (n === 'Twist locks') datos = fila('Tiene twist locks', a.twist_locks === 'si' ? 'Sí' : a.twist_locks === 'no' ? 'No' : 'Sin registrar');
  if (n === 'Puertas') datos = fila('Número de puertas', a.puertas);
  if (n === 'Equipo de frío') datos = fila('Refrigerado', a.refrigerado === 'si' ? 'Sí' : a.refrigerado === 'no' ? 'No' : 'Sin registrar');
  let extra = '';
  if (n === 'Tanque' || n === 'Válvulas') {
    const comps = compartimentosDe(u.id);
    const total = V.totalCompartimentos(comps.map((c) => ({ galones: c.capacidad_galones })));
    if (n === 'Tanque') {
      datos = fila('Material', a.material) + fila('Transporta', a.producto) + fila('Placa del tanque', a.placa_tanque) + fila('Compartimentos', comps.length);
      extra = `<p class="hp-grande">${miles(total)} <small>gal</small></p>
        <ul class="hp-barras">${comps.map((c) => barraCompartimento(c, total)).join('')}</ul>`;
    } else {
      datos = fila('Compartimentos', comps.length);
    }
  }
  return `${cabeceraPanel(n, `${u.rol === 'cabezal' ? 'Cabezal' : 'Remolque'} · ${esc(u.placa)}`)}
    ${extra}
    ${datos ? `<dl class="hp-datos">${datos}</dl>` : ''}
    ${bloqueMantenimiento(u, n)}
    ${bloqueSensores(n)}`;
}

function barraCompartimento(c, total) {
  const pct = total ? Math.round((Number(c.capacidad_galones) / total) * 100) : 0;
  return `<li><span>${c.orden}${c.nombre ? ` · ${esc(c.nombre)}` : ''}</span><span class="hp-barra"><span style="width:${pct}%"></span></span><strong>${miles(c.capacidad_galones)}</strong></li>`;
}

function panelCompartimento(punto) {
  const c = punto.compartimento;
  const total = V.totalCompartimentos(punto.comps.map((x) => ({ galones: x.capacidad_galones })));
  const pct = total ? Math.round((Number(c.capacidad_galones) / total) * 100) : 0;
  return `${cabeceraPanel(`Compartimento ${c.orden}`, `${c.nombre ? esc(c.nombre) + ' · ' : ''}${esc(punto.unidad.placa)}`)}
    <p class="hp-grande">${miles(c.capacidad_galones)} <small>gal</small></p>
    <div class="hp-medidor"><span class="hp-barra hp-barra-grande"><span style="width:${pct}%"></span></span><span>${pct} % del tanque</span></div>
    <dl class="hp-datos">${fila('Capacidad total del tanque', `${miles(total)} gal`)}${fila('Posición', c.orden === 1 ? 'Adelante, junto al cabezal' : `${c.orden} de ${punto.comps.length}`)}</dl>
    <h3 class="hp-sec">Mantenimiento</h3><p class="hp-nota">Sin registros todavía.</p>`;
}

// ---------------------------------------------------------------- HTML de la vista
export function htmlVista(id) {
  const e = armarEscena(id);
  if (!e) return `<a class="volver" href="#/">‹ Mis unidades</a><h1 tabindex="-1">No se encontró la unidad</h1>`;
  estado = { e, puntos: e.puntos, foco: e.focoInicial, sel: null, vb: { ...ZONA[e.focoInicial] }, raf: 0 };
  const km = kmCabezal(e);
  const comps = e.rem && plantilla(e.rem.tipo_unidad_id)?.tanque ? compartimentosDe(e.rem.id) : null;
  const pestanas = e.cab && e.rem
    ? `<div class="holo-tabs" role="group" aria-label="Qué mostrar">
        <button type="button" data-v="foco" data-foco="todo">Conjunto</button>
        <button type="button" data-v="foco" data-foco="cab">Cabezal</button>
        <button type="button" data-v="foco" data-foco="rem">Remolque</button>
      </div>`
    : '';
  return `<a class="volver holo-volver" href="#/unidad/${e.u.id}">‹ ${esc(e.u.placa)}</a>
  <div class="holo">
    <div class="holo-cabecera">
      <h1 tabindex="-1">Vista del camión</h1>
      <dl class="holo-hud">
        ${e.cab ? `<div><dt>Kilometraje</dt><dd>${km !== undefined ? miles(km) + ' km' : '—'}</dd></div>` : ''}
        ${comps ? `<div><dt>Carga total</dt><dd>${miles(V.totalCompartimentos(comps.map((c) => ({ galones: c.capacidad_galones }))))} gal</dd></div>` : ''}
        <div><dt>Placas</dt><dd>${[e.cab?.placa, e.rem?.placa].filter(Boolean).map(esc).join(' + ')}</dd></div>
      </dl>
    </div>
    ${pestanas}
    <div class="holo-grid">
      <div class="holo-escena" id="holo-escena">
        ${svgEscena(e)}
        <div class="holo-puntos" id="holo-puntos">
          ${e.puntos.map((p) => `<button type="button" class="h-pt ${p.ir ? 'h-pt-unidad' : ''}" data-v="punto" data-id="${p.id}" aria-label="${esc(p.nombre)}" hidden><span class="h-anillo" aria-hidden="true"></span><span class="h-etiqueta">${esc(p.nombre)}</span></button>`).join('')}
        </div>
        <button type="button" class="holo-todo" data-v="foco" data-foco="${e.focoInicial}" aria-label="Ver todo">⤢ Ver todo</button>
      </div>
      <aside class="holo-panel" id="holo-panel" aria-live="polite"></aside>
    </div>
    <h2 class="holo-lista-titulo">Partes</h2>
    <div class="holo-lista" id="holo-lista"></div>
  </div>`;
}

// ---------------------------------------------------------------- interacción
function ajustar(z) {
  const caja = document.getElementById('holo-escena').getBoundingClientRect();
  const A = caja.width / Math.max(caja.height, 1);
  const w = Math.max(z.w, z.h * A);
  const h = w / A;
  return { x: z.x - (w - z.w) / 2, y: z.y - (h - z.h) / 2, w, h };
}

function aplicarVB() {
  const { vb } = estado;
  const svg = document.getElementById('holo-svg');
  if (!svg) return;
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  document.querySelectorAll('#holo-puntos .h-pt').forEach((b) => {
    const p = estado.puntos.find((x) => x.id === b.dataset.id);
    b.style.left = `${((p.x - vb.x) / vb.w) * 100}%`;
    b.style.top = `${((p.y - vb.y) / vb.h) * 100}%`;
  });
}

function animarA(destino) {
  cancelAnimationFrame(estado.raf);
  const inicio = { ...estado.vb };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    estado.vb = destino;
    return aplicarVB();
  }
  const t0 = performance.now();
  const dur = 550;
  const paso = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const f = 1 - Math.pow(1 - k, 3);
    estado.vb = {
      x: inicio.x + (destino.x - inicio.x) * f,
      y: inicio.y + (destino.y - inicio.y) * f,
      w: inicio.w + (destino.w - inicio.w) * f,
      h: inicio.h + (destino.h - inicio.h) * f,
    };
    aplicarVB();
    if (k < 1) estado.raf = requestAnimationFrame(paso);
  };
  estado.raf = requestAnimationFrame(paso);
}

function ponerFoco(foco, { animar = true } = {}) {
  estado.foco = foco;
  estado.sel = null;
  const svg = document.getElementById('holo-svg');
  svg.classList.toggle('foco-cab', foco === 'cab' && !!estado.e.rem);
  svg.classList.toggle('foco-rem', foco === 'rem' && !!estado.e.cab);
  document.querySelectorAll('.holo-tabs [data-foco]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.foco === foco)));
  const visibles = estado.puntos.filter((p) => p.grupo === foco);
  document.querySelectorAll('#holo-puntos .h-pt').forEach((b) => {
    b.hidden = !visibles.some((p) => p.id === b.dataset.id);
    b.classList.remove('sel');
  });
  document.querySelectorAll('#holo-svg .h-parte.activo').forEach((g) => g.classList.remove('activo'));
  document.getElementById('holo-lista').innerHTML = visibles
    .map((p) => `<button type="button" class="holo-chip ${p.ir ? 'holo-chip-unidad' : ''}" data-v="punto" data-id="${p.id}">${esc(p.nombre)}</button>`)
    .join('');
  document.querySelector('.holo-lista-titulo').textContent = foco === 'todo' ? 'Unidades' : 'Partes';
  document.querySelector('.holo-todo').dataset.foco = estado.e.cab && estado.e.rem ? 'todo' : foco;
  document.querySelector('.holo-todo').hidden = foco === 'todo' || !(estado.e.cab && estado.e.rem);
  document.getElementById('holo-panel').innerHTML = panelResumen(estado.e, foco);
  const destino = ajustar(ZONA[foco]);
  if (animar) animarA(destino);
  else {
    estado.vb = destino;
    aplicarVB();
  }
}

function seleccionar(id) {
  const p = estado.puntos.find((x) => x.id === id);
  if (!p) return;
  if (p.ir) return ponerFoco(p.ir);
  estado.sel = id;
  document.querySelectorAll('#holo-puntos .h-pt').forEach((b) => b.classList.toggle('sel', b.dataset.id === id));
  document.querySelectorAll('.holo-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  document.querySelectorAll('#holo-svg .h-parte').forEach((g) => g.classList.toggle('activo', g.id === p.parte));
  document.getElementById('holo-panel').innerHTML = p.compartimento ? panelCompartimento(p) : panelComponente(estado.e, p);
  if (matchMedia('(max-width: 899px)').matches) document.getElementById('holo-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

let alRedimensionar = null;
export function montarVista() {
  if (!estado || !document.getElementById('holo-escena')) return;
  document.querySelector('.holo').addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-v]');
    if (!el) return;
    if (el.dataset.v === 'foco') ponerFoco(el.dataset.foco);
    if (el.dataset.v === 'punto') seleccionar(el.dataset.id);
  });
  if (alRedimensionar) window.removeEventListener('resize', alRedimensionar);
  alRedimensionar = () => {
    if (!document.getElementById('holo-escena')) return window.removeEventListener('resize', alRedimensionar);
    estado.vb = ajustar(ZONA[estado.foco]);
    aplicarVB();
  };
  window.addEventListener('resize', alRedimensionar);
  ponerFoco(estado.foco, { animar: false });
}
