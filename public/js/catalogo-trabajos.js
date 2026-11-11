// Catálogo de trabajos de mantenimiento, agrupado por parte del vehículo.
// ES CONFIGURACIÓN: para agregar, quitar o renombrar un trabajo se edita solo este archivo.
// Lo usan la app (pantalla «¿Qué se hizo?») y el servidor (validación y reportes).
//
// - Vocabulario de camión pesado (frenos de aire: zapatas, tambores, pulmones). Nunca «pastillas».
// - Un mismo trabajo puede estar en varias partes con la misma clave («Cambio de aceite» en Motor y en Caja).
// - `solo: 'tracto'` → solo cabezales con tanquero; `solo: 'camion'` → solo camiones con el tanque encima.
// - `pideEje: true` → al marcar un trabajo de esa parte se pregunta en qué eje.
// - `componente` → tipo de componente del vehículo al que corresponde la parte, cuando es uno solo.

const clave = (nombre) => String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const t = (nombre, extra = {}) => ({ id: clave(nombre), nombre, ...extra });

export const GRUPOS = [
  {
    id: 'motor', nombre: 'Motor', icono: 'fa-gears', componente: 'motor',
    trabajos: [
      t('Cambio de aceite'), t('Cambio de filtro de aceite'), t('Filtros de diésel'), t('Cambio de filtro de aire'),
      t('Cambio de refrigerante'), t('Reparación o cambio de radiador'), t('Cambio de mangueras'), t('Cambio de bomba de agua'),
      t('Cambio de bandas y tensores'), t('Reparación de inyectores o bomba de inyección'), t('Reparación o cambio de turbo'),
      t('Calibración de válvulas'), t('Corrección de fugas de aceite'), t('Reparación de freno de motor'), t('Reparación de motor'),
    ],
  },
  {
    id: 'caja', nombre: 'Caja', icono: 'fa-gear', componente: 'transmision',
    trabajos: [
      t('Cambio de aceite'), t('Cambio de kit de embrague'), t('Regulación de embrague'), t('Reparación de caja de cambios'),
      t('Corrección de fugas o retenedores'), t('Cambio de aceite de diferencial'), t('Cambio de crucetas'),
      t('Cambio de soporte de cardán'), t('Reparación de diferencial'),
    ],
  },
  {
    id: 'frenos', nombre: 'Frenos', icono: 'fa-compact-disc', pideEje: true,
    trabajos: [
      t('Regulación de frenos'), t('Cambio de zapatas'), t('Rectificación o cambio de tambores'), t('Cambio de pulmones de freno'),
      t('Revisión de tanque de aire'), t('Cambio de filtro secador de aire'), t('Corrección de fugas de aire'),
      t('Cambio de mangueras o válvulas de freno'), t('Reparación de compresor de aire'), t('Cambio de líquido de frenos'), t('Reparación de ABS'),
    ],
  },
  {
    id: 'ejes', nombre: 'Ejes y llantas', icono: 'fa-circle-dot', pideEje: true,
    trabajos: [
      t('Cambio de llantas'), t('Rotación de llantas'), t('Reencauche'), t('Reparación de pinchazo'), t('Balanceo'), t('Alineación'),
      t('Engrase de rodamientos'), t('Cambio de rodamientos'), t('Cambio de retenedores de rueda'), t('Cambio de espárragos o tuercas'),
      t('Cambio de pines y bocines'), t('Cambio de terminales y barras de dirección'), t('Reparación de caja de dirección'),
    ],
  },
  {
    id: 'suspension', nombre: 'Suspensión', icono: 'fa-arrows-up-down',
    trabajos: [
      t('Cambio de hojas de ballesta (muelles)'), t('Cambio de amortiguadores'), t('Cambio de bujes y pasadores'), t('Cambio de abrazaderas'),
      t('Cambio de bolsas de aire', { solo: 'tracto' }), t('Cambio de válvula niveladora', { solo: 'tracto' }),
    ],
  },
  {
    id: 'electrico', nombre: 'Sistema eléctrico', icono: 'fa-car-battery',
    trabajos: [
      t('Cambio de baterías'), t('Reparación de alternador'), t('Reparación de motor de arranque'), t('Reparación de luces'),
      t('Reparación de cableado'), t('Cambio de fusibles o relés'),
    ],
  },
  {
    id: 'tanque', nombre: 'Tanque y válvulas', icono: 'fa-faucet', componente: 'tanque',
    trabajos: [
      t('Cambio de válvula de descarga'), t('Cambio de válvula de fondo'), t('Cambio de acoples o tapas'), t('Cambio de mangueras de descarga'),
      t('Cambio de empaque de tapa'), t('Reparación de fugas'), t('Reparación de fisura o soldadura'), t('Calibración volumétrica'),
      t('Prueba de hermeticidad'), t('Revisión de puesta a tierra'), t('Reparación de bomba o medidor de descarga', { solo: 'camion' }),
    ],
  },
  {
    id: 'general', nombre: 'General', icono: 'fa-screwdriver-wrench',
    trabajos: [
      t('Engrase general'), t('Engrase de quinta rueda', { solo: 'tracto' }), t('Ajuste o cambio de quinta rueda', { solo: 'tracto' }),
      t('Cambio de perno rey o patas de apoyo', { solo: 'tracto' }), t('Lavado'), t('Revisión mecánica preventiva'),
      t('Revisión técnica vehicular o matrícula'), t('Latonería y pintura'), t('Reparación de cabina (aire acondicionado, vidrios, puertas)'),
      t('Recarga o cambio de extintores'), t('Cambio de rótulos y señalética'),
    ],
  },
];

