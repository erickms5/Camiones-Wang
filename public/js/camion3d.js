// Vista 3D del camión conectada a la demo "Mi Trailer": arma en memoria el cabezal, la cisterna
// y el conductor a partir de la sesión y los mantenimientos guardados por la demo.
import { usarDatos } from './store.js';
import { buscarModelo, INTERVALOS_GENERICOS } from './catalogo.js';
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
  const [marca = 'Freightliner', modelo = 'Columbia', anio = '2020'] = (sesion.trailerModel || '').split(' ');
  const km = mantenimientos.reduce((max, m) => Math.max(max, Number(m.km) || 0), Number(sesion.odometro) || 0);
  const cab = {
    id: 'cabezal', rol: 'cabezal', tipo_unidad_id: 'tracto', activa: true, placa: sesion.placa,
    marca, modelo, anio: Number(anio), num_ejes: 3, num_llantas: 10,
    atributos: { motor: (sesion.engine || '').replace('Detroit Diesel', 'Detroit'), transmision: 'Eaton Fuller', km_inicial: km },
  };
  const rem = {
    id: 'cisterna', rol: 'remolque', tipo_unidad_id: 'tanquero', activa: true, placa: sesion.servidor?.remolquePlaca || 'Cisterna',
    marca: 'Cisterna', modelo: 'de combustible', anio: null, num_ejes: 3, num_llantas: 12,
    atributos: { material: 'Acero', producto: 'Combustible', capacidad_galones: 10000 },
  };
  // Cada eje es una parte propia: se daña y se repara por separado
  const PARTES_3D = {
    cabezal: ['Motor', 'Transmisión', 'Quinta rueda', 'Eje delantero', 'Eje trasero 1', 'Eje trasero 2'],
    cisterna: ['Quinta rueda', 'Tanque', 'Válvulas', 'Eje 1', 'Eje 2', 'Eje 3'],
  };
  const componentes = [];
  [cab, rem].forEach((u) =>
    PARTES_3D[u.id].forEach((nombre, i) => componentes.push({ id: `${u.id}-${i}`, unidad_id: u.id, tipo: 'general', nombre, orden: i + 1, activo: true })),
  );
  // Compartimento 1 (junto al cabezal) 3.000, 2 y 3 de 2.000, 4 de 3.000
  (Array.isArray(sesion.compartimentos) && sesion.compartimentos.length ? sesion.compartimentos : [3000, 2000, 2000, 3000]).forEach((g, i) =>
    componentes.push({ id: `comp-${i + 1}`, unidad_id: rem.id, tipo: 'compartimento', nombre: '', orden: i + 1, capacidad_galones: g, activo: true }),
  );
  const cat = buscarModelo(cab.marca, cab.modelo, cab.anio);
  const intervalos = (cat ? cat.intervalos : INTERVALOS_GENERICOS).map((x, i) => ({ id: `int-${i}`, unidad_id: cab.id, orden: i + 1, ...x }));
  const conductor = { id: 'chofer', nombre: sesion.nombre, cedula: sesion.cedula, telefono: '', activo: true, esUsuario: true };

  usarDatos({
    version: 2,
    usuario: { id: 'usuario-local', nombre: sesion.nombre, telefono: '' },
    unidades: [cab, rem],
    componentes,
    odometro: [{ id: 'km', unidad_id: cab.id, km, fuente: 'manual', registrado_en: t }],
    intervalos,
    conductores: [conductor],
    asignaciones: [
      { id: 'a1', conductor_id: conductor.id, unidad_id: cab.id, desde: t, hasta: null },
      { id: 'a2', conductor_id: conductor.id, unidad_id: rem.id, desde: t, hasta: null },
    ],
    acoplamientos: [{ id: 'ac', cabezal_id: cab.id, remolque_id: rem.id, desde: t.slice(0, 10), hasta: null }],
    auditoria: [],
    borrador: null,
  });

  // Partes de la demo que corresponden a cada componente del modelo 3D
  const PARTES = {
    // Los nombres antiguos (antes de separar los ejes) se mantienen para no perder registros previos
    cabezal: {
      Motor: ['Motor Detroit'], 'Transmisión': ['Caja de Cambios'], 'Quinta rueda': ['Quinta Rueda'],
      'Eje delantero': ['Eje Delantero Cabezal', 'Dirección y Llantas Delanteras'],
      'Eje trasero 1': ['Eje Trasero 1 Cabezal', 'Frenos / Eje Cabezal'],
      'Eje trasero 2': ['Eje Trasero 2 Cabezal', 'Frenos / Eje Cabezal'],
    },
    cisterna: {
      'Quinta rueda': ['Quinta Rueda'],
      'Eje 1': ['Eje 1 Remolque', 'Ejes y Llantas Remolque'],
      'Eje 2': ['Eje 2 Remolque', 'Ejes y Llantas Remolque'],
      'Eje 3': ['Eje 3 Remolque', 'Ejes y Llantas Remolque'],
      Tanque: ['Tanque - Compartimento 1', 'Tanque - Compartimento 2', 'Tanque - Compartimento 3', 'Tanque - Compartimento 4'],
    },
  };
  // Las categorías Llantas y Frenos se guardan como «Llantas - <eje>» o «Llantas - Todos los ejes»
  Object.values(PARTES).forEach((partes) =>
    Object.entries(partes).forEach(([nombre, lista]) => {
      if (!nombre.startsWith('Eje')) return;
      const eje = lista[0];
      lista.push(`Llantas - ${eje}`, `Frenos - ${eje}`, 'Llantas - Todos los ejes', 'Frenos - Todos los ejes');
    }),
  );
  const ultimoServicio = (u, componente, compartimento) => {
    const partes = compartimento ? [`Tanque - Compartimento ${compartimento.orden}`] : PARTES[u.id]?.[componente] || [];
    const m = mantenimientos.filter((x) => partes.includes(x.parte)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
    return m ? `${m.trabajo} · ${m.fecha} · ${Number(m.km).toLocaleString('es-EC')} km` : null;
  };

  // Parte de la pantalla principal que corresponde a lo tocado en el 3D
  const DEMO = {
    Motor: 'Motor Detroit', 'Transmisión': 'Caja de Cambios', 'Quinta rueda': 'Quinta Rueda',
    'Eje delantero': 'Eje Delantero Cabezal', 'Eje trasero 1': 'Eje Trasero 1 Cabezal', 'Eje trasero 2': 'Eje Trasero 2 Cabezal',
    'Eje 1': 'Eje 1 Remolque', 'Eje 2': 'Eje 2 Remolque', 'Eje 3': 'Eje 3 Remolque',
  };
  const alSeleccionar = (p, detalle) => {
    if (!p) return;
    const eje = DEMO[p.componente];
    if (detalle) return avisar({ tipo: 'parte', parte: detalle.tipo === 'llanta' ? 'Llantas' : 'Frenos', eje });
    const parte = p.compartimento ? `Tanque - Compartimento ${p.compartimento.orden}` : DEMO[p.componente];
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
      if (s2?.placa !== sesion.placa || s2?.nombre !== sesion.nombre) return location.reload();
      mantenimientos = leer('mi_trailer_maint', []);
      refrescarPaneles();
    });
  }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
