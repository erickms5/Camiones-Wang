// Plantillas de tipo de unidad (sección 7). Agregar un tipo nuevo = agregar un objeto aquí;
// el formulario se genera solo a partir de "campos".
// Cada campo: id, etiqueta, tipo (numero | texto | lista | sino | placa), requerido, min, max,
// opciones (lista), unidad, ayuda, nombreMensaje (para los mensajes de error).

export const PLANTILLAS = [
  {
    id: 'tracto',
    nombre: 'Tractocamión',
    rol: 'cabezal',
    descripcion: 'Cabezal con motor y odómetro',
    defectos: { num_ejes: 3, num_llantas: 10 },
    campos: [
      { id: 'km_inicial', etiqueta: 'Kilometraje actual del odómetro', tipo: 'numero', requerido: true, min: 0, advertirSobre: 2000000, unidad: 'km', nombreMensaje: 'el kilometraje', ayuda: 'Mire el tablero del camión y escriba el número completo.' },
      { id: 'motor', etiqueta: 'Motor', tipo: 'lista', opciones: ['Detroit DD13', 'Detroit DD15', 'Cummins X15', 'Otro / no sé'], nombreMensaje: 'el motor' },
      { id: 'transmision', etiqueta: 'Transmisión', tipo: 'lista', opciones: ['Manual 10 velocidades', 'Manual 13 velocidades', 'Manual 18 velocidades', 'Automatizada', 'Otra / no sé'], nombreMensaje: 'la transmisión' },
      { id: 'vin', etiqueta: 'Número de chasis (VIN)', tipo: 'texto', min: 17, max: 17, nombreMensaje: 'el número de chasis', ayuda: 'Tiene 17 letras y números. Está en la matrícula.' },
    ],
    componentes: ['Motor', 'Transmisión', 'Ejes', 'Frenos', 'Llantas', 'Quinta rueda'],
  },
  {
    id: 'tanquero',
    nombre: 'Tanquero',
    rol: 'remolque',
    descripcion: 'Tanque para líquidos',
    tanque: true,
    defectos: { num_ejes: 3, num_llantas: 12 },
    campos: [
      { id: 'material', etiqueta: 'Material del tanque', tipo: 'lista', requerido: true, opciones: ['Aluminio', 'Acero inoxidable', 'Acero al carbono'], nombreMensaje: 'el material del tanque' },
      { id: 'producto', etiqueta: '¿Qué transporta?', tipo: 'lista', opciones: ['Combustible', 'Agua', 'Químicos', 'Alimentos líquidos', 'Otro'], nombreMensaje: 'lo que transporta' },
      { id: 'placa_tanque', etiqueta: 'Placa propia del tanque', tipo: 'placa', nombreMensaje: 'la placa del tanque', ayuda: 'En Ecuador el tanque puede tener su propia placa. Si no tiene, déjelo vacío.' },
    ],
    componentes: ['Ejes', 'Frenos', 'Llantas', 'Quinta rueda', 'Tanque', 'Válvulas'],
  },
  {
    id: 'plataforma',
    nombre: 'Plataforma',
    rol: 'remolque',
    descripcion: 'Carga plana o contenedores',
    defectos: { num_ejes: 2, num_llantas: 8 },
    limites: { num_ejes: { min: 2, max: 3 } },
    campos: [
      { id: 'largo_pies', etiqueta: 'Largo', tipo: 'numero', requerido: true, min: 20, max: 60, unidad: 'pies', nombreMensaje: 'el largo' },
      { id: 'twist_locks', etiqueta: '¿Tiene twist locks (seguros para contenedor)?', tipo: 'sino', nombreMensaje: 'si tiene twist locks' },
    ],
    componentes: ['Ejes', 'Frenos', 'Llantas', 'Piso', 'Twist locks'],
  },
  {
    id: 'furgon',
    nombre: 'Furgón',
    rol: 'remolque',
    descripcion: 'Caja cerrada',
    defectos: { num_ejes: 2, num_llantas: 8 },
    campos: [
      { id: 'puertas', etiqueta: 'Número de puertas', tipo: 'numero', requerido: true, min: 1, max: 6, nombreMensaje: 'el número de puertas' },
      { id: 'refrigerado', etiqueta: '¿Es refrigerado?', tipo: 'sino', requerido: true, nombreMensaje: 'si es refrigerado' },
    ],
    componentes: ['Ejes', 'Frenos', 'Llantas', 'Puertas', 'Equipo de frío'],
  },
  {
    id: 'otro',
    nombre: 'Otro',
    rol: 'remolque',
    descripcion: 'Otro tipo de remolque',
    defectos: { num_ejes: 2, num_llantas: 8 },
    campos: [
      { id: 'descripcion', etiqueta: 'Describa la unidad', tipo: 'texto', requerido: true, min: 3, max: 80, nombreMensaje: 'la descripción' },
    ],
    componentes: ['Ejes', 'Frenos', 'Llantas'],
  },
];

