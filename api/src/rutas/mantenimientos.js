// Mantenimientos y sus evidencias (fotos o PDF de facturas con fecha y hora de subida).
import express, { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { acoplamientos, auditoria, evidencias, mantenimientos, odometro, unidades } from '../db/esquema.js';
import { ErrorHttp } from '../app.js';
import { sha256 } from '../seguridad.js';
import { unidadAccesible } from './unidades.js';

const dinero = z.number().min(0).max(1_000_000).default(0);
const texto = (max) => z.string().trim().max(max).optional();
const TIPOS_ARCHIVO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

const esquemaMantenimiento = z.object({
  id: z.string().uuid().optional(),
  unidadId: z.string().uuid().optional(),
  fecha: z.string().date().refine((f) => f <= new Date().toISOString().slice(0, 10), 'La fecha no puede ser futura'),
  km: z.number().int().min(0).max(5_000_000),
  parte: z.string().trim().min(2).max(120),
  trabajo: z.string().trim().min(2).max(120),
  provincia: texto(60), canton: texto(60),
  taller: texto(120), costoTaller: dinero,
  proveedor: texto(120), costoRepuestos: dinero, repuestosDetalle: texto(500),
  notas: texto(500),
});

// Mantenimientos visibles: el dueño ve todos los de su cuenta; el chofer solo los suyos.
function filtroVisible(usuario) {
  const base = eq(mantenimientos.cuentaId, usuario.cuentaId);
  return usuario.rol === 'dueno' ? base : and(base, eq(mantenimientos.creadoPor, usuario.id));
}

async function mantenimientoVisible(db, usuario, id) {
  if (!z.string().uuid().safeParse(id).success) throw new ErrorHttp(404, 'Mantenimiento no encontrado');
  const [m] = await db.select().from(mantenimientos).where(and(eq(mantenimientos.id, id), filtroVisible(usuario)));
  if (!m) throw new ErrorHttp(404, 'Mantenimiento no encontrado');
  return m;
}

// El kilometraje no se edita a mano: parte del valor del registro y solo sube con el km de cada mantenimiento.
// Si el trabajo es del remolque, cuenta el km del cabezal enganchado (el odómetro está en el cabezal).
const SALTO_MAXIMO_KM = 60_000; // más que esto entre un mantenimiento y otro es casi seguro un error de tipeo

async function cabezalDe(db, usuario, unidadId) {
  const [u] = await db.select().from(unidades).where(eq(unidades.id, unidadId));
  let cabezalId = u?.rol === 'cabezal' ? u.id : null;
  if (u?.rol === 'remolque') {
    const [a] = await db.select().from(acoplamientos).where(and(eq(acoplamientos.remolqueId, u.id), isNull(acoplamientos.hasta)));
    cabezalId = a?.cabezalId || null;
  }
  if (!cabezalId) return null;
  // Solo se toca el km de un cabezal al que la persona tiene acceso
  try {
    await unidadAccesible(db, usuario, cabezalId);
  } catch {
    return null;
  }
  const [ultimo] = await db.select().from(odometro).where(eq(odometro.unidadId, cabezalId)).orderBy(desc(odometro.registradoEn)).limit(1);
  return { cabezalId, kmActual: ultimo?.km ?? null }; // null: el dueño aún no pone el km
}

async function actualizarKm(db, usuario, cab, km, mantenimientoId) {
  if (!cab || (cab.kmActual !== null && km <= cab.kmActual)) return;
  await db.insert(odometro).values({ unidadId: cab.cabezalId, km, fuente: `mantenimiento:${mantenimientoId}`, registradoPor: usuario.id });
}

export function rutasMantenimientos({ db, almacen }) {
  const r = Router();

  r.post('/mantenimientos', async (req, res) => {
    const d = esquemaMantenimiento.parse(req.body);
    if (d.unidadId) await unidadAccesible(db, req.usuario, d.unidadId);
    // El km no se puede editar después: se rechazan saltos imposibles para no dañarlo con un error de tipeo
    const cab = d.unidadId ? await cabezalDe(db, req.usuario, d.unidadId) : null;
    if (cab && cab.kmActual !== null && d.km > cab.kmActual + SALTO_MAXIMO_KM) {
      throw new ErrorHttp(400, `El kilometraje ${d.km.toLocaleString('es-EC')} es ${(d.km - cab.kmActual).toLocaleString('es-EC')} km mayor al actual (${cab.kmActual.toLocaleString('es-EC')}). Revisa que esté bien escrito.`);
    }
    // Reintento desde el teléfono (mismo id): se devuelve lo ya guardado sin duplicar
    if (d.id) {
      const [ya] = await db.select().from(mantenimientos).where(eq(mantenimientos.id, d.id));
      if (ya) {
        if (ya.cuentaId !== req.usuario.cuentaId) throw new ErrorHttp(409, 'Identificador en uso');
        return res.json({ mantenimiento: ya, repetido: true });
      }
    }
    const [m] = await db.insert(mantenimientos).values({
      ...d, costoTaller: d.costoTaller.toFixed(2), costoRepuestos: d.costoRepuestos.toFixed(2),
      cuentaId: req.usuario.cuentaId, creadoPor: req.usuario.id,
    }).returning();
    await actualizarKm(db, req.usuario, cab, d.km, m.id);
    await db.insert(auditoria).values({ cuentaId: req.usuario.cuentaId, usuarioId: req.usuario.id, entidad: 'mantenimiento', entidadId: m.id, accion: 'crear' });
    res.status(201).json({ mantenimiento: m });
  });

  r.get('/mantenimientos', async (req, res) => {
    const q = z.object({ desde: z.string().date().optional(), hasta: z.string().date().optional(), chofer: z.string().uuid().optional() }).parse(req.query);
    const cond = [filtroVisible(req.usuario)];
    if (q.desde) cond.push(gte(mantenimientos.fecha, q.desde));
    if (q.hasta) cond.push(lte(mantenimientos.fecha, q.hasta));
    if (q.chofer && req.usuario.rol === 'dueno') cond.push(eq(mantenimientos.creadoPor, q.chofer));
    const lista = await db.select().from(mantenimientos).where(and(...cond)).orderBy(desc(mantenimientos.fecha));
    res.json({ mantenimientos: lista });
  });

  r.get('/mantenimientos/:id', async (req, res) => {
    const m = await mantenimientoVisible(db, req.usuario, req.params.id);
    const ev = await db.select().from(evidencias).where(eq(evidencias.mantenimientoId, m.id));
    res.json({ mantenimiento: m, evidencias: ev });
  });

  // 1) Registrar la evidencia; 2) subir el archivo. Si el mantenimiento ya está en un reporte, solo como anexo posterior.
  r.post('/mantenimientos/:id/evidencias', async (req, res) => {
    const m = await mantenimientoVisible(db, req.usuario, req.params.id);
    const d = z.object({
      categoria: z.string().trim().min(2).max(80),
      nombreArchivo: z.string().trim().min(1).max(200),
      mime: z.enum(TIPOS_ARCHIVO, { errorMap: () => ({ message: 'Solo fotos (JPG, PNG, WEBP, HEIC) o PDF' }) }),
    }).parse(req.body);
    const [ev] = await db.insert(evidencias).values({ ...d, mantenimientoId: m.id, anexoPosterior: m.bloqueado, subidoPor: req.usuario.id }).returning();
    res.status(201).json({ evidencia: ev, subirA: `/evidencias/${ev.id}/archivo` });
  });

  r.put('/evidencias/:id/archivo', express.raw({ type: TIPOS_ARCHIVO, limit: '10mb' }), async (req, res) => {
    const ev = await evidenciaVisible(req);
    if (ev.subidoEn) throw new ErrorHttp(409, 'Este archivo ya fue subido; agrega otro como anexo');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new ErrorHttp(400, 'Envía el archivo con su tipo (Content-Type)');
    if (req.get('content-type') !== ev.mime) throw new ErrorHttp(400, 'El tipo de archivo no coincide');
    const clave = `${req.usuario.cuentaId}/${ev.id}`;
    await almacen.guardar(clave, req.body);
    const [act] = await db.update(evidencias).set({ claveAlmacen: clave, sha256: sha256(req.body), tamano: req.body.length, subidoEn: new Date() })
      .where(eq(evidencias.id, ev.id)).returning();
    res.json({ evidencia: act });
  });

  r.get('/evidencias/:id/archivo', async (req, res) => {
    const ev = await evidenciaVisible(req);
    if (!ev.claveAlmacen) throw new ErrorHttp(404, 'Archivo aún no subido');
    res.type(ev.mime).set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(ev.nombreArchivo)}`).send(await almacen.leer(ev.claveAlmacen));
  });

  async function evidenciaVisible(req) {
    if (!z.string().uuid().safeParse(req.params.id).success) throw new ErrorHttp(404, 'Evidencia no encontrada');
    const [fila] = await db.select({ ev: evidencias }).from(evidencias)
      .innerJoin(mantenimientos, eq(evidencias.mantenimientoId, mantenimientos.id))
      .where(and(eq(evidencias.id, req.params.id), filtroVisible(req.usuario)));
    if (!fila) throw new ErrorHttp(404, 'Evidencia no encontrada');
    return fila.ev;
  }
  return r;
}
