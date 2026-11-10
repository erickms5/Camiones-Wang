// Catálogo de la flota: modelos de vehículo con los que trabaja el sistema.
// Lo usan el servidor (para armar ejes, llantas, frenos y compartimentos al registrar) y la app
// (partes que se pueden tocar/registrar y los trabajos típicos de cada parte).
//
// AGREGAR UN MODELO NUEVO = agregar un objeto a MODELOS. No hay que tocar nada más.
//   tipo 'tracto' → cabezal que arrastra un tanquero (remolque con placa propia).
//   tipo 'camion' → camión rígido con el tanque montado sobre el mismo chasis.
// Todos los vehículos son tanqueros de combustible (así trabaja la compañía).
// Los km y meses de los intervalos son referenciales: falta validarlos con el manual del fabricante.

const INTERVALOS_TRACTO = [
  { tarea: 'Cambio de aceite y filtro de motor', componente: 'Motor', cada_km: 40000, cada_meses: 12 },
  { tarea: 'Cambio de filtros de combustible', componente: 'Motor', cada_km: 80000, cada_meses: 12 },
  { tarea: 'Cambio de filtro de aire', componente: 'Motor', cada_km: 80000, cada_meses: 12 },
  { tarea: 'Cambio de aceite de transmisión', componente: 'Transmisión', cada_km: 400000, cada_meses: 36 },
  { tarea: 'Cambio de aceite de diferenciales', componente: 'Ejes', cada_km: 400000, cada_meses: 36 },
  { tarea: 'Engrase de chasis y quinta rueda', componente: 'Quinta rueda', cada_km: 20000, cada_meses: 3 },
  { tarea: 'Inspección de frenos', componente: 'Frenos', cada_km: 20000, cada_meses: 3 },
  { tarea: 'Revisión y rotación de llantas', componente: 'Llantas', cada_km: 20000, cada_meses: 3 },
];

// Intervalos genéricos (camiones medianos y cabezales sin datos propios).
export const INTERVALOS_GENERICOS = [
  { tarea: 'Cambio de aceite y filtro de motor', componente: 'Motor', cada_km: 15000, cada_meses: 6 },
  { tarea: 'Cambio de filtros de combustible', componente: 'Motor', cada_km: 30000, cada_meses: 6 },
  { tarea: 'Cambio de filtro de aire', componente: 'Motor', cada_km: 30000, cada_meses: 6 },
  { tarea: 'Cambio de aceite de transmisión', componente: 'Transmisión', cada_km: 200000, cada_meses: 24 },
  { tarea: 'Cambio de aceite de diferenciales', componente: 'Ejes', cada_km: 200000, cada_meses: 24 },
  { tarea: 'Engrase de chasis y quinta rueda', componente: 'Quinta rueda', cada_km: 10000, cada_meses: 3 },
  { tarea: 'Inspección de frenos', componente: 'Frenos', cada_km: 10000, cada_meses: 3 },
  { tarea: 'Revisión y rotación de llantas', componente: 'Llantas', cada_km: 10000, cada_meses: 3 },
];
const INTERVALOS_CAMION = INTERVALOS_GENERICOS.map((x) => (x.componente === 'Quinta rueda' ? { ...x, tarea: 'Engrase de chasis', componente: 'General' } : x));

export const MODELOS = [
  {
    id: 'freightliner-columbia-2020',
    marca: 'Freightliner', modelo: 'Columbia', anio: 2020,
    tipo: 'tracto',
    descripcion: 'Cabezal con tanquero de 10.000 galones',
    ejes: 3, // delantero + 2 traseros
    ejesTanquero: 3,
    compartimentos: [3000, 2000, 2000, 3000], // del cabezal hacia atrás
    intervalos: INTERVALOS_TRACTO,
    // Trabajos propios de este modelo, además de los comunes de cada parte
    trabajosPropios: {
      suspension: ['Cambio de bolsas de aire (suspensión neumática)', 'Cambio de válvula niveladora'],
    },
  },
  {
    id: 'hino-gh-2010',
    marca: 'Hino', modelo: 'GH', anio: 2010,
    tipo: 'camion',
    descripcion: 'Camión tanquero de 4.000 galones',
    ejes: 2, // delantero + 1 trasero
    compartimentos: [1000, 2000, 1000],
    intervalos: INTERVALOS_CAMION,
    trabajosPropios: {
      cabina: ['Reparación del sistema para levantar la cabina'],
      motor: ['Reparación de freno de escape'],
    },
  },
  {
    id: 'chevrolet-fvr-2011',
    marca: 'Chevrolet', modelo: 'FVR', anio: 2011,
    tipo: 'camion',
    descripcion: 'Camión tanquero de 4.000 galones',
    ejes: 2,
    compartimentos: [1000, 1000, 1000, 1000],
    intervalos: INTERVALOS_CAMION,
    trabajosPropios: {
      cabina: ['Reparación del sistema para levantar la cabina'],
      motor: ['Reparación de freno de escape'],
    },
  },
];
export const CATALOGO_MODELOS = MODELOS;

