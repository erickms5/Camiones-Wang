// Vista 3D del camión conectada a la demo "Mi Trailer": arma en memoria el cabezal, la cisterna
// y el conductor a partir de la sesión y los mantenimientos guardados por la demo.
import { usarDatos } from './store.js';
import { configVehiculo, ejesDe, galones, modeloPorId, INTERVALOS_GENERICOS } from './catalogo.js';
import { htmlVista, montarVista, refrescarPaneles } from './vista.js';

const leer = (k, def) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? def;
  } catch {
    return def;
  }
};

const sesion = leer('mi_trailer_session', null);
let mantenimientos = leer('mi_trailer_maint', []);
const app = document.getElementById('app');
// ?embebido=1 → se muestra dentro de la tarjeta «Mi Trailer Interactivo» de la pantalla principal
const embebido = new URLSearchParams(location.search).has('embebido');
// Alto real del contenido (no del marco), para que el marco también pueda encogerse
const altoContenido = () => Math.ceil(document.getElementById('app').getBoundingClientRect().height);
const avisar = (msg) => embebido && parent !== window && parent.postMessage({ origen: 'camion3d', ...msg }, location.origin);

if (!sesion?.placa) {
  if (embebido) {
    app.innerHTML = '<p style="color:#9cc3d2;text-align:center;padding:2rem">Inicia sesión para ver tu camión en 3D.</p>';
    window.addEventListener('message', (ev) => {
      if (ev.origin === location.origin && ev.data?.origen === 'mi-trailer' && leer('mi_trailer_session', null)?.placa) location.reload();
    });
  }
  else location.replace('./index.html');
} else {
  const t = new Date().toISOString();
  // Vehículo de la sesión: cabezal con tanquero, o camión con el tanque encima (ver catalogo.js)
  const v = sesion.vehiculo || {};
  const cfg = configVehiculo(v);
  const modelo = modeloPorId(cfg.modeloId);
  const camion = cfg.tipo === 'camion';
  const km = mantenimientos.reduce((max, m) => Math.max(max, Number(m.km) || 0), Number(sesion.odometro) || 0);
  const total = galones(cfg.compartimentos);
  const cab = {
    id: 'cabezal', rol: 'cabezal', tipo_unidad_id: camion ? 'camion' : 'tracto', activa: true, placa: sesion.placa,
    marca: v.marca || modelo.marca, modelo: v.modelo || modelo.modelo, anio: v.anio || null, num_ejes: cfg.ejes, num_llantas: 2 + 4 * (cfg.ejes - 1),
    atributos: { motor: v.motor || '', km_inicial: km, ...(camion ? { producto: 'Combustible', capacidad_galones: total } : {}) },
  };
  const rem = cfg.conTanquero ? {
    id: 'cisterna', rol: 'remolque', tipo_unidad_id: 'tanquero', activa: true, placa: 'Tanquero',
    marca: 'Tanquero', modelo: 'de combustible', anio: null, num_ejes: cfg.ejesTanquero, num_llantas: 4 * cfg.ejesTanquero,
    atributos: { producto: 'Combustible', capacidad_galones: total },
  } : null;
  const unidades = [cab, rem].filter(Boolean);
  const conTanque = camion ? cab : rem; // la unidad que lleva los compartimentos

  // Nombre de cada eje en el 3D y su parte en la pantalla principal. Cada eje se daña y se repara por separado.
  const nombre3d = (e, i, n) => (e.unidad === 'tanquero' ? `Eje ${i + 1}` : i === 0 ? 'Eje delantero' : n === 2 ? 'Eje trasero' : `Eje trasero ${i}`);
  const ejes = { cabezal: [], cisterna: [] };
  ejesDe(cfg).forEach((e) => {
    const lista = ejes[e.unidad === 'tanquero' ? 'cisterna' : 'cabezal'];
    lista.push({ nombre: nombre3d(e, lista.length, cfg.ejes), parte: e.id });
  });
  const PARTES_3D = {
    cabezal: ['Motor', 'Transmisión', ...(camion ? ['Tanque', 'Válvulas'] : ['Quinta rueda']), ...ejes.cabezal.map((e) => e.nombre)],
    cisterna: ['Quinta rueda', 'Tanque', 'Válvulas', ...ejes.cisterna.map((e) => e.nombre)],
  };
  const componentes = [];
  unidades.forEach((u) =>
    PARTES_3D[u.id].forEach((nombre, i) => componentes.push({ id: `${u.id}-${i}`, unidad_id: u.id, tipo: 'general', nombre, orden: i + 1, activo: true })),
  );
  // Compartimento 1 = el de adelante (junto al cabezal)
  if (conTanque) {
    cfg.compartimentos.forEach((g, i) =>
      componentes.push({ id: `comp-${i + 1}`, unidad_id: conTanque.id, tipo: 'compartimento', nombre: '', orden: i + 1, capacidad_galones: g, activo: true }),
    );
  }
  const intervalos = (modelo?.intervalos || INTERVALOS_GENERICOS).map((x, i) => ({ id: `int-${i}`, unidad_id: cab.id, orden: i + 1, ...x }));
  const conductor = { id: 'chofer', nombre: sesion.nombre, cedula: sesion.cedula, telefono: '', activo: true, esUsuario: true };

  usarDatos({
    version: 2,
    usuario: { id: 'usuario-local', nombre: sesion.nombre, telefono: '' },
    unidades,
    componentes,
    odometro: [{ id: 'km', unidad_id: cab.id, km, fuente: 'manual', registrado_en: t }],
    intervalos,
    conductores: [conductor],
    asignaciones: unidades.map((u, i) => ({ id: `a${i}`, conductor_id: conductor.id, unidad_id: u.id, desde: t, hasta: null })),
    acoplamientos: rem ? [{ id: 'ac', cabezal_id: cab.id, remolque_id: rem.id, desde: t.slice(0, 10), hasta: null }] : [],
    auditoria: [],
    borrador: null,
  });

  // Parte de la pantalla principal que corresponde a cada componente del 3D
  const DEMO = { Motor: 'Motor', 'Transmisión': 'Caja de Cambios', 'Quinta rueda': 'Quinta Rueda', 'Válvulas': 'Válvulas y Descarga' };
  // Partes cuyos mantenimientos cuentan como «último servicio» de cada componente.
  // Los nombres antiguos se mantienen para no perder registros previos.
  const PARTES = {
    cabezal: { Motor: ['Motor', 'Motor Detroit'], 'Transmisión': ['Caja de Cambios', 'Embrague'], 'Quinta rueda': ['Quinta Rueda'] },
    cisterna: { 'Quinta rueda': ['Quinta Rueda', 'Perno Rey y Patas de Apoyo'] },
  };
  const delTanque = ['Válvulas y Descarga', ...cfg.compartimentos.map((_, i) => `Tanque - Compartimento ${i + 1}`)];
  if (conTanque) Object.assign(PARTES[conTanque.id], { Tanque: delTanque, 'Válvulas': ['Válvulas y Descarga'] });
  const ANTIGUOS = { 'Eje delantero': ['Dirección y Llantas Delanteras'], 'Eje trasero 1': ['Frenos / Eje Cabezal'], 'Eje trasero 2': ['Frenos / Eje Cabezal'] };
  Object.entries(ejes).forEach(([unidad, lista]) =>
    lista.forEach((e) => {
      DEMO[`${unidad}|${e.nombre}`] = e.parte;
      // Las categorías Llantas y Frenos se guardan como «Llantas - <eje>» o «Llantas - Todos los ejes»
      PARTES[unidad][e.nombre] = [e.parte, `Llantas - ${e.parte}`, `Frenos - ${e.parte}`, 'Llantas - Todos los ejes', 'Frenos - Todos los ejes',
        ...(unidad === 'cabezal' ? ANTIGUOS[e.nombre] || [] : ['Ejes y Llantas Remolque'])];
    }),
  );
  const ultimoServicio = (u, componente, compartimento) => {
    const partes = compartimento ? [`Tanque - Compartimento ${compartimento.orden}`] : PARTES[u.id]?.[componente] || [];
    const m = mantenimientos.filter((x) => partes.includes(x.parte)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
    return m ? `${m.trabajo} · ${m.fecha} · ${Number(m.km).toLocaleString('es-EC')} km` : null;
  };

  const alSeleccionar = (p, detalle) => {
    if (!p) return;
    const eje = DEMO[`${p.unidad?.id}|${p.componente}`];
    if (detalle) return avisar({ tipo: 'parte', parte: detalle.tipo === 'llanta' ? 'Llantas' : 'Frenos', eje });
    const parte = p.compartimento ? `Tanque - Compartimento ${p.compartimento.orden}` : eje || (p.componente === 'Tanque' ? 'Tanque - Compartimento 1' : DEMO[p.componente]);
    if (parte) avisar({ tipo: 'parte', parte });
  };

  document.body.classList.add('modo-holo');
  if (embebido) document.body.classList.add('embebido');
  app.innerHTML = htmlVista(cab.id, { inicio: './index.html', cuenta: './index.html', ultimoServicio, alSeleccionar, embebido });
  montarVista();

  if (embebido) {
    // La pantalla principal ajusta la altura del marco al contenido
    new ResizeObserver(() => avisar({ tipo: 'altura', alto: altoContenido() })).observe(app);
    // Respaldo: también al tocar o guardar algo (algunos navegadores no avisan cambios de tamaño en segundo plano)
    ['click', 'submit'].forEach((t) => document.addEventListener(t, () => setTimeout(() => avisar({ tipo: 'altura', alto: altoContenido() }), 60)));
    window.addEventListener('message', (ev) => {
      if (ev.origin !== location.origin || ev.data?.origen !== 'mi-trailer') return;
      avisar({ tipo: 'altura', alto: altoContenido() });
      const s2 = leer('mi_trailer_session', null);
      if (s2?.placa !== sesion.placa || s2?.nombre !== sesion.nombre || JSON.stringify(s2?.vehiculo) !== JSON.stringify(sesion.vehiculo)) return location.reload();
      mantenimientos = leer('mi_trailer_maint', []);
      refrescarPaneles();
    });
  }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
