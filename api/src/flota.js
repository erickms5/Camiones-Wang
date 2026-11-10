// Flota: quién puede ver cada unidad, alta de vehículos desde el catálogo y resumen para los paneles.
// «Vehículo» = lo que se maneja: un cabezal (con su tanquero enganchado) o un camión con el tanque encima.
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { acoplamientos, asignaciones, auditoria, componentes, intervalos, odometro, propietarios, unidades, usuarios } from './db/esquema.js';
import { ErrorHttp } from './app.js';
import { normalizarPlaca } from '../../public/js/validaciones.js';
import { modeloPorId, galones } from '../../public/js/catalogo.js';

const hoy = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- acceso
// Dueño: las unidades de las que es dueño. Chofer: su vehículo asignado y el tanquero que lleve enganchado.
export async function idsAccesibles(db, usuario) {
  let propias = [];
  if (usuario.rol === 'dueno') {
    propias = (await db.select({ id: propietarios.unidadId }).from(propietarios)
      .innerJoin(unidades, eq(propietarios.unidadId, unidades.id))
      .where(and(eq(propietarios.usuarioId, usuario.id), eq(unidades.cuentaId, usuario.cuentaId)))).map((x) => x.id);
  } else if (usuario.rol === 'chofer') {
    propias = (await db.select({ id: asignaciones.unidadId }).from(asignaciones)
      .where(and(eq(asignaciones.usuarioId, usuario.id), isNull(asignaciones.hasta)))).map((x) => x.id);
  }
  if (!propias.length) return [];
  // El tanquero enganchado va con su cabezal
  const enganchados = (await db.select({ id: acoplamientos.remolqueId }).from(acoplamientos)
    .where(and(inArray(acoplamientos.cabezalId, propias), isNull(acoplamientos.hasta)))).map((x) => x.id);
  return [...new Set([...propias, ...enganchados])];
}

export async function unidadAccesible(db, usuario, id) {
  if (!z.string().uuid().safeParse(id).success) throw new ErrorHttp(404, 'Unidad no encontrada');
  const [u] = await db.select().from(unidades).where(and(eq(unidades.id, id), eq(unidades.cuentaId, usuario.cuentaId)));
  if (!u || !(await idsAccesibles(db, usuario)).includes(u.id)) throw new ErrorHttp(404, 'Unidad no encontrada');
  return u;
}

export async function acopleActivo(db, unidadId) {
  const [a] = await db.select().from(acoplamientos)
    .where(and(or(eq(acoplamientos.cabezalId, unidadId), eq(acoplamientos.remolqueId, unidadId)), isNull(acoplamientos.hasta)));
  return a || null;
}

// Vehículo al que cuenta un trabajo: la misma unidad si se maneja, o el cabezal que lleva enganchado el tanquero
export async function vehiculoDe(db, unidad) {
  if (unidad.rol === 'cabezal') return unidad.id;
  return (await acopleActivo(db, unidad.id))?.cabezalId || null;
}

export async function kmActual(db, unidadId) {
  const [ultimo] = await db.select().from(odometro).where(eq(odometro.unidadId, unidadId)).orderBy(desc(odometro.registradoEn)).limit(1);
  return ultimo?.km ?? null; // null: el dueño aún no pone el km
}

// ---------------------------------------------------------------- alta desde el catálogo
const placa = z.string().transform((v, ctx) => {
  const r = normalizarPlaca(v);
  if (r.error) {
    ctx.addIssue({ code: 'custom', message: r.error });
    return z.NEVER;
  }
  return r.valor;
});
const compartimentos = z.array(z.number().int().positive('Ingresa los galones de cada compartimento').max(50000)).min(1).max(10);

export const esquemaVehiculo = z.object({
  modeloId: z.string().refine((id) => !!modeloPorId(id), 'Elige un modelo de la lista'),
  placa,
  anio: z.number().int().min(1980).max(new Date().getFullYear() + 1).optional(),
  motor: z.string().trim().max(60).optional(),
  // Punto de partida del kilometraje: puede quedar pendiente; luego sube con los mantenimientos
  kmInicial: z.number().int().min(0).max(5_000_000).optional(),
  compartimentos: compartimentos.optional(), // si no se indica, los del modelo
});

export const esquemaEdicion = z.object({
  placa: placa.optional(),
  anio: z.number().int().min(1980).max(new Date().getFullYear() + 1).nullable().optional(),
  motor: z.string().trim().max(60).optional(),
  compartimentos: compartimentos.optional(),
  activa: z.boolean().optional(),
}).refine((x) => Object.keys(x).length > 0, 'Nada que cambiar');

