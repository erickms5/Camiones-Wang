// Ingreso con correo y contraseña. El dueño crea su cuenta; a los choferes los registra el dueño
// con una contraseña que les entrega (y que puede cambiar si la olvidan).
import { Router } from 'express';
import { z } from 'zod';
import { and, eq, ne, sql } from 'drizzle-orm';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { cuentas, sesiones, usuarios } from '../db/esquema.js';
import { ErrorHttp } from '../app.js';
import { mascaraCedula, hashClave, claveCorrecta } from '../seguridad.js';

const email = z.string().trim().toLowerCase().email('Escribe un correo válido');
export const clave = z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(100);
const DIAS_SESION = 30;
const MAX_FALLOS = 8; // intentos fallidos seguidos antes de pausar la cuenta
const PAUSA_MIN = 15;

export const usuarioPublico = (u, seguridad) => ({
  id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, telefono: u.telefono, cuentaId: u.cuentaId,
  cedula: u.cedulaCifrada ? mascaraCedula(seguridad.descifrarCedula(u.cedulaCifrada)) : null,
});

export function rutasAuth({ db, seguridad, autenticado, config }) {
  const r = Router();
  // Límite por correo + IP: frena a quien prueba contraseñas sin bloquear a la persona real desde su teléfono
  const porCorreo = rateLimit({
    windowMs: 15 * 60 * 1000, limit: config?.prod ? 10 : 1000, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (req) => `correo:${String(req.body?.email || '').trim().toLowerCase()}|${ipKeyGenerator(req.ip)}`,
    message: { error: 'Demasiados intentos. Espera unos minutos.' },
  });

  async function abrirSesion(u) {
    const token = seguridad.nuevoToken();
    await db.insert(sesiones).values({ usuarioId: u.id, tokenHash: seguridad.hashToken(token), expiraEn: new Date(Date.now() + DIAS_SESION * 86400000) });
    return { token, usuario: usuarioPublico(u, seguridad) };
  }

  // Registro del dueño: crea su cuenta y entra de una vez
  r.post('/registro', porCorreo, async (req, res) => {
    const d = z.object({ email, nombre: z.string().trim().min(3).max(80), nombreCuenta: z.string().trim().min(2).max(80).optional(), clave }).parse(req.body);
    const [existe] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, d.email));
    if (existe) throw new ErrorHttp(409, 'Ese correo ya tiene cuenta. Entra con tu contraseña.');
    const u = await db.transaction(async (tx) => {
      const [cuenta] = await tx.insert(cuentas).values({ nombre: d.nombreCuenta || d.nombre }).returning();
      const [nuevo] = await tx.insert(usuarios).values({ cuentaId: cuenta.id, email: d.email, nombre: d.nombre, rol: 'dueno', claveHash: hashClave(d.clave) }).returning();
      return nuevo;
    });
    res.status(201).json(await abrirSesion(u));
  });

  r.post('/entrar', porCorreo, async (req, res) => {
    const d = z.object({ email, clave: z.string().min(1, 'Escribe tu contraseña').max(100) }).parse(req.body);
    const [u] = await db.select().from(usuarios).where(and(eq(usuarios.email, d.email), eq(usuarios.activo, true)));
    // Contador por cuenta (no depende de la IP): tras varios fallos seguidos la cuenta se pausa unos minutos
    if (u?.bloqueadoHasta && u.bloqueadoHasta > new Date()) {
      throw new ErrorHttp(429, `Demasiados intentos fallidos. Espera ${PAUSA_MIN} minutos o pide al dueño una contraseña nueva.`);
    }
    // Mismo mensaje y mismo tiempo exista o no el correo
    if (!claveCorrecta(d.clave, u?.claveHash)) {
      if (u) {
        // Suma y pausa en una sola operación: intentos en paralelo no pueden saltarse el límite
        await db.update(usuarios).set({
          bloqueadoHasta: sql`CASE WHEN ${usuarios.intentosFallidos} + 1 >= ${MAX_FALLOS} THEN now() + make_interval(mins => ${PAUSA_MIN}) ELSE ${usuarios.bloqueadoHasta} END`,
          intentosFallidos: sql`CASE WHEN ${usuarios.intentosFallidos} + 1 >= ${MAX_FALLOS} THEN 0 ELSE ${usuarios.intentosFallidos} + 1 END`,
        }).where(eq(usuarios.id, u.id));
      }
      throw new ErrorHttp(401, 'Correo o contraseña incorrectos');
    }
    if (u.intentosFallidos || u.bloqueadoHasta) await db.update(usuarios).set({ intentosFallidos: 0, bloqueadoHasta: null }).where(eq(usuarios.id, u.id));
    res.json(await abrirSesion(u));
  });

  r.get('/yo', autenticado, (req, res) => res.json({ usuario: usuarioPublico(req.usuario, seguridad) }));

  // Cambiar la propia contraseña (con la actual)
  r.post('/clave', autenticado, async (req, res) => {
    const d = z.object({ actual: z.string().min(1).max(100), nueva: clave }).parse(req.body);
    if (!claveCorrecta(d.actual, req.usuario.claveHash)) throw new ErrorHttp(401, 'La contraseña actual no es correcta');
    await db.update(usuarios).set({ claveHash: hashClave(d.nueva) }).where(eq(usuarios.id, req.usuario.id));
    // Se cierran las demás sesiones (otros teléfonos); la actual sigue abierta
    const actual = seguridad.hashToken(req.get('authorization').slice(7));
    await db.delete(sesiones).where(and(eq(sesiones.usuarioId, req.usuario.id), ne(sesiones.tokenHash, actual)));
    res.json({ ok: true });
  });

  r.post('/salir', autenticado, async (req, res) => {
    const token = req.get('authorization').slice(7);
    await db.delete(sesiones).where(eq(sesiones.tokenHash, seguridad.hashToken(token)));
    res.json({ ok: true });
  });
  return r;
}
