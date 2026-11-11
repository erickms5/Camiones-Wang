// Esquema de la base de datos (PostgreSQL) con Drizzle ORM.
// Las migraciones SQL se generan con `npm run db:generar` en la carpeta drizzle/.
import { sql } from 'drizzle-orm';
import {
  customType, pgTable, pgEnum, uuid, text, integer, boolean, timestamp, date, numeric, jsonb, uniqueIndex, index, primaryKey, check,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const creadoEn = () => timestamp('creado_en', { withTimezone: true }).notNull().defaultNow();

export const rolUsuario = pgEnum('rol_usuario', ['dueno', 'chofer', 'admin']);
export const rolUnidad = pgEnum('rol_unidad', ['cabezal', 'remolque']);

// Cuenta = empresa de transporte: agrupa sus dueños, sus camiones y sus choferes.
// Cada empresa está aislada de las demás: agregar otra no toca los datos de las que ya existen.
export const cuentas = pgTable('cuentas', {
  id: id(),
  nombre: text('nombre').notNull(),
  creadoEn: creadoEn(),
});

// Administrador (sin empresa: da soporte a todas), dueños y choferes. Entran con correo y contraseña.
export const usuarios = pgTable('usuarios', {
  id: id(),
  cuentaId: uuid('cuenta_id').references(() => cuentas.id), // vacío solo para el administrador
  email: text('email').notNull(),
  nombre: text('nombre').notNull(),
  rol: rolUsuario('rol').notNull(),
  telefono: text('telefono'),
  claveHash: text('clave_hash'), // contraseña con scrypt (sal propia por usuario)
  intentosFallidos: integer('intentos_fallidos').notNull().default(0),
  bloqueadoHasta: timestamp('bloqueado_hasta', { withTimezone: true }), // pausa tras muchos intentos fallidos
  cedulaCifrada: text('cedula_cifrada'), // AES-256-GCM
  cedulaHash: text('cedula_hash'), // HMAC para evitar cédulas repetidas sin descifrar
  consentimientoEn: timestamp('consentimiento_en', { withTimezone: true }),
  activo: boolean('activo').notNull().default(true),
  creadoEn: creadoEn(),
}, (t) => [
  uniqueIndex('usuarios_email_unico').on(t.email),
  uniqueIndex('usuarios_cedula_cuenta_unica').on(t.cuentaId, t.cedulaHash),
]);

export const sesiones = pgTable('sesiones', {
  id: id(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  tokenHash: text('token_hash').notNull(),
  expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
  creadoEn: creadoEn(),
}, (t) => [uniqueIndex('sesiones_token_unico').on(t.tokenHash)]);

// Unidades con placa: cabezal (tipo «tracto»), su tanquero (rol remolque) o camión rígido con el tanque
// encima (rol cabezal, tipo «camion»). «atributos.modeloId» apunta al catálogo de la flota.
export const unidades = pgTable('unidades', {
  id: id(),
  cuentaId: uuid('cuenta_id').notNull().references(() => cuentas.id),
  rol: rolUnidad('rol').notNull(),
  tipo: text('tipo').notNull(), // tracto, camion, tanquero
  placa: text('placa'), // el tanquero no lleva placa: se identifica por la de su cabezal
  marca: text('marca').notNull(),
  modelo: text('modelo').notNull(),
  anio: integer('anio'),
  numEjes: integer('num_ejes').notNull(),
  numLlantas: integer('num_llantas').notNull(),
  atributos: jsonb('atributos').notNull().default({}),
  activa: boolean('activa').notNull().default(true),
  creadoEn: creadoEn(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('unidades_placa_unica').on(t.placa)]);

// Dueños de cada unidad: un vehículo puede tener varios dueños y cada dueño ve solo los suyos.
export const propietarios = pgTable('propietarios', {
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  unidadId: uuid('unidad_id').notNull().references(() => unidades.id),
  desde: timestamp('desde', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.usuarioId, t.unidadId] })]);

export const acoplamientos = pgTable('acoplamientos', {
  id: id(),
  cabezalId: uuid('cabezal_id').notNull().references(() => unidades.id),
  remolqueId: uuid('remolque_id').notNull().references(() => unidades.id),
  desde: date('desde').notNull(),
  hasta: date('hasta'),
});

// Qué chofer maneja qué unidad (el historial no se borra: se cierra con «hasta»)
export const asignaciones = pgTable('asignaciones', {
  id: id(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  unidadId: uuid('unidad_id').notNull().references(() => unidades.id),
  desde: timestamp('desde', { withTimezone: true }).notNull().defaultNow(),
  hasta: timestamp('hasta', { withTimezone: true }),
});

// Árbol de partes: motor, transmisión, quinta rueda, tanque, compartimentos, ejes → llantas y frenos.
// «detalles» guarda la ficha de cada llanta o freno (marca, medida, labrado, estado…).
export const componentes = pgTable('componentes', {
  id: id(),
  unidadId: uuid('unidad_id').notNull().references(() => unidades.id),
  padreId: uuid('padre_id'),
  tipo: text('tipo').notNull(), // motor, transmision, quinta, tanque, compartimento, eje, llanta, freno, general
  nombre: text('nombre').notNull(),
  posicion: text('posicion'), // ej. izq-ext para llantas dobles
  orden: integer('orden').notNull().default(0),
  capacidadGalones: integer('capacidad_galones'),
  detalles: jsonb('detalles').notNull().default({}),
  activo: boolean('activo').notNull().default(true),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('componentes_unidad').on(t.unidadId)]);

export const odometro = pgTable('odometro', {
  id: id(),
  unidadId: uuid('unidad_id').notNull().references(() => unidades.id),
  km: integer('km').notNull(),
  fuente: text('fuente').notNull().default('manual'), // manual hoy; gps u obd en el futuro
  registradoPor: uuid('registrado_por').references(() => usuarios.id),
  registradoEn: timestamp('registrado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const intervalos = pgTable('intervalos', {
  id: id(),
  unidadId: uuid('unidad_id').notNull().references(() => unidades.id),
  tarea: text('tarea').notNull(),
  componente: text('componente').notNull(),
  cadaKm: integer('cada_km'),
  cadaMeses: integer('cada_meses'),
  origen: text('origen').notNull(), // id del catálogo o «generico»
  editado: boolean('editado').notNull().default(false),
});

export const mantenimientos = pgTable('mantenimientos', {
  id: id(), // generado en el teléfono: reintentos sin duplicar
  cuentaId: uuid('cuenta_id').notNull().references(() => cuentas.id),
  unidadId: uuid('unidad_id').references(() => unidades.id),
  // Vehículo al que cuenta el trabajo: el mismo cabezal/camión, o el cabezal que llevaba enganchado el tanquero
  vehiculoId: uuid('vehiculo_id').references(() => unidades.id),
  creadoPor: uuid('creado_por').notNull().references(() => usuarios.id),
  fecha: date('fecha').notNull(),
  km: integer('km').notNull(),
  parte: text('parte').notNull(), // ej. «Frenos - Eje 2 Remolque»
  trabajo: text('trabajo').notNull(),
  provincia: text('provincia'),
  canton: text('canton'),
  taller: text('taller'),
  costoTaller: numeric('costo_taller', { precision: 10, scale: 2 }).notNull().default('0'),
  proveedor: text('proveedor'),
  costoRepuestos: numeric('costo_repuestos', { precision: 10, scale: 2 }).notNull().default('0'),
  repuestosDetalle: text('repuestos_detalle'),
  // Forma de pago de cada parte por separado: efectivo, transferencia, cheque o credito.
  // Lo que queda a crédito es una deuda hasta que el dueño la marca como pagada («…PagadoEn»).
  pagoTaller: text('pago_taller'),
  tallerPagadoEn: timestamp('taller_pagado_en', { withTimezone: true }),
  tallerPagadoCon: text('taller_pagado_con'),
  pagoRepuestos: text('pago_repuestos'),
  repuestosPagadoEn: timestamp('repuestos_pagado_en', { withTimezone: true }),
  repuestosPagadoCon: text('repuestos_pagado_con'),
  notas: text('notas'),
  bloqueado: boolean('bloqueado').notNull().default(false), // incluido en un reporte congelado
  reporteId: uuid('reporte_id'),
  creadoEn: creadoEn(),
}, (t) => [index('mant_cuenta_fecha').on(t.cuentaId, t.fecha)]);

// Trabajos de una visita al taller: un mantenimiento puede incluir varios trabajos sobre varias partes.
// «tipo_trabajo_id» es la clave del catálogo (public/js/catalogo-trabajos.js); parte y trabajo guardan el texto tal como se vio.
export const mantenimientoTrabajos = pgTable('mantenimiento_trabajos', {
  id: id(),
  mantenimientoId: uuid('mantenimiento_id').notNull().references(() => mantenimientos.id),
  tipoTrabajoId: text('tipo_trabajo_id').notNull(),
  componenteId: uuid('componente_id').references(() => componentes.id),
  parte: text('parte').notNull(),
  trabajo: text('trabajo').notNull(),
  nota: text('nota'),
  orden: integer('orden').notNull().default(0),
}, (t) => [index('mant_trabajos_mantenimiento').on(t.mantenimientoId)]);

// Lugares de carga y de destino que cada chofer va escribiendo en sus viajes (la lista empieza vacía).
export const lugares = pgTable('lugares', {
  id: id(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  nombre: text('nombre').notNull(),
  nombreNormalizado: text('nombre_normalizado').notNull(), // sin mayúsculas, tildes ni espacios: evita duplicados
  tipo: text('tipo'), // estacion, gasolinera, minera, otro
  usadoComoCarga: boolean('usado_como_carga').notNull().default(false),
  usadoComoDestino: boolean('usado_como_destino').notNull().default(false),
  vecesUsado: integer('veces_usado').notNull().default(0),
  activo: boolean('activo').notNull().default(true),
  creadoEn: creadoEn(),
}, (t) => [uniqueIndex('lugares_usuario_nombre_unico').on(t.usuarioId, t.nombreNormalizado)]);

// Viajes: salen de una estación de carga hacia gasolineras o mineras y regresan vacíos.
// El vehículo es el cabezal (con su tanquero en «remolque_id») o el camión con el tanque encima.
export const viajes = pgTable('viajes', {
  id: id(), // generado en el teléfono: reintentos sin duplicar
  cuentaId: uuid('cuenta_id').notNull().references(() => cuentas.id),
  cabezalId: uuid('cabezal_id').notNull().references(() => unidades.id),
  remolqueId: uuid('remolque_id').references(() => unidades.id),
  creadoPor: uuid('creado_por').notNull().references(() => usuarios.id),
  fechaSalida: date('fecha_salida').notNull(),
  horaSalida: text('hora_salida').notNull(), // HH:MM, hora de Ecuador
  fechaRetorno: date('fecha_retorno'),
  horaRetorno: text('hora_retorno'),
  origenId: uuid('origen_id').notNull().references(() => lugares.id),
  destinoId: uuid('destino_id').notNull().references(() => lugares.id),
  kmSalida: integer('km_salida').notNull(),
  kmLlegada: integer('km_llegada'),
  estado: text('estado').notNull().default('abierto'), // abierto | cerrado
  notas: text('notas'),
  bloqueado: boolean('bloqueado').notNull().default(false), // incluido en un reporte congelado
  reporteId: uuid('reporte_id'),
  activo: boolean('activo').notNull().default(true), // baja lógica: nada se borra
  creadoEn: creadoEn(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('viajes_cuenta_fecha').on(t.cuentaId, t.fechaSalida),
  // Solo un viaje abierto por vehículo
  uniqueIndex('viajes_un_abierto_por_vehiculo').on(t.cabezalId).where(sql`estado = 'abierto' and activo`),
]);

// Carga del viaje: hasta 3 productos, cada uno con sus galones y su número de guía
export const viajeProductos = pgTable('viaje_productos', {
  id: id(),
  viajeId: uuid('viaje_id').notNull().references(() => viajes.id),
  producto: text('producto').notNull(), // diesel | super | ecopais
  galones: integer('galones').notNull(),
  numeroGuia: text('numero_guia').notNull(),
}, (t) => [uniqueIndex('viaje_producto_unico').on(t.viajeId, t.producto)]);

// Opcional: en qué compartimentos fue cada producto en ese viaje
export const viajeCompartimentos = pgTable('viaje_compartimentos', {
  viajeId: uuid('viaje_id').notNull().references(() => viajes.id),
  componenteId: uuid('componente_id').notNull().references(() => componentes.id),
  producto: text('producto').notNull(),
}, (t) => [primaryKey({ columns: [t.viajeId, t.componenteId] })]);

// Tanqueos: combustible que consume el camión. Con viaje abierto se ligan a él; si no, quedan en el vehículo.
export const tanqueos = pgTable('tanqueos', {
  id: id(), // generado en el teléfono
  cuentaId: uuid('cuenta_id').notNull().references(() => cuentas.id),
  cabezalId: uuid('cabezal_id').notNull().references(() => unidades.id),
  viajeId: uuid('viaje_id').references(() => viajes.id),
  creadoPor: uuid('creado_por').notNull().references(() => usuarios.id),
  fechaHora: timestamp('fecha_hora', { withTimezone: true }).notNull(),
  galones: numeric('galones', { precision: 8, scale: 2 }).notNull(),
  lugar: text('lugar'),
  km: integer('km'),
  costo: numeric('costo', { precision: 10, scale: 2 }),
  bloqueado: boolean('bloqueado').notNull().default(false),
  reporteId: uuid('reporte_id'),
  activo: boolean('activo').notNull().default(true),
  creadoEn: creadoEn(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('tanqueos_cabezal_fecha').on(t.cabezalId, t.fechaHora)]);

// Partes afectadas por un mantenimiento (ej. frenos de varios ejes)
export const mantenimientoComponentes = pgTable('mantenimiento_componentes', {
  mantenimientoId: uuid('mantenimiento_id').notNull().references(() => mantenimientos.id),
  componenteId: uuid('componente_id').notNull().references(() => componentes.id),
}, (t) => [primaryKey({ columns: [t.mantenimientoId, t.componenteId] })]);

// Facturas y fotos. El archivo vive en el almacenamiento (disco o R2); aquí su huella y la hora de subida.
export const evidencias = pgTable('evidencias', {
  id: id(),
  // Una evidencia pertenece a un mantenimiento o a un viaje, nunca a ambos
  mantenimientoId: uuid('mantenimiento_id').references(() => mantenimientos.id),
  viajeId: uuid('viaje_id').references(() => viajes.id),
  categoria: text('categoria').notNull(), // Factura de Taller, Factura de Repuestos, Guía, anexo…
  nombreArchivo: text('nombre_archivo').notNull(),
  mime: text('mime').notNull(),
  tamano: integer('tamano'),
  claveAlmacen: text('clave_almacen'),
  sha256: text('sha256'),
  anexoPosterior: boolean('anexo_posterior').notNull().default(false),
  subidoPor: uuid('subido_por').notNull().references(() => usuarios.id),
  subidoEn: timestamp('subido_en', { withTimezone: true }),
  creadoEn: creadoEn(),
}, () => [check('evidencias_un_solo_origen', sql`(mantenimiento_id is null) <> (viaje_id is null)`)]);

// Reportes congelados: copia de los datos + hash SHA-256. Lo posterior se agrega como anexo.
export const reportes = pgTable('reportes', {
  id: id(),
  cuentaId: uuid('cuenta_id').notNull().references(() => cuentas.id),
  folio: text('folio').notNull(),
  tipo: text('tipo').notNull(), // mensual, individual
  periodo: text('periodo'), // AAAA-MM
  choferId: uuid('chofer_id').references(() => usuarios.id),
  vehiculoId: uuid('vehiculo_id').references(() => unidades.id), // cada dueño ve los reportes de sus vehículos
  generadoPor: uuid('generado_por').notNull().references(() => usuarios.id),
  generadoEn: timestamp('generado_en', { withTimezone: true }).notNull().defaultNow(),
  total: numeric('total', { precision: 12, scale: 2 }).notNull(),
  hash: text('hash').notNull(),
  datos: jsonb('datos').notNull(),
}, (t) => [uniqueIndex('reportes_folio_unico').on(t.cuentaId, t.folio)]);

// Viajes y tanqueos congelados en cada reporte
export const reporteViajes = pgTable('reporte_viajes', {
  reporteId: uuid('reporte_id').notNull().references(() => reportes.id),
  viajeId: uuid('viaje_id').notNull().references(() => viajes.id),
}, (t) => [primaryKey({ columns: [t.reporteId, t.viajeId] })]);

export const reporteTanqueos = pgTable('reporte_tanqueos', {
  reporteId: uuid('reporte_id').notNull().references(() => reportes.id),
  tanqueoId: uuid('tanqueo_id').notNull().references(() => tanqueos.id),
}, (t) => [primaryKey({ columns: [t.reporteId, t.tanqueoId] })]);

export const auditoria = pgTable('auditoria', {
  id: id(),
  cuentaId: uuid('cuenta_id').references(() => cuentas.id),
  usuarioId: uuid('usuario_id').references(() => usuarios.id),
  entidad: text('entidad').notNull(),
  entidadId: text('entidad_id'),
  accion: text('accion').notNull(),
  datos: jsonb('datos'),
  en: timestamp('en', { withTimezone: true }).notNull().default(sql`now()`),
});

// Contenido de las facturas (fotos/PDF). En la base de datos para que no se pierdan en servidores sin disco fijo.
const bytea = customType({ dataType: () => 'bytea' });
export const archivos = pgTable('archivos', {
  clave: text('clave').primaryKey(),
  datos: bytea('datos').notNull(),
  creadoEn: creadoEn(),
});