export const plantilla = (id) => PLANTILLAS.find((p) => p.id === id);
export const plantillasPorRol = (rol) => PLANTILLAS.filter((p) => p.rol === rol);

export const CATALOGO = {
  cabezal: {
    Freightliner: ['Columbia', 'Cascadia', 'M2 106', 'Coronado'],
    Kenworth: ['T800', 'T880', 'W900'],
    International: ['LT', 'ProStar', '9800i'],
    Volvo: ['VNL', 'FH', 'FM'],
    Mack: ['Anthem', 'Granite', 'Pinnacle'],
    Hino: ['500', '700'],
  },
  remolque: {
    'Fabricación nacional': [],
    Heil: [],
    Polar: [],
    'Great Dane': [],
    Utility: [],
    Wabash: [],
  },
};

const rueda = (x, y = 50, r = 7) => `<circle cx="${x}" cy="${y}" r="${r}" class="ic-rueda"/><circle cx="${x}" cy="${y}" r="${r / 2.6}" class="ic-cubo"/>`;

export const ICONOS = {
  cabezal: `<svg viewBox="0 0 120 60" aria-hidden="true"><rect x="36" y="4" width="3" height="22" rx="1" class="ic-linea"/><path d="M40 44V10h26l6 12 32 4q5 1 5 6v12z" class="ic-cuerpo"/><path d="M58 14h7l5 9H58z" class="ic-vidrio"/><rect x="6" y="40" width="34" height="4" class="ic-linea"/>${rueda(18)}${rueda(34)}${rueda(92)}</svg>`,
  remolque: `<svg viewBox="0 0 120 60" aria-hidden="true"><rect x="6" y="10" width="108" height="30" rx="3" class="ic-cuerpo"/><rect x="26" y="40" width="3" height="12" class="ic-linea"/>${rueda(84)}${rueda(100)}</svg>`,
  tanquero: `<svg viewBox="0 0 120 60" aria-hidden="true"><rect x="10" y="5" width="8" height="5" rx="1" class="ic-linea"/><rect x="50" y="5" width="8" height="5" rx="1" class="ic-linea"/><rect x="88" y="5" width="8" height="5" rx="1" class="ic-linea"/><rect x="4" y="10" width="112" height="30" rx="15" class="ic-cuerpo"/><line x1="40" y1="12" x2="40" y2="38" class="ic-div"/><line x1="76" y1="12" x2="76" y2="38" class="ic-div"/><rect x="26" y="40" width="3" height="12" class="ic-linea"/>${rueda(84)}${rueda(100)}</svg>`,
  plataforma: `<svg viewBox="0 0 120 60" aria-hidden="true"><rect x="4" y="34" width="112" height="7" rx="1" class="ic-cuerpo"/><rect x="14" y="26" width="8" height="8" class="ic-linea"/><rect x="98" y="26" width="8" height="8" class="ic-linea"/><rect x="26" y="41" width="3" height="11" class="ic-linea"/>${rueda(84)}${rueda(100)}</svg>`,
  furgon: `<svg viewBox="0 0 120 60" aria-hidden="true"><rect x="4" y="6" width="112" height="35" rx="2" class="ic-cuerpo"/><line x1="104" y1="9" x2="104" y2="38" class="ic-div"/><rect x="26" y="41" width="3" height="11" class="ic-linea"/>${rueda(84)}${rueda(100)}</svg>`,
  otro: `<svg viewBox="0 0 120 60" aria-hidden="true"><rect x="4" y="10" width="112" height="30" rx="3" class="ic-cuerpo ic-punteado"/><text x="60" y="33" text-anchor="middle" class="ic-texto">?</text><rect x="26" y="40" width="3" height="12" class="ic-linea"/>${rueda(84)}${rueda(100)}</svg>`,
};
ICONOS.tracto = ICONOS.cabezal;
