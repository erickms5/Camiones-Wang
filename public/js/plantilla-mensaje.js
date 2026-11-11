// Plantilla del mensaje que se copia desde el detalle de un viaje (botón «Copiar mensaje»).
// ES EL ÚNICO LUGAR donde se cambia ese texto. Cada {palabra} se reemplaza por el dato del viaje.
//   {fecha} {carga} {destino} {km_salida} {km_llegada} {tanqueos}
// LINEA_PRODUCTO se repite una vez por cada producto del viaje: {producto} {galones} {guia}

export const PLANTILLA_VIAJE = [
  'Viaje {fecha} · {carga} → {destino}',
  '{productos}',
  'Km {km_salida}-{km_llegada}',
  'Tanqueos {tanqueos} gal',
].join('\n');

export const LINEA_PRODUCTO = '{producto} {galones} gal guía {guia}';
