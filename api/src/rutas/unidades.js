// Vehículos de la flota: consulta, alta desde el catálogo, km, enganche, chofer y fichas de llantas y frenos.
import { Router } from 'express';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { auditoria, componentes, intervalos, unidades } from '../db/esquema.js';
import { ErrorHttp } from '../app.js';
import {
  idsAccesibles, unidadAccesible, acopleActivo, kmActual, resumenFlota, crearVehiculo, esquemaVehiculo, ponerKm, esquemaKm, asignarChofer, enganchar,
} from '../flota.js';

export function rutasUnidades({ db, soloDueno }) {
  const r = Router();

  // Resumen de la flota del dueño: vehículos con km, tanquero, compartimentos, chofer y dueños
  r.get('/flota', soloDueno, async (req, res) => {
    const r = await resumenFlota(db, await idsAccesibles(db, req.usuario));
    // Los vehículos dados de baja por el administrador no aparecen en el panel del dueño
    res.json({ vehiculos: r.vehiculos.filter((v) => v.activa), tanquerosSueltos: r.tanquerosSueltos.filter((t) => t.activa) });
  });

  // El dueño agrega un vehículo eligiendo un modelo de la flota (queda como su dueño)
  r.post('/vehiculos', soloDueno, async (req, res) => {
    const d = esquemaVehiculo.parse(req.body);
    const v = await db.transaction((tx) => crearVehiculo(tx, { cuentaId: req.usuario.cuentaId, usuarioId: req.usuario.id, datos: d, duenos: [req.usuario.id] }));
    res.status(201).json({ vehiculo: v });
  });

  r.get('/unidades', async (req, res) => {
    const ids = await idsAccesibles(db, req.usuario);
    const lista = ids.length ? await db.select().from(unidades).where(and(inArray(unidades.id, ids), eq(unidades.activa, true))) : [];
    res.json({ unidades: lista });
  });

  r.get('/unidades/:id', async (req, res) => {
    const u = await unidadAccesible(db, req.usuario, req.params.id);
    const [partes, km, ints, acople] = await Promise.all([
      db.select().from(componentes).where(and(eq(componentes.unidadId, u.id), eq(componentes.activo, true))).orderBy(componentes.orden),
      kmActual(db, u.id),
      db.select().from(intervalos).where(eq(intervalos.unidadId, u.id)),
      acopleActivo(db, u.id),
    ]);
    res.json({ unidad: u, componentes: partes, km, intervalos: ints, acople });
  });

  // Solo el dueño pone o corrige el km de su vehículo (queda registrado con su motivo); el chofer no puede
  r.post('/unidades/:id/km', soloDueno, async (req, res) => {
    const u = await unidadAccesible(db, req.usuario, req.params.id);
    const d = esquemaKm.parse(req.body);
    res.status(201).json({ lectura: await ponerKm(db, { usuarioId: req.usuario.id, unidad: u, ...d }) });
  });

  r.post('/unidades/:id/acoplar', soloDueno, async (req, res) => {
    const cabezal = await unidadAccesible(db, req.usuario, req.params.id);
    const d = z.object({ remolqueId: z.string().uuid() }).parse(req.body);
    const tanquero = await unidadAccesible(db, req.usuario, d.remolqueId);
    res.status(201).json({ acople: await enganchar(db, { usuarioId: req.usuario.id, cabezal, tanquero }) });
  });

  // choferId vacío (null) = dejar el vehículo sin chofer
  r.post('/unidades/:id/asignar', soloDueno, async (req, res) => {
    const u = await unidadAccesible(db, req.usuario, req.params.id);
    const d = z.object({ choferId: z.string().uuid().nullable() }).parse(req.body);
    res.status(201).json({ asignacion: await asignarChofer(db, { usuarioId: req.usuario.id, unidad: u, choferId: d.choferId }) });
  });

  // Ficha de una llanta o freno (o cualquier parte): se combinan los datos nuevos con los anteriores
  r.patch('/unidades/componentes/:id', async (req, res) => {
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
