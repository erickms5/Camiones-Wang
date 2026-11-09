// Ingreso por email con código de 6 dígitos. El dueño crea su cuenta; a los choferes los registra el dueño.
import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { and, count, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { rateLimit } from 'express-rate-limit';
import { codigosAcceso, cuentas, sesiones, usuarios } from '../db/esquema.js';
import { ErrorHttp } from '../app.js';
import { mascaraCedula } from '../seguridad.js';

const email = z.string().trim().toLowerCase().email('Escribe un correo válido');
const DIAS_SESION = 30;
const MAX_INTENTOS = 5;
const MAX_CODIGOS_HORA = 5;

export const usuarioPublico = (u, seguridad) => ({
  id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, telefono: u.telefono, cuentaId: u.cuentaId,
  cedula: u.cedulaCifrada ? mascaraCedula(seguridad.descifrarCedula(u.cedulaCifrada)) : null,
});

export function rutasAuth({ db, seguridad, correo, autenticado, config }) {
  const r = Router();
  // Además del límite por IP: límite por correo (frena ataques repartidos entre muchas IP)
  const porCorreo = rateLimit({
    windowMs: 15 * 60 * 1000, limit: config?.prod ? 10 : 1000, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (req) => `correo:${String(req.body?.email || '').trim().toLowerCase()}`,
    message: { error: 'Demasiados intentos. Espera unos minutos.' },
  });

  async function enviarCodigo(correoDestino) {
    // Máximo de códigos por hora para un mismo correo
    const [{ n }] = await db.select({ n: count() }).from(codigosAcceso)
      .where(and(eq(codigosAcceso.email, correoDestino), gt(codigosAcceso.creadoEn, new Date(Date.now() - 3600_000))));
    if (n >= MAX_CODIGOS_HORA) return;
    // Un código nuevo anula los anteriores
    await db.update(codigosAcceso).set({ usado: true }).where(and(eq(codigosAcceso.email, correoDestino), eq(codigosAcceso.usado, false)));
    const codigo = seguridad.nuevoCodigo();
    await db.insert(codigosAcceso).values({ email: correoDestino, codigoHash: seguridad.hashCodigo(correoDestino, codigo), expiraEn: new Date(Date.now() + 10 * 60 * 1000) });
    await correo.enviarCodigo(correoDestino, codigo);
  }

  // Registro del dueño: crea su cuenta y le envía el código
  r.post('/registro', async (req, res) => {
    const d = z.object({ email, nombre: z.string().trim().min(3).max(80), nombreCuenta: z.string().trim().min(2).max(80).optional() }).parse(req.body);
    const [existe] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, d.email));
    if (existe) throw new ErrorHttp(409, 'Ese correo ya tiene cuenta. Pide un código para entrar.');
    const [cuenta] = await db.insert(cuentas).values({ nombre: d.nombreCuenta || d.nombre }).returning();
    await db.insert(usuarios).values({ cuentaId: cuenta.id, email: d.email, nombre: d.nombre, rol: 'dueno' });
    await enviarCodigo(d.email);
    res.status(201).json({ ok: true, mensaje: 'Te enviamos un código a tu correo' });
  });

  // Pedir código. Responde igual exista o no el correo (no revela quién está registrado).
  r.post('/codigo', porCorreo, async (req, res) => {
    const d = z.object({ email }).parse(req.body);
    const [u] = await db.select().from(usuarios).where(and(eq(usuarios.email, d.email), eq(usuarios.activo, true)));
    if (u) await enviarCodigo(d.email);
    res.json({ ok: true, mensaje: 'Si el correo está registrado, te llegará un código' });
  });

  r.post('/verificar', porCorreo, async (req, res) => {
    const d = z.object({ email, codigo: z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 números') }).parse(req.body);
    const [vigente] = await db.select({ id: codigosAcceso.id }).from(codigosAcceso)
      .where(and(eq(codigosAcceso.email, d.email), eq(codigosAcceso.usado, false), gt(codigosAcceso.expiraEn, new Date())))
      .orderBy(desc(codigosAcceso.creadoEn)).limit(1);
    // El intento se cuenta y se comprueba en una sola operación: intentos en paralelo no pasan del máximo
    const [c] = vigente
      ? await db.update(codigosAcceso).set({ intentos: sql`${codigosAcceso.intentos} + 1` })
        .where(and(eq(codigosAcceso.id, vigente.id), eq(codigosAcceso.usado, false), lt(codigosAcceso.intentos, MAX_INTENTOS))).returning()
      : [];
    if (!c) throw new ErrorHttp(401, 'El código venció o no es válido. Pide uno nuevo.');
    const esperado = Buffer.from(c.codigoHash);
    const recibido = Buffer.from(seguridad.hashCodigo(d.email, d.codigo));
    if (esperado.length !== recibido.length || !crypto.timingSafeEqual(esperado, recibido)) throw new ErrorHttp(401, 'Código incorrecto');
    // Se marca usado solo si nadie lo usó antes (dos verificaciones simultáneas no abren dos sesiones)
    const [marcado] = await db.update(codigosAcceso).set({ usado: true })
      .where(and(eq(codigosAcceso.id, c.id), eq(codigosAcceso.usado, false))).returning({ id: codigosAcceso.id });
    if (!marcado) throw new ErrorHttp(401, 'El código ya fue usado. Pide uno nuevo.');
    const [u] = await db.select().from(usuarios).where(and(eq(usuarios.email, d.email), eq(usuarios.activo, true)));
    if (!u) throw new ErrorHttp(401, 'Cuenta no disponible');
    const token = seguridad.nuevoToken();
    await db.insert(sesiones).values({ usuarioId: u.id, tokenHash: seguridad.hashToken(token), expiraEn: new Date(Date.now() + DIAS_SESION * 86400000) });
    res.json({ token, usuario: usuarioPublico(u, seguridad) });
  });

  r.get('/yo', autenticado, (req, res) => res.json({ usuario: usuarioPublico(req.usuario, seguridad) }));

  r.post('/salir', autenticado, async (req, res) => {
    const token = req.get('authorization').slice(7);
    await db.delete(sesiones).where(eq(sesiones.tokenHash, seguridad.hashToken(token)));
    res.json({ ok: true });
  });
  return r;
}
