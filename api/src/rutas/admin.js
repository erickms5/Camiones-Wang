// Administrador: crea las empresas con sus dueños, registra y corrige vehículos, y decide de quién es cada uno.
// No ve mantenimientos, facturas ni reportes de las empresas: solo lo necesario para dar soporte.
import { Router } from 'express';
import { z } from 'zod';
import { and, count, eq, inArray, ne } from 'drizzle-orm';
import { auditoria, cuentas, propietarios, sesiones, unidades, usuarios } from '../db/esquema.js';
import { ErrorHttp } from '../app.js';
import { email, clave, claveDueno } from './auth.js';
import { hashClave } from '../seguridad.js';
import { validarNombre } from '../../../public/js/validaciones.js';
import { acopleActivo, asignarChofer, crearVehiculo, editarUnidad, enganchar, esquemaEdicion, esquemaKm, esquemaVehiculo, ponerKm, resumenFlota } from '../flota.js';

const nombre = z.string().transform((v, ctx) => {
  const r = validarNombre(v);
  if (r.error) {
    ctx.addIssue({ code: 'custom', message: r.error });
    return z.NEVER;
  }
  return r.valor;
});
const esquemaDueno = z.object({ nombre, email, clave: claveDueno, telefono: z.string().trim().max(20).optional() });
const uuid = z.string().uuid();