// Partes iniciales: cada eje con sus llantas (sencillas adelante, dobles atrás) y sus frenos; el tanque con sus compartimentos.
function arbolComponentes(u, galonesPorCompartimento = []) {
  const lista = [];
  const agregar = (c) => {
    const id = randomUUID();
    lista.push({ id, unidadId: u.id, orden: lista.length, ...c });
    return id;
  };
  if (u.rol === 'cabezal') {
    agregar({ tipo: 'motor', nombre: 'Motor' });
    agregar({ tipo: 'transmision', nombre: 'Transmisión' });
    if (u.tipo === 'tracto') agregar({ tipo: 'quinta', nombre: 'Quinta rueda' });
  } else agregar({ tipo: 'quinta', nombre: 'Perno rey' });
  if (galonesPorCompartimento.length) {
    agregar({ tipo: 'tanque', nombre: 'Tanque' });
    agregar({ tipo: 'valvulas', nombre: 'Válvulas' });
    galonesPorCompartimento.forEach((g, i) => agregar({ tipo: 'compartimento', nombre: `Compartimento ${i + 1}`, posicion: String(i), capacidadGalones: g }));
  }
  for (let e = 0; e < u.numEjes; e++) {
    const delantero = u.rol === 'cabezal' && e === 0;
    const nombre = u.rol === 'cabezal' ? (delantero ? 'Eje delantero' : u.numEjes === 2 ? 'Eje trasero' : `Eje trasero ${e}`) : `Eje ${e + 1}`;
    const ejeId = agregar({ tipo: 'eje', nombre, posicion: String(e) });
    (delantero ? ['izq', 'der'] : ['izq-ext', 'izq-int', 'der-int', 'der-ext']).forEach((p) => agregar({ tipo: 'llanta', nombre: `Llanta ${p}`, padreId: ejeId, posicion: p }));
    ['izq', 'der'].forEach((p) => agregar({ tipo: 'freno', nombre: `Freno ${p}`, padreId: ejeId, posicion: p }));
  }
  return lista;
}

const llantasDe = (rol, ejes) => (rol === 'cabezal' ? 2 + 4 * (ejes - 1) : 4 * ejes);

// Crea el vehículo completo (y su tanquero si es cabezal), con dueños, km e intervalos. Va dentro de una transacción.
export async function crearVehiculo(tx, { cuentaId, usuarioId, datos: d, duenos = [] }) {
  const m = modeloPorId(d.modeloId);
  const comps = d.compartimentos || m.compartimentos;
  const tracto = m.tipo === 'tracto';
  const [vehiculo] = await tx.insert(unidades).values({
    cuentaId, rol: 'cabezal', tipo: m.tipo, placa: d.placa, marca: m.marca, modelo: m.modelo, anio: d.anio ?? m.anio,
    numEjes: m.ejes, numLlantas: llantasDe('cabezal', m.ejes),
    atributos: { modeloId: m.id, ...(d.motor ? { motor: d.motor } : {}), ...(tracto ? {} : { capacidad_galones: galones(comps) }) },
  }).returning();
  await tx.insert(componentes).values(arbolComponentes(vehiculo, tracto ? [] : comps));
  if (d.kmInicial !== undefined) await tx.insert(odometro).values({ unidadId: vehiculo.id, km: d.kmInicial, fuente: 'registro', registradoPor: usuarioId });
  await tx.insert(intervalos).values(m.intervalos.map((x) => ({
    unidadId: vehiculo.id, tarea: x.tarea, componente: x.componente, cadaKm: x.cada_km, cadaMeses: x.cada_meses, origen: m.id,
  })));
  const creadas = [vehiculo];
  if (tracto) {
    const [tanquero] = await tx.insert(unidades).values({
      cuentaId, rol: 'remolque', tipo: 'tanquero', placa: null, marca: 'Tanquero', modelo: `${galones(comps).toLocaleString('es-EC')} gal`,
      numEjes: m.ejesTanquero, numLlantas: llantasDe('remolque', m.ejesTanquero),
      atributos: { modeloId: m.id, capacidad_galones: galones(comps) },
    }).returning();
    await tx.insert(componentes).values(arbolComponentes(tanquero, comps));
    await tx.insert(acoplamientos).values({ cabezalId: vehiculo.id, remolqueId: tanquero.id, desde: hoy() });
    creadas.push(tanquero);
  }
  if (duenos.length) await tx.insert(propietarios).values(creadas.flatMap((u) => duenos.map((usuario) => ({ usuarioId: usuario, unidadId: u.id }))));
  await tx.insert(auditoria).values({ cuentaId, usuarioId, entidad: 'unidad', entidadId: vehiculo.id, accion: 'crear_vehiculo', datos: { placa: vehiculo.placa, modelo: m.id } });
  return vehiculo;
}

