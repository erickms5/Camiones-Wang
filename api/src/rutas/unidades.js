// Cabezales y remolques, su árbol de partes (ejes → llantas y frenos), km, acoples y fichas.
import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { acoplamientos, asignaciones, auditoria, componentes, intervalos, odometro, unidades, usuarios } from '../db/esquema.js';
import { ErrorHttp } from '../app.js';
import { normalizarPlaca } from '../../../public/js/validaciones.js';
import { buscarModelo, INTERVALOS_GENERICOS } from '../../../public/js/catalogo.js';

const placa = z.string().transform((v, ctx) => {
  const r = normalizarPlaca(v);
  if (r.error) {
    ctx.addIssue({ code: 'custom', message: r.error });
    return z.NEVER;
  }
  return r.valor;
});

// Unidades que el usuario puede ver: el dueño todas las de su cuenta; el chofer las que tiene asignadas.
export async function idsAccesibles(db, usuario) {
  if (usuario.rol === 'dueno') {
    return (await db.select({ id: unidades.id }).from(unidades).where(eq(unidades.cuentaId, usuario.cuentaId))).map((x) => x.id);
  }
  return (await db.select({ id: asignaciones.unidadId }).from(asignaciones)
    .where(and(eq(asignaciones.usuarioId, usuario.id), isNull(asignaciones.hasta)))).map((x) => x.id);
}

export async function unidadAccesible(db, usuario, id) {
  if (!z.string().uuid().safeParse(id).success) throw new ErrorHttp(404, 'Unidad no encontrada');
  const [u] = await db.select().from(unidades).where(and(eq(unidades.id, id), eq(unidades.cuentaId, usuario.cuentaId)));
  if (!u || !(await idsAccesibles(db, usuario)).includes(u.id)) throw new ErrorHttp(404, 'Unidad no encontrada');
  return u;
}

// Partes iniciales según el tipo: cada eje tiene sus llantas (sencillas adelante, dobles atrás) y sus frenos.
function arbolComponentes(u, compartimentos = []) {
  const lista = [];
  const agregar = (c) => {
    const id = randomUUID();
    lista.push({ id, unidadId: u.id, orden: lista.length, ...c });
    return id;
  };
  if (u.rol === 'cabezal') {
    agregar({ tipo: 'motor', nombre: 'Motor' });
    agregar({ tipo: 'transmision', nombre: 'Transmisión' });
    agregar({ tipo: 'quinta', nombre: 'Quinta rueda' });
  } else {
    agregar({ tipo: 'quinta', nombre: 'Perno rey' });
    if (u.tipo === 'tanquero') {
      agregar({ tipo: 'tanque', nombre: 'Tanque' });
      agregar({ tipo: 'valvulas', nombre: 'Válvulas' });
      compartimentos.forEach((g, i) => agregar({ tipo: 'compartimento', nombre: `Compartimento ${i + 1}`, capacidadGalones: g }));
    }
  }
  for (let e = 0; e < u.numEjes; e++) {
    const delantero = u.rol === 'cabezal' && e === 0;
    const nombre = u.rol === 'cabezal' ? (delantero ? 'Eje delantero' : `Eje trasero ${e}`) : `Eje ${e + 1}`;
    const ejeId = agregar({ tipo: 'eje', nombre, posicion: String(e) });
    (delantero ? ['izq', 'der'] : ['izq-ext', 'izq-int', 'der-int', 'der-ext']).forEach((p) => agregar({ tipo: 'llanta', nombre: `Llanta ${p}`, padreId: ejeId, posicion: p }));
    ['izq', 'der'].forEach((p) => agregar({ tipo: 'freno', nombre: `Freno ${p}`, padreId: ejeId, posicion: p }));
  }
  return lista;
}