export const normalizar = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const modeloPorId = (id) => MODELOS.find((m) => m.id === id) || null;
export const nombreModelo = (m) => `${m.marca} ${m.modelo}`;
export const galones = (compartimentos) => (compartimentos || []).reduce((a, b) => a + (Number(b) || 0), 0);

// Coincidencia por marca y modelo (el año es de cada vehículo, no del catálogo)
export function buscarModelo(marca, modelo) {
  return MODELOS.find((c) => normalizar(c.marca) === normalizar(marca) && normalizar(c.modelo) === normalizar(modelo)) || null;
}

// ---------------------------------------------------------------- partes de un vehículo
// Trabajos (y daños) típicos por clase de parte. «Otro trabajo» se agrega siempre al final.
const TRABAJOS = {
  motor: ['Cambio de aceite y filtros', 'Cambio de filtros de combustible', 'Cambio de filtro de aire', 'Reparación de inyectores o bomba de inyección',
    'Reparación o cambio de turbo', 'Cambio de bandas y tensores', 'Corrección de fugas de aceite', 'Calibración de válvulas', 'Reparación de freno de motor', 'Reparación de motor'],
  caja: ['Cambio de aceite de caja', 'Reparación de caja de cambios', 'Corrección de fugas o retenedores', 'Ajuste de palanca o varillaje'],
  embrague: ['Cambio de kit de embrague', 'Regulación de embrague', 'Cambio de bomba o cilindro de embrague'],
  diferencial: ['Cambio de aceite de diferencial', 'Cambio de crucetas', 'Cambio de soporte de cardán', 'Reparación de diferencial', 'Cambio de retenedores'],
  enfriamiento: ['Cambio de refrigerante', 'Reparación o cambio de radiador', 'Cambio de mangueras', 'Cambio de bomba de agua', 'Cambio de termostato', 'Reparación de ventilador'],
  aire: ['Cambio de filtro secador de aire', 'Reparación de compresor', 'Corrección de fugas de aire', 'Cambio de válvulas de aire', 'Cambio de mangueras de aire'],
  suspension: ['Cambio de hojas de ballesta (muelles)', 'Cambio de amortiguadores', 'Cambio de bujes y pasadores', 'Cambio de abrazaderas'],
  direccion: ['Alineación', 'Cambio de terminales y barras', 'Reparación de caja de dirección', 'Cambio de bomba hidráulica', 'Cambio de aceite hidráulico', 'Cambio de pines y bocines'],
  electrico: ['Cambio de baterías', 'Reparación de alternador', 'Reparación de motor de arranque', 'Reparación de luces', 'Reparación de cableado', 'Cambio de fusibles o relés'],
  cabina: ['Reparación de aire acondicionado', 'Cambio de parabrisas o vidrios', 'Reparación de puertas o cerraduras', 'Cambio de plumas', 'Reparación de tablero o instrumentos', 'Latonería y pintura'],
  quinta: ['Engrase de quinta rueda', 'Ajuste de quinta rueda', 'Cambio de mordazas o kit de reparación', 'Cambio de quinta rueda'],
  eje: ['Engrase de rodamientos', 'Cambio de rodamientos', 'Cambio de retenedores de rueda', 'Cambio de espárragos o tuercas'],
  ejeDelantero: ['Engrase de rodamientos', 'Cambio de rodamientos', 'Cambio de retenedores de rueda', 'Cambio de espárragos o tuercas', 'Alineación', 'Cambio de pines y bocines'],
  llantas: ['Cambio de llantas', 'Rotación de llantas', 'Reencauche', 'Reparación de pinchazo', 'Balanceo', 'Alineación'],
  frenos: ['Regulación de frenos', 'Cambio de zapatas', 'Rectificación o cambio de tambores', 'Cambio de pulmones de freno', 'Cambio de mangueras o válvulas de freno', 'Reparación de ABS'],
  compartimento: ['Limpieza interna', 'Reparación de fisura o soldadura', 'Cambio de empaque de tapa', 'Cambio de válvula de fondo', 'Calibración volumétrica', 'Prueba de hermeticidad'],
  valvulas: ['Cambio de válvula de descarga', 'Cambio de acoples o tapas', 'Cambio de mangueras de descarga', 'Reparación de fugas', 'Revisión de puesta a tierra'],
  valvulasCamion: ['Cambio de válvula de descarga', 'Cambio de acoples o tapas', 'Cambio de mangueras de descarga', 'Reparación de fugas', 'Reparación de bomba o medidor de descarga', 'Revisión de puesta a tierra'],
  enganche: ['Engrase de perno rey', 'Cambio de perno rey', 'Reparación de patas de apoyo', 'Reparación de chasis o soldadura'],
  seguridad: ['Recarga o cambio de extintores', 'Cambio de rótulos y señalética', 'Cambio de cable de puesta a tierra', 'Cambio de conos o triángulos'],
  general: ['Engrase general', 'Lavado', 'Revisión mecánica preventiva', 'Revisión técnica vehicular o matrícula', 'Latonería y pintura'],
};
export const OTRO_TRABAJO = 'Otro trabajo';

