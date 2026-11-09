// Catálogo interno de modelos (tabla catalogo_modelos). No se muestra al usuario:
// solo alimenta el autocompletado de marca/modelo y los intervalos de mantenimiento sugeridos.
// Campos: marca, modelo, anio_desde, anio_hasta, motor, intervalos.
// Los km y meses de los intervalos están pendientes de validar con el manual del fabricante.

export const CATALOGO_MODELOS = [
  {
    id: 'freightliner-columbia-2020',
    marca: 'Freightliner',
    modelo: 'Columbia',
    anio_desde: 2020,
    anio_hasta: 2020,
    motor: 'Detroit DD15',
    intervalos: [
      { tarea: 'Cambio de aceite y filtro de motor', componente: 'Motor', cada_km: 40000, cada_meses: 12 },
      { tarea: 'Cambio de filtros de combustible', componente: 'Motor', cada_km: 80000, cada_meses: 12 },
      { tarea: 'Cambio de filtro de aire', componente: 'Motor', cada_km: 80000, cada_meses: 12 },
      { tarea: 'Cambio de aceite de transmisión', componente: 'Transmisión', cada_km: 400000, cada_meses: 36 },
      { tarea: 'Cambio de aceite de diferenciales', componente: 'Ejes', cada_km: 400000, cada_meses: 36 },
      { tarea: 'Engrase de chasis y quinta rueda', componente: 'Quinta rueda', cada_km: 20000, cada_meses: 3 },
      { tarea: 'Inspección de frenos', componente: 'Frenos', cada_km: 20000, cada_meses: 3 },
      { tarea: 'Revisión y rotación de llantas', componente: 'Llantas', cada_km: 20000, cada_meses: 3 },
    ],
  },
];

// Intervalos genéricos editables para cabezales sin coincidencia en el catálogo.
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

export const normalizar = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function buscarModelo(marca, modelo, anio) {
  const a = Number(anio);
  return (
    CATALOGO_MODELOS.find(
      (c) => normalizar(c.marca) === normalizar(marca) && normalizar(c.modelo) === normalizar(modelo) && a >= c.anio_desde && a <= c.anio_hasta,
    ) || null
  );
}

// Sugerencias solo cuando el usuario ya escribió algo que coincide (nada se muestra con el campo vacío).
const unicos = (lista) => [...new Set(lista)];
export function sugerirMarcas(texto) {
  const t = normalizar(texto);
  if (!t) return [];
  return unicos(CATALOGO_MODELOS.map((c) => c.marca)).filter((m) => normalizar(m).startsWith(t) && normalizar(m) !== t);
}
export function sugerirModelos(marca, texto) {
  const t = normalizar(texto);
  if (!t) return [];
  const m = normalizar(marca);
  return unicos(CATALOGO_MODELOS.filter((c) => normalizar(c.marca) === m).map((c) => c.modelo)).filter(
    (x) => normalizar(x).startsWith(t) && normalizar(x) !== t,
  );
}