// Corrige los datos de una unidad (placa, año, motor, compartimentos, baja). Los compartimentos se reemplazan completos.
export async function editarUnidad(db, { usuarioId, unidad: u, cambios: d }) {
  return db.transaction(async (tx) => {
    const set = { actualizadoEn: new Date() };
    // El tanquero no lleva placa propia: se identifica por la de su cabezal
    if (d.placa !== undefined && u.rol !== 'cabezal') throw new ErrorHttp(400, 'El tanquero no lleva placa: se identifica por la de su cabezal');
    if (d.placa !== undefined) set.placa = d.placa;
    if (d.anio !== undefined) set.anio = d.anio;
    if (d.activa !== undefined) set.activa = d.activa;
    const atributos = { ...u.atributos };
    if (d.motor !== undefined) {
      if (u.rol !== 'cabezal') throw new ErrorHttp(400, 'El motor es del cabezal o camión');
      if (d.motor) atributos.motor = d.motor;
      else delete atributos.motor;
    }
    if (d.compartimentos) {
      const actuales = await tx.select().from(componentes).where(and(eq(componentes.unidadId, u.id), eq(componentes.tipo, 'compartimento'), eq(componentes.activo, true)));
      if (!actuales.length) throw new ErrorHttp(400, 'Esta unidad no lleva tanque: los compartimentos están en el tanquero');
      await tx.update(componentes).set({ activo: false }).where(inArray(componentes.id, actuales.map((c) => c.id)));
      await tx.insert(componentes).values(d.compartimentos.map((g, i) => ({
        unidadId: u.id, tipo: 'compartimento', nombre: `Compartimento ${i + 1}`, posicion: String(i), orden: 100 + i, capacidadGalones: g,
      })));
      atributos.capacidad_galones = galones(d.compartimentos);
      if (u.rol === 'remolque') set.modelo = `${galones(d.compartimentos).toLocaleString('es-EC')} gal`;
    }
    set.atributos = atributos;
    const [act] = await tx.update(unidades).set(set).where(eq(unidades.id, u.id)).returning();
    await tx.insert(auditoria).values({ cuentaId: u.cuentaId, usuarioId, entidad: 'unidad', entidadId: u.id, accion: 'editar_unidad', datos: d });
    return act;
  });
}

// Pone o corrige el km de un vehículo (queda registrado con su motivo)
export async function ponerKm(db, { usuarioId, unidad: u, km, motivo }) {
  if (u.rol !== 'cabezal') throw new ErrorHttp(400, 'El kilometraje se registra en el cabezal o camión');
  const anterior = await kmActual(db, u.id);
  const [l] = await db.insert(odometro).values({ unidadId: u.id, km, fuente: anterior === null ? 'registro' : 'correccion_dueno', registradoPor: usuarioId }).returning();
  await db.insert(auditoria).values({ cuentaId: u.cuentaId, usuarioId, entidad: 'unidad', entidadId: u.id, accion: 'corregir_km', datos: { antes: anterior, despues: km, motivo } });
  return l;
}
export const esquemaKm = z.object({ km: z.number().int().min(0).max(5_000_000), motivo: z.string().trim().min(3, 'Escribe el motivo del cambio').max(200) });

// Asigna (o quita, con null) el chofer de un vehículo. Un chofer maneja un vehículo a la vez; el tanquero va con su cabezal.
export async function asignarChofer(db, { usuarioId, unidad: u, choferId }) {
  if (u.rol !== 'cabezal') throw new ErrorHttp(400, 'El chofer se asigna al cabezal o camión; el tanquero va con él');
  let chofer = null;
  if (choferId) {
    [chofer] = await db.select().from(usuarios).where(and(eq(usuarios.id, choferId), eq(usuarios.cuentaId, u.cuentaId), eq(usuarios.rol, 'chofer'), eq(usuarios.activo, true)));
    if (!chofer) throw new ErrorHttp(404, 'Chofer no encontrado');
  }
  return db.transaction(async (tx) => {
    const ahora = new Date();
    await tx.update(asignaciones).set({ hasta: ahora }).where(and(eq(asignaciones.unidadId, u.id), isNull(asignaciones.hasta)));
    let asignacion = null;
    if (chofer) {
      await tx.update(asignaciones).set({ hasta: ahora }).where(and(eq(asignaciones.usuarioId, chofer.id), isNull(asignaciones.hasta)));
      [asignacion] = await tx.insert(asignaciones).values({ usuarioId: chofer.id, unidadId: u.id }).returning();
    }
    await tx.insert(auditoria).values({ cuentaId: u.cuentaId, usuarioId, entidad: 'unidad', entidadId: u.id, accion: 'asignar_chofer', datos: { choferId: chofer?.id ?? null } });
    return asignacion;
  });
}

