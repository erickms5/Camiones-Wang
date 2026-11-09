// Reportes congelados: copia de los datos con hash SHA-256 real y folio. El dueño ve los de todos sus choferes.
import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { evidencias, mantenimientos, reportes, usuarios } from '../db/esquema.js';
import { ErrorHttp } from '../app.js';
import { sha256, mascaraCedula } from '../seguridad.js';

// JSON con claves ordenadas para que el hash sea reproducible
const canonico = (v) => (Array.isArray(v) ? `[${v.map(canonico).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}` : JSON.stringify(v));

export function rutasReportes({ db, seguridad }) {
  const r = Router();

  r.post('/', async (req, res) => {
    const d = z.object({
      tipo: z.enum(['mensual', 'individual']),
      periodo: z.string().regex(/^\d{4}-\d{2}$/, 'Periodo AAAA-MM').optional(),
      mantenimientoId: z.string().uuid().optional(),
      choferId: z.string().uuid().optional(), // el dueño puede emitirlo por un chofer
    }).refine((x) => (x.tipo === 'mensual' ? !!x.periodo : !!x.mantenimientoId), 'Falta el periodo o el mantenimiento').parse(req.body);

    const cuentaId = req.usuario.cuentaId;
    const choferId = req.usuario.rol === 'dueno' ? d.choferId : req.usuario.id;
    if (!choferId) throw new ErrorHttp(400, 'Indica el chofer del reporte');
    const [chofer] = await db.select().from(usuarios).where(and(eq(usuarios.id, choferId), eq(usuarios.cuentaId, cuentaId)));
    if (!chofer) throw new ErrorHttp(404, 'Chofer no encontrado');

    const cond = [eq(mantenimientos.cuentaId, cuentaId), eq(mantenimientos.creadoPor, choferId)];
    if (d.tipo === 'mensual') {
      const [a, m] = d.periodo.split('-').map(Number);
      const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
      cond.push(gte(mantenimientos.fecha, `${d.periodo}-01`), lte(mantenimientos.fecha, fin), isNull(mantenimientos.reporteId));
    } else cond.push(eq(mantenimientos.id, d.mantenimientoId));
    const lista = await db.select().from(mantenimientos).where(and(...cond)).orderBy(mantenimientos.fecha);
    if (!lista.length) throw new ErrorHttp(400, 'No hay mantenimientos para incluir en el reporte');

    const evs = await db.select().from(evidencias).where(inArray(evidencias.mantenimientoId, lista.map((m) => m.id)));
    const total = lista.reduce((s, m) => s + Number(m.costoTaller) + Number(m.costoRepuestos), 0);
    const datos = {
      chofer: { id: chofer.id, nombre: chofer.nombre, cedula: chofer.cedulaCifrada ? mascaraCedula(seguridad.descifrarCedula(chofer.cedulaCifrada)) : null },
      tipo: d.tipo, periodo: d.periodo || null,
      mantenimientos: lista.map((m) => ({
        id: m.id, fecha: m.fecha, km: m.km, parte: m.parte, trabajo: m.trabajo, taller: m.taller, costoTaller: m.costoTaller,
        proveedor: m.proveedor, costoRepuestos: m.costoRepuestos, repuestosDetalle: m.repuestosDetalle, notas: m.notas,
        evidencias: evs.filter((e) => e.mantenimientoId === m.id).map((e) => ({
          id: e.id, categoria: e.categoria, nombreArchivo: e.nombreArchivo, mime: e.mime, sha256: e.sha256,
          subidoEn: e.subidoEn?.toISOString() ?? null, anexoPosterior: e.anexoPosterior,
        })),
      })),
      total: total.toFixed(2),
    };
    const hash = sha256(canonico(datos));

    const rep = await db.transaction(async (tx) => {
      const anio = new Date().getFullYear();
      const [{ n }] = await tx.select({ n: count() }).from(reportes).where(eq(reportes.cuentaId, cuentaId));
      const folio = `${d.tipo === 'mensual' ? 'REP' : 'IND'}-${anio}-${String(n + 1).padStart(3, '0')}`;
      const [nuevo] = await tx.insert(reportes).values({
        cuentaId, folio, tipo: d.tipo, periodo: d.periodo, choferId, generadoPor: req.usuario.id, total: datos.total, hash, datos,
      }).returning();
      if (d.tipo === 'mensual') {
        await tx.update(mantenimientos).set({ bloqueado: true, reporteId: nuevo.id }).where(inArray(mantenimientos.id, lista.map((m) => m.id)));
      }
      return nuevo;
    });
    res.status(201).json({ reporte: rep });
  });

  // Dueño: todos los reportes de su cuenta (opcional ?chofer=). Chofer: solo los suyos.
  r.get('/', async (req, res) => {
    const q = z.object({ chofer: z.string().uuid().optional() }).parse(req.query);
    const cond = [eq(reportes.cuentaId, req.usuario.cuentaId)];
    if (req.usuario.rol === 'chofer') cond.push(eq(reportes.choferId, req.usuario.id));
    else if (q.chofer) cond.push(eq(reportes.choferId, q.chofer));
    const lista = await db.select({
      id: reportes.id, folio: reportes.folio, tipo: reportes.tipo, periodo: reportes.periodo, total: reportes.total,
      generadoEn: reportes.generadoEn, hash: reportes.hash, chofer: usuarios.nombre, choferId: reportes.choferId,
    }).from(reportes).leftJoin(usuarios, eq(reportes.choferId, usuarios.id)).where(and(...cond)).orderBy(desc(reportes.generadoEn));
    res.json({ reportes: lista });
  });

  r.get('/:folio', async (req, res) => {
    const cond = [eq(reportes.cuentaId, req.usuario.cuentaId), eq(reportes.folio, req.params.folio)];
    if (req.usuario.rol === 'chofer') cond.push(eq(reportes.choferId, req.usuario.id));
    const [rep] = await db.select().from(reportes).where(and(...cond));
    if (!rep) throw new ErrorHttp(404, 'Reporte no encontrado');
    // Verificación de integridad: el hash guardado debe coincidir con los datos guardados
    res.json({ reporte: rep, integro: sha256(canonico(rep.datos)) === rep.hash });
  });
  return r;
}
