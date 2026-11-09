// Esquema de la base de datos (PostgreSQL) con Drizzle ORM.
// Las migraciones SQL se generan con `npm run db:generar` en la carpeta drizzle/.
import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, uuid, text, integer, boolean, timestamp, date, numeric, jsonb, uniqueIndex, index, primaryKey,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const creadoEn = () => timestamp('creado_en', { withTimezone: true }).notNull().defaultNow();

export const rolUsuario = pgEnum('rol_usuario', ['dueno', 'chofer']);
export const rolUnidad = pgEnum('rol_unidad', ['cabezal', 'remolque']);

// Cuenta del dueño: agrupa sus camiones y sus choferes
export const cuentas = pgTable('cuentas', {
  id: id(),
  nombre: text('nombre').notNull(),
  creadoEn: creadoEn(),
});

// Dueños y choferes. Todos entran con un código enviado a su email.
export const usuarios = pgTable('usuarios', {
  id: id(),
  cuentaId: uuid('cuenta_id').notNull().references(() => cuentas.id),
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

export const codigosAcceso = pgTable('codigos_acceso', {
  id: id(),
  email: text('email').notNull(),
  codigoHash: text('codigo_hash').notNull(),
  expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
  intentos: integer('intentos').notNull().default(0),
  usado: boolean('usado').notNull().default(false),
  creadoEn: creadoEn(),
}, (t) => [index('codigos_email').on(t.email)]);

export const sesiones = pgTable('sesiones', {
  id: id(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  tokenHash: text('token_hash').notNull(),
  expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
  creadoEn: creadoEn(),
}, (t) => [uniqueIndex('sesiones_token_unico').on(t.tokenHash)]);

// Cabezales y remolques. El id puede venir del teléfono (sin conexión) para no duplicar al sincronizar.
export const unidades = pgTable('unidades', {
  id: id(),
  cuentaId: uuid('cuenta_id').notNull().references(() => cuentas.id),
  rol: rolUnidad('rol').notNull(),
  tipo: text('tipo').notNull(), // tracto, tanquero, plataforma, furgon, otro
  placa: text('placa').notNull(),
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
  notas: text('notas'),
  bloqueado: boolean('bloqueado').notNull().default(false), // incluido en un reporte congelado
  reporteId: uuid('reporte_id'),
  creadoEn: creadoEn(),
}, (t) => [index('mant_cuenta_fecha').on(t.cuentaId, t.fecha)]);

// Partes afectadas por un mantenimiento (ej. frenos de varios ejes)
export const mantenimientoComponentes = pgTable('mantenimiento_componentes', {
  mantenimientoId: uuid('mantenimiento_id').notNull().references(() => mantenimientos.id),
  componenteId: uuid('componente_id').notNull().references(() => componentes.id),
}, (t) => [primaryKey({ columns: [t.mantenimientoId, t.componenteId] })]);

// Facturas y fotos. El archivo vive en el almacenamiento (disco o R2); aquí su huella y la hora de subida.
export const evidencias = pgTable('evidencias', {
  id: id(),
  mantenimientoId: uuid('mantenimiento_id').notNull().references(() => mantenimientos.id),
  categoria: text('categoria').notNull(), // Factura de Taller, Factura de Repuestos, anexo…
  nombreArchivo: text('nombre_archivo').notNull(),
  mime: text('mime').notNull(),
  tamano: integer('tamano'),
  claveAlmacen: text('clave_almacen'),
  sha256: text('sha256'),
  anexoPosterior: boolean('anexo_posterior').notNull().default(false),
  subidoPor: uuid('subido_por').notNull().references(() => usuarios.id),
  subidoEn: timestamp('subido_en', { withTimezone: true }),
  creadoEn: creadoEn(),
});

// Reportes congelados: copia de los datos + hash SHA-256. Lo posterior se agrega como anexo.
export const reportes = pgTable('reportes', {
  id: id(),
  cuentaId: uuid('cuenta_id').notNull().references(() => cuentas.id),
  folio: text('folio').notNull(),
  tipo: text('tipo').notNull(), // mensual, individual
  periodo: text('periodo'), // AAAA-MM
  choferId: uuid('chofer_id').references(() => usuarios.id),
  generadoPor: uuid('generado_por').notNull().references(() => usuarios.id),
  generadoEn: timestamp('generado_en', { withTimezone: true }).notNull().defaultNow(),
  total: numeric('total', { precision: 12, scale: 2 }).notNull(),
  hash: text('hash').notNull(),
  datos: jsonb('datos').notNull(),
}, (t) => [uniqueIndex('reportes_folio_unico').on(t.cuentaId, t.folio)]);

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
