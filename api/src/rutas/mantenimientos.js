// Mantenimientos y sus evidencias (fotos o PDF de facturas con fecha y hora de subida).
import express, { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { acoplamientos, auditoria, componentes, evidencias, mantenimientoTrabajos, mantenimientos, odometro, viajes } from '../db/esquema.js';
import { ErrorHttp } from '../app.js';
import { sha256 } from '../seguridad.js';
import { idsAccesibles, unidadAccesible, vehiculoDe, kmActual } from '../flota.js';
import { filtroViajes } from './viajes.js';
import { hoyEcuador } from '../../../public/js/viajes-logica.js';
import { GRUPOS, TRABAJO_ANTERIOR, TRABAJO_OTRO, grupoPorNombre, partesDeVisita, resumenTrabajos, trabajosDeRegistro, visitaIncluye } from '../../../public/js/catalogo-trabajos.js';

const dinero = z.number().min(0).max(1_000_000).default(0);
const texto = (max) => z.string().trim().max(max).optional();
const FORMAS_PAGO = ['efectivo', 'transferencia', 'cheque', 'credito'];
const formaPago = z.enum(FORMAS_PAGO, { errorMap: () => ({ message: 'Forma de pago: efectivo, transferencia, cheque o crédito' }) });
const TIPOS_ARCHIVO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

// Un mantenimiento es una visita al taller: puede traer varios trabajos sobre varias partes.
const esquemaTrabajo = z.object({
  tipoTrabajoId: z.string().trim().min(1).max(80), // clave del catálogo, «otro» (escrito a mano) o «anterior»
  parte: z.string().trim().min(2).max(60),
  trabajo: z.string().trim().min(2).max(120),
  nota: z.string().trim().max(120).nullable().optional(), // p. ej. el eje en frenos y llantas
});

const esquemaMantenimiento = z.object({
  id: z.string().uuid().optional(),
  unidadId: z.string().uuid({ message: 'Indica el vehículo del mantenimiento' }),
  fecha: z.string().date().refine((f) => f <= hoyEcuador(), 'La fecha no puede ser futura. Elige hoy o un día anterior.'),
  km: z.number().int().min(0).max(5_000_000),
  trabajos: z.array(esquemaTrabajo).min(1, 'Marca al menos un trabajo').max(40).optional(),
  // Versiones anteriores de la app envían un solo trabajo con su parte
  parte: z.string().trim().min(2).max(120).optional(),
  trabajo: z.string().trim().min(2).max(120).optional(),
  provincia: texto(60), canton: texto(60),
  taller: texto(120), costoTaller: dinero,
  proveedor: texto(120), costoRepuestos: dinero, repuestosDetalle: texto(500),
  // Cómo se pagó cada parte (el taller y los repuestos se pagan por separado)
  pagoTaller: formaPago.optional(), pagoRepuestos: formaPago.optional(),
  notas: texto(500),
}).refine((x) => x.trabajos?.length || (x.parte && x.trabajo), { message: 'Marca al menos un trabajo', path: ['trabajos'] });

// Trabajos tal como se guardan: los del catálogo toman su nombre oficial; lo escrito a mano va a su parte (o a General)
function normalizarTrabajos(d) {
  const lista = d.trabajos?.length ? d.trabajos : [{ tipoTrabajoId: TRABAJO_ANTERIOR, parte: d.parte, trabajo: d.trabajo }];
  const vistos = new Set();
  return lista.map((x) => {
    const grupo = grupoPorNombre(x.parte) || GRUPOS.find((g) => g.id === x.parte);
    const delCatalogo = grupo?.trabajos.find((c) => c.id === x.tipoTrabajoId);
    if (delCatalogo) return { tipoTrabajoId: delCatalogo.id, parte: grupo.nombre, trabajo: delCatalogo.nombre, nota: x.nota || null, componente: grupo.componente || null };
    if (x.tipoTrabajoId === TRABAJO_ANTERIOR) return { tipoTrabajoId: TRABAJO_ANTERIOR, parte: x.parte, trabajo: x.trabajo, nota: x.nota || null, componente: null };
    return { tipoTrabajoId: TRABAJO_OTRO, parte: grupo?.nombre || 'General', trabajo: x.trabajo, nota: x.nota || null, componente: grupo?.componente || null };
  }).filter((x) => {
    // El mismo trabajo en la misma parte cuenta una sola vez
    const clave = `${x.parte}|${x.tipoTrabajoId}|${x.trabajo}`;
    return vistos.has(clave) ? false : vistos.add(clave);
  });
}

// Agrega a cada mantenimiento su lista de trabajos (los registros anteriores a esta función muestran el suyo único)
export async function conTrabajos(db, lista) {
  if (!lista.length) return [];
  const filas = await db.select().from(mantenimientoTrabajos).where(inArray(mantenimientoTrabajos.mantenimientoId, lista.map((m) => m.id))).orderBy(mantenimientoTrabajos.orden);
  return lista.map((m) => {
    const suyos = filas.filter((t) => t.mantenimientoId === m.id).map((t) => ({ tipoTrabajoId: t.tipoTrabajoId, componenteId: t.componenteId, parte: t.parte, trabajo: t.trabajo, nota: t.nota }));
    return { ...m, trabajos: suyos.length ? suyos : trabajosDeRegistro(m) };
  });
}

// Mantenimientos visibles: el dueño ve los de sus vehículos (y sus tanqueros); el chofer solo los suyos.
export async function filtroVisible(db, usuario) {
  const base = eq(mantenimientos.cuentaId, usuario.cuentaId);
  if (usuario.rol !== 'dueno') return and(base, eq(mantenimientos.creadoPor, usuario.id));
  const ids = await idsAccesibles(db, usuario);
  if (!ids.length) return sql`false`;
  return and(base, or(inArray(mantenimientos.vehiculoId, ids), inArray(mantenimientos.unidadId, ids)));
}

async function mantenimientoVisible(db, usuario, id) {
  if (!z.string().uuid().safeParse(id).success) throw new ErrorHttp(404, 'Mantenimiento no encontrado');
  const [m] = await db.select().from(mantenimientos).where(and(eq(mantenimientos.id, id), await filtroVisible(db, usuario)));
  if (!m) throw new ErrorHttp(404, 'Mantenimiento no encontrado');
  return m;
}

// El kilometraje no se edita a mano: parte del valor del registro y solo sube con el km de cada mantenimiento.
// Si el trabajo es del remolque, cuenta el km del cabezal enganchado (el odómetro está en el cabezal).
const SALTO_MAXIMO_KM = 60_000; // más que esto entre un mantenimiento y otro es casi seguro un error de tipeo

async function cabezalDe(db, unidad) {
  const cabezalId = await vehiculoDe(db, unidad);
  return cabezalId ? { cabezalId, kmActual: await kmActual(db, cabezalId) } : null; // kmActual null: el dueño aún no pone el km
}

async function actualizarKm(db, usuario, cab, km, mantenimientoId) {
  // Con km pendiente no se toma el de un mantenimiento como punto de partida: eso lo pone solo el dueño
  if (!cab || cab.kmActual === null || km <= cab.kmActual) return;
  await db.insert(odometro).values({ unidadId: cab.cabezalId, km, fuente: `mantenimiento:${mantenimientoId}`, registradoPor: usuario.id });
}

export function rutasMantenimientos({ db, almacen, soloDueno }) {
  const r = Router();

  r.post('/mantenimientos', async (req, res) => {
    const d = esquemaMantenimiento.parse(req.body);
    const unidad = await unidadAccesible(db, req.usuario, d.unidadId);
    // El km no se puede editar después: se rechazan saltos imposibles para no dañarlo con un error de tipeo
    const cab = await cabezalDe(db, unidad);
    if (cab && cab.kmActual !== null && d.km > cab.kmActual + SALTO_MAXIMO_KM) {
      throw new ErrorHttp(400, `El kilometraje ${d.km.toLocaleString('es-EC')} es ${(d.km - cab.kmActual).toLocaleString('es-EC')} km mayor al actual (${cab.kmActual.toLocaleString('es-EC')}). Revisa que esté bien escrito.`);
    }
    // Reintento desde el teléfono (mismo id): se devuelve lo ya guardado sin duplicar
    if (d.id) {
      const [ya] = await db.select().from(mantenimientos).where(eq(mantenimientos.id, d.id));
      if (ya) {
        if (ya.cuentaId !== req.usuario.cuentaId) throw new ErrorHttp(409, 'Identificador en uso');
        return res.json({ mantenimiento: (await conTrabajos(db, [ya]))[0], repetido: true });
      }
    }
    const trabajos = normalizarTrabajos(d);
    // Partes que son un componente único del vehículo (motor, caja, tanque): se enlazan con él
    const idsUnidad = [unidad.id];
    if (cab?.cabezalId && cab.cabezalId !== unidad.id) idsUnidad.push(cab.cabezalId);
    const enganchados = await db.select({ id: acoplamientos.remolqueId }).from(acoplamientos).where(and(inArray(acoplamientos.cabezalId, idsUnidad), isNull(acoplamientos.hasta)));
    idsUnidad.push(...enganchados.map((x) => x.id));
    const tipos = [...new Set(trabajos.map((x) => x.componente).filter(Boolean))];
    const partes = tipos.length ? await db.select().from(componentes).where(and(inArray(componentes.unidadId, idsUnidad), inArray(componentes.tipo, tipos), eq(componentes.activo, true))) : [];
    const { trabajos: _t, ...resto } = d;
    const m = await db.transaction(async (tx) => {
      const [nuevo] = await tx.insert(mantenimientos).values({
        ...resto, costoTaller: d.costoTaller.toFixed(2), costoRepuestos: d.costoRepuestos.toFixed(2),
        // Resumen de la visita para las listas: «Motor · Caja» y «Cambio de aceite y 2 más»
        parte: partesDeVisita(trabajos).join(' · ').slice(0, 120), trabajo: resumenTrabajos(trabajos).slice(0, 120),
        cuentaId: req.usuario.cuentaId, creadoPor: req.usuario.id, vehiculoId: cab?.cabezalId ?? null,
      }).returning();
      await tx.insert(mantenimientoTrabajos).values(trabajos.map((x, i) => ({
        mantenimientoId: nuevo.id, tipoTrabajoId: x.tipoTrabajoId, parte: x.parte, trabajo: x.trabajo, nota: x.nota, orden: i,
        componenteId: partes.find((c) => c.tipo === x.componente)?.id ?? null,
      })));
      await tx.insert(auditoria).values({ cuentaId: req.usuario.cuentaId, usuarioId: req.usuario.id, entidad: 'mantenimiento', entidadId: nuevo.id, accion: 'crear' });
      return nuevo;
    });
    await actualizarKm(db, req.usuario, cab, d.km, m.id);
    // Un registro de fecha anterior con km menor se acepta como retroactivo: no cambia el km actual
    const retroactivo = cab && cab.kmActual !== null && d.km < cab.kmActual;
    res.status(201).json({
      mantenimiento: (await conTrabajos(db, [m]))[0],
      aviso: retroactivo ? 'Este registro es de una fecha anterior; no cambia tu kilometraje actual' : null,
    });
  });

  r.get('/mantenimientos', async (req, res) => {
    const q = z.object({
      desde: z.string().date().optional(), hasta: z.string().date().optional(), chofer: z.string().uuid().optional(), vehiculo: z.string().uuid().optional(),
      porPagar: z.enum(['si']).optional(), // solo lo que quedó a crédito y aún no se paga
      parte: z.string().trim().max(60).optional(), trabajo: z.string().trim().max(120).optional(), // visitas que incluyen esa parte o ese trabajo
    }).parse(req.query);
    const cond = [await filtroVisible(db, req.usuario)];
    if (q.porPagar) {
      cond.push(or(
        and(eq(mantenimientos.pagoTaller, 'credito'), isNull(mantenimientos.tallerPagadoEn), gt(mantenimientos.costoTaller, '0')),
        and(eq(mantenimientos.pagoRepuestos, 'credito'), isNull(mantenimientos.repuestosPagadoEn), gt(mantenimientos.costoRepuestos, '0')),
      ));
    }
    if (q.vehiculo) cond.push(eq(mantenimientos.vehiculoId, q.vehiculo));
    if (q.desde) cond.push(gte(mantenimientos.fecha, q.desde));
    if (q.hasta) cond.push(lte(mantenimientos.fecha, q.hasta));
    if (q.chofer && req.usuario.rol === 'dueno') cond.push(eq(mantenimientos.creadoPor, q.chofer));
    let lista = await conTrabajos(db, await db.select().from(mantenimientos).where(and(...cond)).orderBy(desc(mantenimientos.fecha)));
    if (q.parte || q.trabajo) lista = lista.filter((m) => visitaIncluye(m, q));
    res.json({ mantenimientos: lista });
  });

  r.get('/mantenimientos/:id', async (req, res) => {
    const m = await mantenimientoVisible(db, req.usuario, req.params.id);
    const ev = await db.select().from(evidencias).where(eq(evidencias.mantenimientoId, m.id));
    res.json({ mantenimiento: (await conTrabajos(db, [m]))[0], evidencias: ev });
  });

  // El dueño marca como pagado lo que quedó a crédito (taller o repuestos, cada uno por su lado)
  r.post('/mantenimientos/:id/pagos', soloDueno, async (req, res) => {
    const m = await mantenimientoVisible(db, req.usuario, req.params.id);
    const d = z.object({ concepto: z.enum(['taller', 'repuestos']), forma: z.enum(['efectivo', 'transferencia', 'cheque'], { errorMap: () => ({ message: 'Indica cómo se pagó: efectivo, transferencia o cheque' }) }) }).parse(req.body);
    const taller = d.concepto === 'taller';
    if ((taller ? m.pagoTaller : m.pagoRepuestos) !== 'credito') throw new ErrorHttp(400, 'Eso no quedó a crédito');
    if (taller ? m.tallerPagadoEn : m.repuestosPagadoEn) throw new ErrorHttp(409, 'Ya estaba marcado como pagado');
    const cambios = taller ? { tallerPagadoEn: new Date(), tallerPagadoCon: d.forma } : { repuestosPagadoEn: new Date(), repuestosPagadoCon: d.forma };
    const [act] = await db.update(mantenimientos).set(cambios).where(eq(mantenimientos.id, m.id)).returning();
    await db.insert(auditoria).values({ cuentaId: req.usuario.cuentaId, usuarioId: req.usuario.id, entidad: 'mantenimiento', entidadId: m.id, accion: 'pagar_credito', datos: d });
    res.json({ mantenimiento: act });
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
    const datos = await almacen.leer(ev.claveAlmacen);
    if (!datos) throw new ErrorHttp(404, 'Archivo no disponible');
    res.type(ev.mime).set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(ev.nombreArchivo)}`).send(datos);
  });

  async function evidenciaVisible(req) {
    if (!z.string().uuid().safeParse(req.params.id).success) throw new ErrorHttp(404, 'Evidencia no encontrada');
    const [ev] = await db.select().from(evidencias).where(eq(evidencias.id, req.params.id));
    // La evidencia es de un mantenimiento o de un viaje: se ve si se ve su dueño
    const [visible] = !ev ? []
      : ev.mantenimientoId ? await db.select({ id: mantenimientos.id }).from(mantenimientos).where(and(eq(mantenimientos.id, ev.mantenimientoId), await filtroVisible(db, req.usuario)))
        : await db.select({ id: viajes.id }).from(viajes).where(and(eq(viajes.id, ev.viajeId), await filtroViajes(db, req.usuario)));
    if (!visible) throw new ErrorHttp(404, 'Evidencia no encontrada');
    return ev;
  }
  return r;
}
