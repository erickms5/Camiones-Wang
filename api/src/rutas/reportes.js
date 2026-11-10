// Reportes congelados: copia de los datos con hash SHA-256 real y folio. Cada reporte es de un chofer en un vehículo;
// el dueño ve los de sus vehículos.
import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { evidencias, mantenimientos, reportes, unidades, usuarios } from '../db/esquema.js';
import { ErrorHttp } from '../app.js';
import { sha256, mascaraCedula } from '../seguridad.js';
import { idsAccesibles, unidadAccesible } from '../flota.js';

// JSON con claves ordenadas para que el hash sea reproducible
const canonico = (v) => (Array.isArray(v) ? `[${v.map(canonico).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}` : JSON.stringify(v));

export function rutasReportes({ db, seguridad }) {
  const r = Router();

  r.post('/', async (req, res) => {
    const d = z.object({
      tipo: z.enum(['mensual', 'individual']),
      periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periodo AAAA-MM').optional(),
      mantenimientoId: z.string().uuid().optional(),
      choferId: z.string().uuid().optional(), // el dueño puede emitirlo por un chofer
      unidadId: z.string().uuid().optional(), // vehículo (cabezal o camión) del reporte
    }).refine((x) => (x.tipo === 'mensual' ? !!x.periodo : !!x.mantenimientoId), 'Falta el periodo o el mantenimiento').parse(req.body);

    const cuentaId = req.usuario.cuentaId;
    // Un mes que aún no empieza no tiene nada que reportar (se deja un día de margen por la zona horaria)
    if (d.periodo && d.periodo > new Date(Date.now() + 86400000).toISOString().slice(0, 7)) throw new ErrorHttp(400, 'Ese mes todavía no empieza');
    // El reporte de un solo trabajo se emite una vez: si ya existe, se devuelve el mismo
    if (d.tipo === 'individual') {
      const cond = [eq(reportes.cuentaId, cuentaId), eq(reportes.tipo, 'individual'), sql`${reportes.datos}->'mantenimientos'->0->>'id' = ${d.mantenimientoId}`];
      if (req.usuario.rol === 'chofer') cond.push(eq(reportes.choferId, req.usuario.id));
      const [ya] = await db.select().from(reportes).where(and(...cond));
      if (ya) return res.json({ reporte: ya, repetido: true });
    }
    const choferId = req.usuario.rol === 'dueno' ? d.choferId : req.usuario.id;
    if (!choferId) throw new ErrorHttp(400, 'Indica el chofer del reporte');
    const [chofer] = await db.select().from(usuarios).where(and(eq(usuarios.id, choferId), eq(usuarios.cuentaId, cuentaId)));
    if (!chofer) throw new ErrorHttp(404, 'Chofer no encontrado');

    // Vehículo del reporte: el indicado, o el único que el chofer tiene asignado
    let vehiculo = null;
    if (d.unidadId) vehiculo = await unidadAccesible(db, req.usuario, d.unidadId);
    else if (req.usuario.rol === 'chofer') {
      const ids = await idsAccesibles(db, req.usuario);
      const cabezales = ids.length ? await db.select().from(unidades).where(and(inArray(unidades.id, ids), eq(unidades.rol, 'cabezal'))) : [];
      if (cabezales.length === 1) [vehiculo] = cabezales;
    }
    if (vehiculo && vehiculo.rol !== 'cabezal') throw new ErrorHttp(400, 'El reporte es del cabezal o camión');
    if (!vehiculo && req.usuario.rol === 'dueno') throw new ErrorHttp(400, 'Indica el vehículo del reporte');

    const cond = [eq(mantenimientos.cuentaId, cuentaId), eq(mantenimientos.creadoPor, choferId)];
    if (vehiculo && d.tipo === 'mensual') cond.push(eq(mantenimientos.vehiculoId, vehiculo.id));
    if (d.tipo === 'mensual') {
      const [a, m] = d.periodo.split('-').map(Number);
      const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
      cond.push(gte(mantenimientos.fecha, `${d.periodo}-01`), lte(mantenimientos.fecha, fin), isNull(mantenimientos.reporteId));
    } else cond.push(eq(mantenimientos.id, d.mantenimientoId));
    const lista = await db.select().from(mantenimientos).where(and(...cond)).orderBy(mantenimientos.fecha);
    if (!lista.length) {
      throw new ErrorHttp(400, d.tipo === 'mensual' ? 'No hay mantenimientos nuevos de ese mes: lo registrado ya está en un reporte emitido o no hubo trabajos' : 'Mantenimiento no encontrado');
    }

    const evs = await db.select().from(evidencias).where(inArray(evidencias.mantenimientoId, lista.map((m) => m.id)));
    // Sin vehículo indicado (o reporte de un solo trabajo): se toma el de los mantenimientos incluidos
    const deLista = [...new Set(lista.map((m) => m.vehiculoId).filter(Boolean))];
    if (d.tipo === 'individual' || !vehiculo) {
      if (deLista.length > 1) throw new ErrorHttp(400, 'Hay mantenimientos de más de un vehículo: indica el vehículo del reporte');
      vehiculo = null;
      if (deLista.length) {
        if (req.usuario.rol === 'dueno') vehiculo = await unidadAccesible(db, req.usuario, deLista[0]);
        else [vehiculo] = await db.select().from(unidades).where(and(eq(unidades.id, deLista[0]), eq(unidades.cuentaId, cuentaId)));
      }
    }
    let datosVehiculo = null;
    if (vehiculo) {
      datosVehiculo = { id: vehiculo.id, placa: vehiculo.placa, modelo: [vehiculo.marca, vehiculo.modelo, vehiculo.anio].filter(Boolean).join(' ') };
    }
    const total = lista.reduce((s, m) => s + Number(m.costoTaller) + Number(m.costoRepuestos), 0);
    const datos = {
      chofer: { id: chofer.id, nombre: chofer.nombre, cedula: chofer.cedulaCifrada ? mascaraCedula(seguridad.descifrarCedula(chofer.cedulaCifrada)) : null },
      vehiculo: datosVehiculo,
      tipo: d.tipo, periodo: d.periodo || null,
      mantenimientos: lista.map((m) => ({
        id: m.id, fecha: m.fecha, km: m.km, parte: m.parte, trabajo: m.trabajo, taller: m.taller, costoTaller: m.costoTaller,
        proveedor: m.proveedor, costoRepuestos: m.costoRepuestos, repuestosDetalle: m.repuestosDetalle, notas: m.notas,
        provincia: m.provincia, canton: m.canton, pagoTaller: m.pagoTaller, pagoRepuestos: m.pagoRepuestos,
        evidencias: evs.filter((e) => e.mantenimientoId === m.id).map((e) => ({
          id: e.id, categoria: e.categoria, nombreArchivo: e.nombreArchivo, mime: e.mime, sha256: e.sha256,
          subidoEn: e.subidoEn?.toISOString() ?? null, anexoPosterior: e.anexoPosterior,
        })),
      })),
      total: total.toFixed(2),
    };
    const hash = sha256(canonico(datos));

    const emitir = () => db.transaction(async (tx) => {
      const anio = new Date().getFullYear();
      const [{ n }] = await tx.select({ n: count() }).from(reportes).where(eq(reportes.cuentaId, cuentaId));
      const folio = `${d.tipo === 'mensual' ? 'REP' : 'IND'}-${anio}-${String(n + 1).padStart(3, '0')}`;
      const [nuevo] = await tx.insert(reportes).values({
        cuentaId, folio, tipo: d.tipo, periodo: d.periodo, choferId, vehiculoId: vehiculo?.id ?? null, generadoPor: req.usuario.id, total: datos.total, hash, datos,
      }).returning();
      if (d.tipo === 'mensual') {
        await tx.update(mantenimientos).set({ bloqueado: true, reporteId: nuevo.id }).where(inArray(mantenimientos.id, lista.map((m) => m.id)));
      }
      return nuevo;
    });
    let rep;
    for (let intento = 0; ; intento++) {
      try {
        rep = await emitir();
        break;
      } catch (err) {
        // Folio repetido porque otra persona emitió en el mismo instante: se toma el siguiente número
        if ((err.code || err.cause?.code) !== '23505' || intento >= 3) throw err;
      }
    }
    res.status(201).json({ reporte: rep });
  });

  // Chofer: solo los suyos. Dueño: los de sus vehículos.
  async function visibles(usuario) {
    const cond = [eq(reportes.cuentaId, usuario.cuentaId)];
    if (usuario.rol === 'chofer') cond.push(eq(reportes.choferId, usuario.id));
    else {
      const ids = await idsAccesibles(db, usuario);
      cond.push(ids.length ? inArray(reportes.vehiculoId, ids) : sql`false`);
    }
    return cond;
  }

  // Filtros opcionales del dueño: ?chofer= y ?vehiculo=
  r.get('/', async (req, res) => {
    const q = z.object({ chofer: z.string().uuid().optional(), vehiculo: z.string().uuid().optional() }).parse(req.query);
    const cond = await visibles(req.usuario);
    if (req.usuario.rol === 'dueno' && q.chofer) cond.push(eq(reportes.choferId, q.chofer));
    if (q.vehiculo) cond.push(eq(reportes.vehiculoId, q.vehiculo));
    const lista = await db.select({
      id: reportes.id, folio: reportes.folio, tipo: reportes.tipo, periodo: reportes.periodo, total: reportes.total,
      generadoEn: reportes.generadoEn, hash: reportes.hash, chofer: usuarios.nombre, choferId: reportes.choferId,
      vehiculoId: reportes.vehiculoId, placa: unidades.placa,
    }).from(reportes).leftJoin(usuarios, eq(reportes.choferId, usuarios.id)).leftJoin(unidades, eq(reportes.vehiculoId, unidades.id)).where(and(...cond)).orderBy(desc(reportes.generadoEn));
    res.json({ reportes: lista });
  });

  r.get('/:folio', async (req, res) => {
    const cond = [...(await visibles(req.usuario)), eq(reportes.folio, req.params.folio)];
    const [rep] = await db.select().from(reportes).where(and(...cond));
    if (!rep) throw new ErrorHttp(404, 'Reporte no encontrado');
    // Facturas agregadas después de congelar el reporte: no cambian la huella y se muestran aparte como anexos
    const ids = rep.datos.mantenimientos.map((m) => m.id);
    const congeladas = new Set(rep.datos.mantenimientos.flatMap((m) => m.evidencias.map((e) => e.id)));
    const posteriores = (await db.select().from(evidencias).where(inArray(evidencias.mantenimientoId, ids)))
      .filter((e) => !congeladas.has(e.id) && e.subidoEn)
      .map((e) => ({ id: e.id, mantenimientoId: e.mantenimientoId, categoria: e.categoria, nombreArchivo: e.nombreArchivo, mime: e.mime, subidoEn: e.subidoEn, anexoPosterior: true }));
    // Verificación de integridad: el hash guardado debe coincidir con los datos guardados
    res.json({ reporte: rep, integro: sha256(canonico(rep.datos)) === rep.hash, anexos: posteriores });
  });
  return r;
}