// Configuración de un vehículo concreto. Sin datos (modo demostración) se usa el primer modelo.
export function configVehiculo(v = {}) {
  const m = modeloPorId(v.modeloId) || MODELOS[0];
  const tipo = v.tipo === 'camion' || v.tipo === 'tracto' ? v.tipo : m.tipo;
  return {
    modeloId: m.id,
    tipo,
    ejes: Number(v.ejes) || m.ejes,
    ejesTanquero: tipo === 'tracto' ? Number(v.ejesTanquero) || m.ejesTanquero || 3 : 0,
    compartimentos: Array.isArray(v.compartimentos) && v.compartimentos.length ? v.compartimentos.map(Number) : m.compartimentos,
    conTanquero: tipo === 'tracto' ? v.conTanquero !== false : false,
  };
}

// Ejes del vehículo. «clave» es la del camión 3D y la del servidor (cab-eje-0, rem-eje-1…).
export function ejesDe(cfg) {
  const c = configVehiculo(cfg);
  const sufijo = c.tipo === 'tracto' ? ' Cabezal' : '';
  const lista = [];
  for (let i = 0; i < c.ejes; i++) {
    const nombre = i === 0 ? 'Eje Delantero' : c.ejes === 2 ? 'Eje Trasero' : `Eje Trasero ${i}`;
    lista.push({ id: nombre + sufijo, clave: `cab-eje-${i}`, delantero: i === 0, unidad: 'vehiculo' });
  }
  if (c.conTanquero) for (let i = 0; i < c.ejesTanquero; i++) lista.push({ id: `Eje ${i + 1} Remolque`, clave: `rem-eje-${i}`, delantero: false, unidad: 'tanquero' });
  return lista;
}

