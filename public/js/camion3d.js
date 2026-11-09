// Vista 3D del camión conectada a la demo "Mi Trailer": arma en memoria el cabezal, la cisterna
// y el conductor a partir de la sesión y los mantenimientos guardados por la demo.
import { usarDatos } from './store.js';
import { PLANTILLAS } from './plantillas.js';
import { buscarModelo, INTERVALOS_GENERICOS } from './catalogo.js';
import { htmlVista, montarVista } from './vista.js';

const leer = (k, def) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? def;
  } catch {
    return def;
  }
};

const sesion = leer('mi_trailer_session', null);
const mantenimientos = leer('mi_trailer_maint', []);
const app = document.getElementById('app');

if (!sesion?.placa) {
  location.replace('./index.html');
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
    id: 'cisterna', rol: 'remolque', tipo_unidad_id: 'tanquero', activa: true, placa: 'Cisterna',
    marca: 'Cisterna', modelo: 'de combustible', anio: null, num_ejes: 2, num_llantas: 8,
    atributos: { material: 'Acero', producto: 'Combustible', capacidad_galones: 10000 },
  };
  const componentes = [];
  [[cab, 'tracto'], [rem, 'tanquero']].forEach(([u, tipo]) =>
    PLANTILLAS.find((p) => p.id === tipo).componentes.forEach((nombre, i) =>
      componentes.push({ id: `${u.id}-${i}`, unidad_id: u.id, tipo: 'general', nombre, orden: i + 1, activo: true }),
    ),
  );
  [2000, 2000, 3000, 3000].forEach((g, i) =>
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
    cabezal: {
      Motor: ['Motor Detroit'], 'Transmisión': ['Caja de Cambios'], Frenos: ['Frenos / Eje Cabezal'], Ejes: ['Frenos / Eje Cabezal'],
      Llantas: ['Dirección y Llantas Delanteras'], 'Quinta rueda': ['Quinta Rueda'],
    },
    cisterna: {
      Ejes: ['Ejes y Llantas Remolque'], Frenos: ['Ejes y Llantas Remolque'], Llantas: ['Ejes y Llantas Remolque'], 'Quinta rueda': ['Quinta Rueda'],
      Tanque: ['Tanque - Compartimento 1', 'Tanque - Compartimento 2', 'Tanque - Compartimento 3', 'Tanque - Compartimento 4'],
    },
  };
  const ultimoServicio = (u, componente, compartimento) => {
    const partes = compartimento ? [`Tanque - Compartimento ${compartimento.orden}`] : PARTES[u.id]?.[componente] || [];
    const m = mantenimientos.filter((x) => partes.includes(x.parte)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
    return m ? `${m.trabajo} · ${m.fecha} · ${Number(m.km).toLocaleString('es-EC')} km` : null;
  };

  document.body.classList.add('modo-holo');
  app.innerHTML = htmlVista(cab.id, { inicio: './index.html', cuenta: './index.html', ultimoServicio });
  montarVista();
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
