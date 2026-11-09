// Todos los textos y mensajes en un solo lugar (requisito 12.5).

export const miles = (n) => {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '';
  const s = String(Math.trunc(Math.abs(Number(n)))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (Number(n) < 0 ? '-' : '') + s;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const T = {
  app: {
    nombre: 'Registro de unidades',
    guardado: 'Guardado en el teléfono',
    sinInternet: 'Sin internet',
  },
  placa: {
    vacia: 'Escriba la placa de la unidad.',
    letras: 'La placa debe empezar con 3 letras. Ejemplo: ABC-1234.',
    soloNumeros: 'Después de las 3 letras solo van números. Ejemplo: ABC-1234.',
    cantidadNumeros: 'Después de las letras van 3 o 4 números. Ejemplo: ABC-123 o ABC-1234.',
    duplicada: (p) => `La placa ${p} ya está registrada. Búsquela en «Mis unidades» para editarla en lugar de registrarla otra vez.`,
    duplicadaBaja: (p) => `La placa ${p} pertenece a una unidad dada de baja. Puede reactivarla desde «Mis unidades».`,
    igualCabezal: 'La placa del tanque no puede ser la misma placa del remolque.',
  },
  cedula: {
    vacia: 'Escriba el número de cédula.',
    soloNumeros: 'La cédula solo lleva números, sin letras ni guiones.',
    diez: (n) => `La cédula debe tener 10 números. Ahora tiene ${n}.`,
    provincia: 'Los dos primeros números de la cédula no corresponden a ninguna provincia. Revise que esté bien escrita.',
    tercero: 'El tercer número de la cédula debe ser menor que 6. Revise que esté bien escrita.',
    verificador: 'El último número de la cédula no coincide. Revise que no falte, sobre ni se haya cambiado ningún número.',
    duplicada: (n) => `Ya hay un conductor con esta cédula (${n}). Elíjalo de la lista en lugar de crearlo otra vez.`,
  },
  telefono: {
    vacio: 'Escriba el número de celular.',
    soloNumeros: 'El celular solo lleva números. Ejemplo: 0991234567.',
    celular: 'El celular debe empezar con 09. Ejemplo: 0991234567.',
    largo: 'El celular debe tener 10 números. Ejemplo: 0991234567.',
  },
  nombre: {
    corto: 'Escriba el nombre completo (al menos 3 letras).',
    largo: 'El nombre es muy largo (máximo 80 letras).',
    caracteres: 'El nombre solo puede tener letras, espacios, tildes, guion y apóstrofe.',
  },
  numero: {
    vacio: (e) => `Escriba ${e}.`,
    soloNumeros: (e) => `${cap(e)} se escribe solo con números, sin letras.`,
    min: (e, m) => `${cap(e)} debe ser como mínimo ${miles(m)}.`,
    max: (e, m) => `${cap(e)} puede ser como máximo ${miles(m)}.`,
    seguro: (e, v) => `${cap(e)}: ${v}. Es un número muy alto. ¿Está seguro de que está bien escrito?`,
  },
  texto: {
    vacio: (e) => `Escriba ${e}.`,
    corto: (e, m) => `${cap(e)} debe tener al menos ${m} letras.`,
    largo: (e, m) => `${cap(e)} puede tener como máximo ${m} letras.`,
  },
  lista: { vacio: (e) => `Elija ${e}.` },
  tanque: {
    faltan: (n) => `Faltan ${miles(n)} galones`,
    sobran: (n) => `Sobran ${miles(n)} galones`,
    completo: 'La suma coincide con el total',
    sinCapacidad: 'Primero escriba la capacidad total del tanque.',
    sinCompartimentos: 'Agregue al menos un compartimento.',
    maximo: (m) => `Puede tener máximo ${m} compartimentos.`,
    aceptar: (m) => `${m}. Corrija los galones de los compartimentos o marque la casilla para aceptar la diferencia.`,
    aceptarCasilla: 'Acepto guardar aunque la suma no coincida con el total',
  },
  pasos: {
    placa: { titulo: '¿Cuál es la placa?', ayuda: 'La placa del cabezal o del remolque que va a registrar.' },
    tipo: { titulo: '¿Qué unidad es?' },
    generales: { titulo: 'Datos generales', ayuda: 'Marca, modelo y año están en la matrícula.' },
    especificos: { titulo: (n) => `Datos del ${n}` },
    tanque: { titulo: 'Tanque y compartimentos', ayuda: 'Escriba la capacidad total y cuántos galones lleva cada compartimento.' },
    acople: { tituloCabezal: '¿Qué remolque lleva?', tituloRemolque: '¿A qué cabezal va enganchado?' },
    conductor: { titulo: '¿Quién maneja esta unidad?', ayuda: 'Puede registrarlo ahora o después.' },
    resumen: { titulo: 'Revise los datos', tituloEdicion: 'Revise y guarde los cambios' },
  },
  errores: {
    elegirRol: 'Elija si es un cabezal o un remolque.',
    elegirTipo: 'Elija el tipo de remolque.',
    elegirAcople: 'Elija una opción.',
    fecha: 'Escriba la fecha en que se enganchó.',
    elegirConductor: 'Elija quién maneja la unidad.',
    consentimiento: 'Para guardar la cédula y el teléfono necesitamos la autorización del conductor. Marque la casilla.',
    revisePaso: 'Falta corregir un dato en este paso.',
  },
  avisos: {
    remolqueSinCabezal: 'Sin cabezal, este remolque no tendrá kilometraje asociado. Puede engancharlo después.',
    conductorDespues: 'Le recordaremos en la pantalla principal, sin molestar.',
    kmMenor: (a, b) => `El kilometraje ${a} es menor que el último registrado (${b}). ¿Está seguro?`,
  },
  consentimiento: 'El conductor autoriza guardar su cédula y teléfono para el registro de mantenimientos (Ley Orgánica de Protección de Datos Personales).',
  toast: {
    registrada: 'Unidad registrada',
    guardada: 'Cambios guardados',
    baja: 'Unidad dada de baja',
    reactivada: 'Unidad reactivada',
    km: 'Kilometraje registrado',
    conductor: 'Conductor guardado',
    ejemplo: 'Ejemplo del cliente cargado',
    borrado: 'Datos borrados',
  },
};