// Trabajo escrito a mano («Otro trabajo») y trabajo de un registro anterior a los grupos
export const TRABAJO_OTRO = 'otro';
export const TRABAJO_ANTERIOR = 'anterior';

export const grupoPorId = (id) => GRUPOS.find((g) => g.id === id) || null;
export const grupoPorNombre = (nombre) => GRUPOS.find((g) => g.nombre === nombre) || null;

// Grupos con los trabajos que aplican al tipo de vehículo ('tracto' o 'camion')
export function gruposPara(tipo) {
  return GRUPOS.map((g) => ({ ...g, trabajos: g.trabajos.filter((x) => !x.solo || x.solo === tipo) }));
}

// Marca única de un trabajo dentro de una visita: parte + trabajo (el mismo trabajo puede ir en dos partes)
export const marca = (grupoId, trabajoId) => `${grupoId}|${trabajoId}`;

// «Motor: cambio de aceite, filtros de diésel · Caja: cambio de aceite»
export function textoTrabajos(trabajos = []) {
  const porParte = new Map();
  trabajos.forEach((x) => {
    const parte = x.parte || 'General';
    if (!porParte.has(parte)) porParte.set(parte, []);
    porParte.get(parte).push(x.trabajo);
  });
  const orden = (parte) => {
    const i = GRUPOS.findIndex((g) => g.nombre === parte);
    return i < 0 ? GRUPOS.length : i;
  };
  return [...porParte.entries()].sort((a, b) => orden(a[0]) - orden(b[0]))
    .map(([parte, lista]) => `${parte}: ${lista.map((n) => n.charAt(0).toLowerCase() + n.slice(1)).join(', ')}`).join(' · ');
}

// Partes distintas de una visita, en el orden del catálogo: «Motor · Caja»
export function partesDeVisita(trabajos = []) {
  const nombres = [...new Set(trabajos.map((x) => x.parte || 'General'))];
  const orden = (parte) => {
    const i = GRUPOS.findIndex((g) => g.nombre === parte);
    return i < 0 ? GRUPOS.length : i;
  };
  return nombres.sort((a, b) => orden(a) - orden(b));
}

// Texto corto para listas: «Cambio de aceite» o «Cambio de aceite y 2 más»
export function resumenTrabajos(trabajos = []) {
  if (!trabajos.length) return '';
  const [primero, ...resto] = trabajos;
  return resto.length ? `${primero.trabajo} y ${resto.length} más` : primero.trabajo;
}

// Los trabajos de un registro: los nuevos (lista) o, en registros anteriores, su parte y trabajo únicos
export function trabajosDeRegistro(m) {
  if (Array.isArray(m?.trabajos) && m.trabajos.length) return m.trabajos;
  return m?.trabajo ? [{ tipoTrabajoId: TRABAJO_ANTERIOR, parte: m.parte || 'General', trabajo: m.trabajo, nota: null }] : [];
}

// ¿La visita incluye esta parte o este trabajo? (para los filtros del historial)
export function visitaIncluye(m, { parte = '', trabajo = '' } = {}) {
  const lista = trabajosDeRegistro(m);
  return lista.some((x) => (!parte || x.parte === parte) && (!trabajo || x.trabajo === trabajo));
}

if (typeof window !== 'undefined') {
  window.CatalogoTrabajos = { GRUPOS, gruposPara, grupoPorId, textoTrabajos, partesDeVisita, resumenTrabajos, trabajosDeRegistro, visitaIncluye, marca, TRABAJO_OTRO, TRABAJO_ANTERIOR };
}