export function rutasAdmin({ db }) {
  const r = Router();
  const auditar = (req, cuentaId, entidad, entidadId, accion, datos) =>
    db.insert(auditoria).values({ cuentaId, usuarioId: req.usuario.id, entidad, entidadId, accion: `admin_${accion}`, datos });

  async function cuentaDe(id) {
    const [c] = uuid.safeParse(id).success ? await db.select().from(cuentas).where(eq(cuentas.id, id)) : [];
    if (!c) throw new ErrorHttp(404, 'Empresa no encontrada');
    return c;
  }
  async function unidadDe(id) {
    const [u] = uuid.safeParse(id).success ? await db.select().from(unidades).where(eq(unidades.id, id)) : [];
    if (!u) throw new ErrorHttp(404, 'Unidad no encontrada');
    return u;
  }
  const persona = (u) => ({ id: u.id, nombre: u.nombre, email: u.email, telefono: u.telefono, rol: u.rol, activo: u.activo });
  // Los dueños indicados deben ser dueños activos de esa misma empresa
  async function duenosValidos(cuentaId, ids) {
    if (!ids.length) return [];
    const lista = await db.select({ id: usuarios.id }).from(usuarios)
      .where(and(inArray(usuarios.id, ids), eq(usuarios.cuentaId, cuentaId), eq(usuarios.rol, 'dueno')));
    if (lista.length !== new Set(ids).size) throw new ErrorHttp(400, 'Algún dueño no pertenece a esta empresa');
    return lista.map((x) => x.id);
  }

  // ---------------------------------------------------------------- empresas
  r.get('/cuentas', async (_req, res) => {
    const [lista, porRol, vehiculos] = await Promise.all([
      db.select().from(cuentas).orderBy(cuentas.nombre),
      db.select({ cuentaId: usuarios.cuentaId, rol: usuarios.rol, n: count() }).from(usuarios).groupBy(usuarios.cuentaId, usuarios.rol),
      db.select({ cuentaId: unidades.cuentaId, n: count() }).from(unidades).where(and(eq(unidades.rol, 'cabezal'), eq(unidades.activa, true))).groupBy(unidades.cuentaId),
    ]);
    const n = (c, rol) => porRol.find((x) => x.cuentaId === c.id && x.rol === rol)?.n ?? 0;
    res.json({ cuentas: lista.map((c) => ({ id: c.id, nombre: c.nombre, creadoEn: c.creadoEn, duenos: n(c, 'dueno'), choferes: n(c, 'chofer'), vehiculos: vehiculos.find((v) => v.cuentaId === c.id)?.n ?? 0 })) });
  });

  // Empresa nueva con su primer dueño. No toca nada de las demás empresas.
  r.post('/cuentas', async (req, res) => {
    const d = z.object({ nombre: z.string().trim().min(2).max(80), dueno: esquemaDueno }).parse(req.body);
    const [existe] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, d.dueno.email));
    if (existe) throw new ErrorHttp(409, 'Ese correo ya está registrado');
    const cuenta = await db.transaction(async (tx) => {
      const [c] = await tx.insert(cuentas).values({ nombre: d.nombre }).returning();
      const [u] = await tx.insert(usuarios).values({ cuentaId: c.id, email: d.dueno.email, nombre: d.dueno.nombre, telefono: d.dueno.telefono, rol: 'dueno', claveHash: hashClave(d.dueno.clave) }).returning();
      await tx.insert(auditoria).values({ cuentaId: c.id, usuarioId: req.usuario.id, entidad: 'cuenta', entidadId: c.id, accion: 'admin_crear_empresa', datos: { dueno: u.id } });
      return c;
    });
    res.status(201).json({ cuenta });
  });

  r.get('/cuentas/:id', async (req, res) => {
    const c = await cuentaDe(req.params.id);
    const [personas, ids] = await Promise.all([
      db.select().from(usuarios).where(and(eq(usuarios.cuentaId, c.id), ne(usuarios.rol, 'admin'))).orderBy(usuarios.nombre),
      db.select({ id: unidades.id }).from(unidades).where(eq(unidades.cuentaId, c.id)),
    ]);
    res.json({
      cuenta: c,
      duenos: personas.filter((u) => u.rol === 'dueno').map(persona),
      choferes: personas.filter((u) => u.rol === 'chofer').map(persona),
      ...(await resumenFlota(db, ids.map((x) => x.id))),
    });
  });

  r.patch('/cuentas/:id', async (req, res) => {
    const c = await cuentaDe(req.params.id);
    const d = z.object({ nombre: z.string().trim().min(2).max(80) }).parse(req.body);
    const [act] = await db.update(cuentas).set(d).where(eq(cuentas.id, c.id)).returning();
    await auditar(req, c.id, 'cuenta', c.id, 'editar_empresa', d);
    res.json({ cuenta: act });
  });

  // ---------------------------------------------------------------- personas
  // Otro dueño para la misma empresa (un vehículo puede tener varios dueños)
  r.post('/cuentas/:id/duenos', async (req, res) => {
    const c = await cuentaDe(req.params.id);
    const d = esquemaDueno.parse(req.body);
    const [u] = await db.insert(usuarios).values({ cuentaId: c.id, email: d.email, nombre: d.nombre, telefono: d.telefono, rol: 'dueno', claveHash: hashClave(d.clave) }).returning();
    await auditar(req, c.id, 'usuario', u.id, 'crear_dueno');
    res.status(201).json({ dueno: persona(u) });
  });

  // Corregir datos, activar/desactivar o poner contraseña nueva a un dueño o chofer
  r.patch('/usuarios/:id', async (req, res) => {
    const d = z.object({ nombre: nombre.optional(), email: email.optional(), activo: z.boolean().optional(), clave: clave.optional() })
      .refine((x) => Object.keys(x).length > 0, 'Nada que cambiar').parse(req.body);
    const [u] = uuid.safeParse(req.params.id).success ? await db.select().from(usuarios).where(and(eq(usuarios.id, req.params.id), ne(usuarios.rol, 'admin'))) : [];
    if (!u) throw new ErrorHttp(404, 'Persona no encontrada');
    if (d.clave && u.rol === 'dueno') claveDueno.parse(d.clave);
    const cambios = {};
    if (d.nombre) cambios.nombre = d.nombre;
    if (d.email) cambios.email = d.email;
    if (d.activo !== undefined) cambios.activo = d.activo;
    if (d.clave) Object.assign(cambios, { claveHash: hashClave(d.clave), intentosFallidos: 0, bloqueadoHasta: null });
    const [act] = await db.update(usuarios).set(cambios).where(eq(usuarios.id, u.id)).returning();
    // Con contraseña nueva o desactivado, se cierran sus sesiones abiertas
    if (d.clave || d.activo === false) await db.delete(sesiones).where(eq(sesiones.usuarioId, u.id));
    await auditar(req, u.cuentaId, 'usuario', u.id, d.clave ? 'cambiar_clave' : 'editar_usuario', { ...d, clave: undefined });
    res.json({ usuario: persona(act) });
  });

  // ---------------------------------------------------------------- vehículos
  r.post('/cuentas/:id/vehiculos', async (req, res) => {
    const c = await cuentaDe(req.params.id);
    const d = esquemaVehiculo.extend({ duenos: z.array(uuid).max(20).default([]) }).parse(req.body);
    const duenos = await duenosValidos(c.id, d.duenos);
    const v = await db.transaction((tx) => crearVehiculo(tx, { cuentaId: c.id, usuarioId: req.usuario.id, datos: d, duenos }));
    res.status(201).json({ vehiculo: v });
  });

  // Corregir un vehículo mal registrado (placa, año, motor, compartimentos) o darlo de baja
  r.patch('/unidades/:id', async (req, res) => {
    const u = await unidadDe(req.params.id);
    const d = esquemaEdicion.parse(req.body);
    res.json({ unidad: await editarUnidad(db, { usuarioId: req.usuario.id, unidad: u, cambios: d }) });
  });

  // Dueños de un vehículo (reemplaza la lista). El tanquero enganchado queda con los mismos dueños.
  r.put('/unidades/:id/propietarios', async (req, res) => {
    const u = await unidadDe(req.params.id);
    const d = z.object({ duenos: z.array(uuid).max(20) }).parse(req.body);
    const duenos = await duenosValidos(u.cuentaId, d.duenos);
    const acople = u.rol === 'cabezal' ? await acopleActivo(db, u.id) : null;
    const ids = [u.id, acople?.remolqueId].filter(Boolean);
    await db.transaction(async (tx) => {
      await tx.delete(propietarios).where(inArray(propietarios.unidadId, ids));
      if (duenos.length) await tx.insert(propietarios).values(ids.flatMap((unidadId) => duenos.map((usuarioId) => ({ usuarioId, unidadId }))));
      await tx.insert(auditoria).values({ cuentaId: u.cuentaId, usuarioId: req.usuario.id, entidad: 'unidad', entidadId: u.id, accion: 'admin_duenos', datos: { duenos } });
    });
    res.json({ duenos });
  });

  r.post('/unidades/:id/km', async (req, res) => {
    const u = await unidadDe(req.params.id);
    const d = esquemaKm.parse(req.body);
    res.status(201).json({ lectura: await ponerKm(db, { usuarioId: req.usuario.id, unidad: u, ...d }) });
  });

  r.post('/unidades/:id/asignar', async (req, res) => {
    const u = await unidadDe(req.params.id);
    const d = z.object({ choferId: uuid.nullable() }).parse(req.body);
    res.status(201).json({ asignacion: await asignarChofer(db, { usuarioId: req.usuario.id, unidad: u, choferId: d.choferId }) });
  });

  r.post('/unidades/:id/acoplar', async (req, res) => {
    const cabezal = await unidadDe(req.params.id);
    const tanquero = await unidadDe(z.object({ remolqueId: uuid }).parse(req.body).remolqueId);
    if (tanquero.cuentaId !== cabezal.cuentaId) throw new ErrorHttp(400, 'El tanquero es de otra empresa');
    res.status(201).json({ acople: await enganchar(db, { usuarioId: req.usuario.id, cabezal, tanquero }) });
  });
  return r;
}