const esquemaUnidad = z.object({
  id: z.string().uuid().optional(),
  rol: z.enum(['cabezal', 'remolque']),
  tipo: z.enum(['tracto', 'tanquero', 'plataforma', 'furgon', 'otro']),
  placa,
  marca: z.string().trim().min(2).max(40),
  modelo: z.string().trim().min(1).max(40),
  anio: z.number().int().min(1980).max(new Date().getFullYear() + 1).optional(),
  numEjes: z.number().int().min(1).max(9),
  numLlantas: z.number().int().min(2).max(40),
  atributos: z.record(z.any()).default({}),
  compartimentos: z.array(z.number().int().positive('Ingresa los galones de cada compartimento').max(50000)).min(1).max(10).optional(),
  // Punto de partida del kilometraje: solo se escribe al registrar; luego sube con los mantenimientos
  kmInicial: z.number().int().min(0).max(5_000_000).optional(),
}).superRefine((d, ctx) => {
  if (d.tipo === 'tanquero' && !d.compartimentos) ctx.addIssue({ code: 'custom', path: ['compartimentos'], message: 'Agrega al menos un compartimento' });
});

export function rutasUnidades({ db, soloDueno }) {
  const r = Router();

  r.get('/', async (req, res) => {
    const ids = await idsAccesibles(db, req.usuario);
    const lista = ids.length ? await db.select().from(unidades).where(and(inArray(unidades.id, ids), eq(unidades.activa, true))) : [];
    res.json({ unidades: lista });
  });

  r.post('/', async (req, res) => {
    const d = esquemaUnidad.parse(req.body);
    const u = await db.transaction(async (tx) => {
      const [nueva] = await tx.insert(unidades).values({
        id: d.id, cuentaId: req.usuario.cuentaId, rol: d.rol, tipo: d.tipo, placa: d.placa, marca: d.marca, modelo: d.modelo,
        anio: d.anio, numEjes: d.numEjes, numLlantas: d.numLlantas,
        atributos: { ...d.atributos, ...(d.compartimentos ? { capacidad_galones: d.compartimentos.reduce((a, b) => a + b, 0) } : {}) },
      }).returning();
      await tx.insert(componentes).values(arbolComponentes(nueva, d.compartimentos));
      if (d.rol === 'cabezal') {
        // El km puede quedar pendiente: el dueño lo pone después
        if (d.kmInicial !== undefined) await tx.insert(odometro).values({ unidadId: nueva.id, km: d.kmInicial, fuente: 'registro', registradoPor: req.usuario.id });
        const cat = buscarModelo(d.marca, d.modelo, d.anio);
        await tx.insert(intervalos).values((cat ? cat.intervalos : INTERVALOS_GENERICOS).map((x) => ({
          unidadId: nueva.id, tarea: x.tarea, componente: x.componente, cadaKm: x.cada_km, cadaMeses: x.cada_meses, origen: cat ? cat.id : 'generico',
        })));
      }
      // El chofer que registra su camión queda asignado a él
      if (req.usuario.rol === 'chofer') await tx.insert(asignaciones).values({ usuarioId: req.usuario.id, unidadId: nueva.id });
      await tx.insert(auditoria).values({ cuentaId: req.usuario.cuentaId, usuarioId: req.usuario.id, entidad: 'unidad', entidadId: nueva.id, accion: 'crear', datos: { placa: nueva.placa } });
      return nueva;
    });
    res.status(201).json({ unidad: u });
  });

  r.get('/:id', async (req, res) => {
    const u = await unidadAccesible(db, req.usuario, req.params.id);
    const [partes, km, ints, acople] = await Promise.all([
      db.select().from(componentes).where(and(eq(componentes.unidadId, u.id), eq(componentes.activo, true))).orderBy(componentes.orden),
      db.select().from(odometro).where(eq(odometro.unidadId, u.id)).orderBy(desc(odometro.registradoEn)).limit(1),
      db.select().from(intervalos).where(eq(intervalos.unidadId, u.id)),
      db.select().from(acoplamientos).where(and(or(eq(acoplamientos.cabezalId, u.id), eq(acoplamientos.remolqueId, u.id)), isNull(acoplamientos.hasta))),
    ]);
    res.json({ unidad: u, componentes: partes, km: km[0]?.km ?? null, intervalos: ints, acople: acople[0] || null });
  });

  // Solo el dueño pone o corrige el km del cabezal (queda registrado con su motivo); el chofer no puede
  r.post('/:id/km', soloDueno, async (req, res) => {
    const u = await unidadAccesible(db, req.usuario, req.params.id);
    if (u.rol !== 'cabezal') throw new ErrorHttp(400, 'El kilometraje se registra en el cabezal');
    const d = z.object({ km: z.number().int().min(0).max(5_000_000), motivo: z.string().trim().min(3, 'Escribe el motivo del cambio').max(200) }).parse(req.body);
    const [anterior] = await db.select().from(odometro).where(eq(odometro.unidadId, u.id)).orderBy(desc(odometro.registradoEn)).limit(1);
    const [l] = await db.insert(odometro).values({ unidadId: u.id, km: d.km, fuente: anterior ? 'correccion_dueno' : 'registro', registradoPor: req.usuario.id }).returning();
    await db.insert(auditoria).values({ cuentaId: req.usuario.cuentaId, usuarioId: req.usuario.id, entidad: 'unidad', entidadId: u.id, accion: 'corregir_km', datos: { antes: anterior?.km ?? null, despues: d.km, motivo: d.motivo } });
    res.status(201).json({ lectura: l });
  });

  r.post('/:id/acoplar', soloDueno, async (req, res) => {
    const cab = await unidadAccesible(db, req.usuario, req.params.id);
    const d = z.object({ remolqueId: z.string().uuid(), desde: z.string().date().optional() }).parse(req.body);
    const rem = await unidadAccesible(db, req.usuario, d.remolqueId);
    if (cab.rol !== 'cabezal' || rem.rol !== 'remolque') throw new ErrorHttp(400, 'Se engancha un remolque a un cabezal');
    const hoy = new Date().toISOString().slice(0, 10);
    await db.update(acoplamientos).set({ hasta: hoy }).where(and(or(eq(acoplamientos.cabezalId, cab.id), eq(acoplamientos.remolqueId, rem.id)), isNull(acoplamientos.hasta)));
    const [a] = await db.insert(acoplamientos).values({ cabezalId: cab.id, remolqueId: rem.id, desde: d.desde || hoy }).returning();
    res.status(201).json({ acople: a });
  });

  r.post('/:id/asignar', soloDueno, async (req, res) => {
    const u = await unidadAccesible(db, req.usuario, req.params.id);
    const d = z.object({ choferId: z.string().uuid() }).parse(req.body);
    const [chofer] = await db.select().from(usuarios).where(and(eq(usuarios.id, d.choferId), eq(usuarios.cuentaId, req.usuario.cuentaId), eq(usuarios.rol, 'chofer')));
    if (!chofer) throw new ErrorHttp(404, 'Chofer no encontrado');
    await db.update(asignaciones).set({ hasta: new Date() }).where(and(eq(asignaciones.unidadId, u.id), isNull(asignaciones.hasta)));
    const [a] = await db.insert(asignaciones).values({ usuarioId: chofer.id, unidadId: u.id }).returning();
    res.status(201).json({ asignacion: a });
  });

  // Ficha de una llanta o freno (o cualquier parte): se combinan los datos nuevos con los anteriores
  r.patch('/componentes/:id', async (req, res) => {
    const d = z.object({ detalles: z.record(z.union([z.string().max(200), z.number(), z.null()])) }).parse(req.body);
    if (!z.string().uuid().safeParse(req.params.id).success) throw new ErrorHttp(404, 'Parte no encontrada');
    const [c] = await db.select().from(componentes).where(eq(componentes.id, req.params.id));
    if (!c) throw new ErrorHttp(404, 'Parte no encontrada');
    await unidadAccesible(db, req.usuario, c.unidadId);
    const [act] = await db.update(componentes).set({ detalles: { ...c.detalles, ...d.detalles }, actualizadoEn: new Date() }).where(eq(componentes.id, c.id)).returning();
    await db.insert(auditoria).values({ cuentaId: req.usuario.cuentaId, usuarioId: req.usuario.id, entidad: 'componente', entidadId: c.id, accion: 'editar_ficha', datos: d.detalles });
    res.json({ componente: act });
  });
  return r;
}
