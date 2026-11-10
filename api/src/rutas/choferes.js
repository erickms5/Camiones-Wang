// El dueño registra a los choferes de su empresa; ellos entran con su correo y contraseña.
import { Router } from 'express';
import { z } from 'zod';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { asignaciones, auditoria, sesiones, unidades, usuarios } from '../db/esquema.js';
import { ErrorHttp } from '../app.js';
import { usuarioPublico, clave } from './auth.js';
import { hashClave } from '../seguridad.js';
import { idsAccesibles } from '../flota.js';
import { validarCedula, normalizarTelefono, validarNombre } from '../../../public/js/validaciones.js';

const conValidador = (fn) => z.string().transform((v, ctx) => {
  const r = fn(v);
  if (r.error) {
    ctx.addIssue({ code: 'custom', message: r.error });
    return z.NEVER;
  }
  return r.valor;
});

export function rutasChoferes({ db, seguridad, soloDueno }) {
  const r = Router();
  r.use(soloDueno);

  r.post('/', async (req, res) => {
    const d = z.object({
      nombre: conValidador(validarNombre),
      email: z.string().trim().toLowerCase().email('Escribe un correo válido'),
      cedula: conValidador(validarCedula),
      telefono: conValidador(normalizarTelefono).optional(),
      clave, // contraseña que el dueño le entrega al chofer
      consentimiento: z.literal(true, { errorMap: () => ({ message: 'Se necesita la autorización del chofer para guardar sus datos' }) }),
    }).parse(req.body);
    const cuentaId = req.usuario.cuentaId;
    const cedulaHash = seguridad.hashCedula(d.cedula);
    const [repetida] = await db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.cuentaId, cuentaId), eq(usuarios.cedulaHash, cedulaHash)));
    if (repetida) throw new ErrorHttp(409, 'Ya hay un chofer con esa cédula');
    const [u] = await db.insert(usuarios).values({
      cuentaId, email: d.email, nombre: d.nombre, rol: 'chofer', telefono: d.telefono, claveHash: hashClave(d.clave),
      cedulaCifrada: seguridad.cifrarCedula(d.cedula), cedulaHash, consentimientoEn: new Date(),
    }).returning();
    await db.insert(auditoria).values({ cuentaId, usuarioId: req.usuario.id, entidad: 'usuario', entidadId: u.id, accion: 'crear_chofer' });
    res.status(201).json({ chofer: usuarioPublico(u, seguridad) });
  });

  r.get('/', async (req, res) => {
    const lista = await db.select().from(usuarios).where(and(eq(usuarios.cuentaId, req.usuario.cuentaId), eq(usuarios.rol, 'chofer')));
    // Se muestra el vehículo que maneja cada chofer solo si es de este dueño
    const ids = await idsAccesibles(db, req.usuario);
    const asig = ids.length ? await db.select({ usuarioId: asignaciones.usuarioId, placa: unidades.placa }).from(asignaciones)
      .innerJoin(unidades, eq(asignaciones.unidadId, unidades.id))
      .where(and(inArray(unidades.id, ids), isNull(asignaciones.hasta))) : [];
    res.json({
      choferes: lista.map((u) => ({ ...usuarioPublico(u, seguridad), activo: u.activo, unidades: asig.filter((a) => a.usuarioId === u.id).map((a) => a.placa) })),
    });
  });

  r.patch('/:id', async (req, res) => {
    // Activar/desactivar o poner una contraseña nueva (si el chofer la olvidó)
    const d = z.object({ activo: z.boolean().optional(), clave: clave.optional() }).refine((x) => x.activo !== undefined || x.clave, 'Nada que cambiar').parse(req.body);
    const cambios = {};
    if (d.activo !== undefined) cambios.activo = d.activo;
    if (d.clave) Object.assign(cambios, { claveHash: hashClave(d.clave), intentosFallidos: 0, bloqueadoHasta: null });
    const [u] = await db.update(usuarios).set(cambios)
      .where(and(eq(usuarios.id, req.params.id), eq(usuarios.cuentaId, req.usuario.cuentaId), eq(usuarios.rol, 'chofer'))).returning();
    if (!u) throw new ErrorHttp(404, 'Chofer no encontrado');
    // Con contraseña nueva o desactivado, se cierran sus sesiones abiertas
    if (d.clave || d.activo === false) await db.delete(sesiones).where(eq(sesiones.usuarioId, u.id));
    await db.insert(auditoria).values({ cuentaId: req.usuario.cuentaId, usuarioId: req.usuario.id, entidad: 'usuario', entidadId: u.id, accion: d.clave ? 'cambiar_clave_chofer' : 'editar_chofer' });
    res.json({ chofer: usuarioPublico(u, seguridad) });
  });
  return r;
}