// Partes que se muestran y se registran. El «id» es el texto que se guarda en cada mantenimiento.
export function partesDe(cfg) {
  const c = configVehiculo(cfg);
  const tracto = c.tipo === 'tracto';
  const grupoV = tracto ? 'Cabezal' : 'Camión';
  const p = (id, nombre, clase, icono, grupo = grupoV, unidad = 'vehiculo') => ({ id, nombre, clase, icono, grupo, unidad });
  const uTanque = tracto ? 'tanquero' : 'vehiculo';
  const lista = [
    p('Motor', 'Motor', 'motor', 'fa-gears'),
    p('Caja de Cambios', 'Caja de cambios', 'caja', 'fa-gear'),
    p('Embrague', 'Embrague', 'embrague', 'fa-circle-half-stroke'),
    p('Cardán y Diferencial', 'Cardán y diferencial', 'diferencial', 'fa-arrows-spin'),
    p('Sistema de Enfriamiento', 'Radiador y enfriamiento', 'enfriamiento', 'fa-temperature-half'),
    p('Sistema de Aire', 'Sistema de aire', 'aire', 'fa-wind'),
    p('Suspensión', 'Suspensión', 'suspension', 'fa-arrows-up-down'),
    p('Dirección', 'Dirección', 'direccion', 'fa-life-ring'),
    p('Sistema Eléctrico', 'Sistema eléctrico y luces', 'electrico', 'fa-car-battery'),
    p('Cabina', 'Cabina', 'cabina', 'fa-truck-front'),
  ];
  ejesDe(c).filter((e) => e.unidad === 'vehiculo').forEach((e) => lista.push(p(e.id, `${e.id} (llantas y frenos)`, e.delantero ? 'ejeDelantero' : 'eje', 'fa-circle-notch')));
  if (tracto) lista.push(p('Quinta Rueda', 'Quinta rueda / enganche', 'quinta', 'fa-link', 'Enganche'));
  if (!tracto || c.conTanquero) {
    c.compartimentos.forEach((g, i) => lista.push(p(`Tanque - Compartimento ${i + 1}`, `Compartimento ${i + 1} (${Number(g).toLocaleString('es-EC')} gal)`, 'compartimento', 'fa-cubes', 'Tanque', uTanque)));
    lista.push(p('Válvulas y Descarga', 'Válvulas y descarga', tracto ? 'valvulas' : 'valvulasCamion', 'fa-faucet', 'Tanque', uTanque));
  }
  if (tracto && c.conTanquero) {
    lista.push(p('Perno Rey y Patas de Apoyo', 'Perno rey y patas de apoyo', 'enganche', 'fa-anchor', 'Tanque', 'tanquero'));
    lista.push(p('Suspensión Remolque', 'Suspensión del tanquero', 'suspension', 'fa-arrows-up-down', 'Tanque', 'tanquero'));
    ejesDe(c).filter((e) => e.unidad === 'tanquero').forEach((e) => lista.push(p(e.id, `${e.id} (llantas y frenos)`, 'eje', 'fa-dharmachakra', 'Tanque', 'tanquero')));
  }
  lista.push(
    p('Llantas', 'Llantas (elige el eje al registrar)', 'llantas', 'fa-circle-dot', 'General'),
    p('Frenos', 'Frenos (elige el eje al registrar)', 'frenos', 'fa-compact-disc', 'General'),
    p('Equipo de Seguridad', 'Extintores y equipo de seguridad', 'seguridad', 'fa-fire-extinguisher', 'General'),
    p('General / Eléctrico / Engrase', 'Revisión general / engrase / lavado', 'general', 'fa-screwdriver-wrench', 'General'),
  );
  return lista;
}

// Trabajos típicos de una parte en este vehículo (los comunes de su clase + los propios del modelo)
export function trabajosDe(parteId, cfg) {
  const c = configVehiculo(cfg);
  const parte = partesDe(c).find((x) => x.id === parteId);
  const clase = parte?.clase || 'general';
  const propios = modeloPorId(c.modeloId)?.trabajosPropios?.[clase] || [];
  return [...new Set([...(TRABAJOS[clase] || TRABAJOS.general), ...propios, OTRO_TRABAJO])];
}

// ¿El trabajo de esta parte se guarda en el tanquero (remolque) o en el vehículo?
// «parte» puede venir compuesta: «Frenos - Eje 2 Remolque».
export function unidadDeParte(parte, cfg) {
  const c = configVehiculo(cfg);
  if (c.tipo !== 'tracto') return 'vehiculo';
  const base = String(parte || '');
  const hallada = partesDe(c).find((x) => x.id === base) || partesDe(c).find((x) => base.endsWith(` - ${x.id}`));
  if (hallada) return hallada.unidad;
  return /Remolque|Tanque/.test(base) ? 'tanquero' : 'vehiculo';
}