// Engancha un tanquero a un cabezal (suelta lo que cada uno tuviera antes)
export async function enganchar(db, { usuarioId, cabezal, tanquero }) {
  if (cabezal.tipo !== 'tracto' || tanquero.rol !== 'remolque') throw new ErrorHttp(400, 'Se engancha un tanquero a un cabezal');
  return db.transaction(async (tx) => {
    await tx.update(acoplamientos).set({ hasta: hoy() }).where(and(or(eq(acoplamientos.cabezalId, cabezal.id), eq(acoplamientos.remolqueId, tanquero.id)), isNull(acoplamientos.hasta)));
    const [a] = await tx.insert(acoplamientos).values({ cabezalId: cabezal.id, remolqueId: tanquero.id, desde: hoy() }).returning();
    await tx.insert(auditoria).values({ cuentaId: cabezal.cuentaId, usuarioId, entidad: 'unidad', entidadId: cabezal.id, accion: 'enganchar', datos: { tanquero: tanquero.id } });
    return a;
  });
}

// ---------------------------------------------------------------- resumen para los paneles
// Vehículos listos para mostrar: datos, km, tanquero enganchado, compartimentos, chofer y dueños.
export async function resumenFlota(db, ids) {
  if (!ids.length) return { vehiculos: [], tanquerosSueltos: [] };
  const lista = await db.select().from(unidades).where(inArray(unidades.id, ids));
  const todos = lista.map((u) => u.id);
  const [comps, acoples, asigs, duenos, lecturas] = await Promise.all([
    db.select().from(componentes).where(and(inArray(componentes.unidadId, todos), eq(componentes.tipo, 'compartimento'), eq(componentes.activo, true))).orderBy(componentes.orden),
    db.select().from(acoplamientos).where(and(inArray(acoplamientos.cabezalId, todos), isNull(acoplamientos.hasta))),
    db.select({ unidadId: asignaciones.unidadId, id: usuarios.id, nombre: usuarios.nombre }).from(asignaciones)
      .innerJoin(usuarios, eq(asignaciones.usuarioId, usuarios.id)).where(and(inArray(asignaciones.unidadId, todos), isNull(asignaciones.hasta))),
    db.select({ unidadId: propietarios.unidadId, id: usuarios.id, nombre: usuarios.nombre }).from(propietarios)
      .innerJoin(usuarios, eq(propietarios.usuarioId, usuarios.id)).where(inArray(propietarios.unidadId, todos)),
    db.select().from(odometro).where(inArray(odometro.unidadId, todos)).orderBy(desc(odometro.registradoEn)),
  ]);
  const publica = (u) => u && ({ id: u.id, placa: u.placa, tipo: u.tipo, marca: u.marca, modelo: u.modelo, anio: u.anio, numEjes: u.numEjes, numLlantas: u.numLlantas, activa: u.activa, modeloId: u.atributos?.modeloId || null, motor: u.atributos?.motor || null });
  const galonesDe = (id) => comps.filter((c) => c.unidadId === id).map((c) => c.capacidadGalones);
  const enganchados = new Set(acoples.map((a) => a.remolqueId));
  const vehiculos = lista.filter((u) => u.rol === 'cabezal').map((u) => {
    const tanquero = lista.find((t) => t.id === acoples.find((a) => a.cabezalId === u.id)?.remolqueId) || null;
    const chofer = asigs.find((a) => a.unidadId === u.id);
    return {
      ...publica(u),
      km: lecturas.find((l) => l.unidadId === u.id)?.km ?? null,
      tanquero: publica(tanquero),
      compartimentos: galonesDe(u.tipo === 'tracto' ? tanquero?.id : u.id),
      chofer: chofer ? { id: chofer.id, nombre: chofer.nombre } : null,
      duenos: duenos.filter((d) => d.unidadId === u.id).map((d) => ({ id: d.id, nombre: d.nombre })),
    };
  }).sort((a, b) => String(a.placa).localeCompare(String(b.placa)));
  const tanquerosSueltos = lista.filter((u) => u.rol === 'remolque' && !enganchados.has(u.id)).map((u) => ({ ...publica(u), compartimentos: galonesDe(u.id) }));
  return { vehiculos, tanquerosSueltos };
}
