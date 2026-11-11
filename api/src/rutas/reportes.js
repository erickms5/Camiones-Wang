// Reportes congelados: copia de los datos con hash SHA-256 real y folio. Cada reporte es de un chofer en un vehículo;
// el dueño ve los de sus vehículos. El mensual congela mantenimientos, viajes terminados y tanqueos del mes.
import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { evidencias, mantenimientos, reporteTanqueos, reporteViajes, reportes, tanqueos, unidades, usuarios, viajes } from '../db/esquema.js';
import { ErrorHttp } from '../app.js';
import { sha256, mascaraCedula } from '../seguridad.js';
import { idsAccesibles, unidadAccesible } from '../flota.js';
import { conTrabajos } from './mantenimientos.js';
import { completarViajes, tanqueoPlano } from './viajes.js';
import { PRODUCTOS, instante, kmPorGalon, kmRecorridos, mesEcuador, nombreProducto } from '../../../public/js/viajes-logica.js';

// JSON con claves ordenadas para que el hash sea reproducible
const canonico = (v) => (Array.isArray(v) ? `[${v.map(canonico).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}` : JSON.stringify(v));

const evidenciaCongelada = (e) => ({
  id: e.id, categoria: e.categoria, nombreArchivo: e.nombreArchivo, mime: e.mime, sha256: e.sha256,
  subidoEn: e.subidoEn?.toISOString() ?? null, anexoPosterior: e.anexoPosterior,
});
const PREFIJO = { mensual: 'REP', individual: 'IND', viaje: 'VIA' };

export function rutasReportes({ db, seguridad }) {
  const r = Router();

  r.post('/', async (req, res) => {
    const d = z.object({
      tipo: z.enum(['mensual', 'individual', 'viaje']),
      periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periodo AAAA-MM').optional(),
      mantenimientoId: z.string().uuid().optional(),
      viajeId: z.string().uuid().optional(),
      choferId: z.string().uuid().optional(), // el dueño puede emitirlo por un chofer
      unidadId: z.string().uuid().optional(), // vehículo (cabezal o camión) del reporte
    }).refine((x) => (x.tipo === 'mensual' ? !!x.periodo : x.tipo === 'viaje' ? !!x.viajeId : !!x.mantenimientoId), 'Falta el periodo, el mantenimiento o el viaje').parse(req.body);

    const cuentaId = req.usuario.cuentaId;
    // Un mes que aún no empieza no tiene nada que reportar (hora de Ecuador)
    if (d.periodo && d.periodo > mesEcuador()) throw new ErrorHttp(400, 'Ese mes todavía no empieza');
    // El reporte de un solo trabajo o de un solo viaje se emite una vez: si ya existe, se devuelve el mismo
    if (d.tipo !== 'mensual') {
      const cond = [eq(reportes.cuentaId, cuentaId), eq(reportes.tipo, d.tipo),
        d.tipo === 'viaje' ? sql`${reportes.datos}->'viajes'->0->>'id' = ${d.viajeId}` : sql`${reportes.datos}->'mantenimientos'->0->>'id' = ${d.mantenimientoId}`];
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
    if (!vehiculo && req.usuario.rol === 'dueno' && d.tipo === 'mensual') throw new ErrorHttp(400, 'Indica el vehículo del reporte');

    // ---- mantenimientos
    let lista = [];
    if (d.tipo !== 'viaje') {
      const cond = [eq(mantenimientos.cuentaId, cuentaId), eq(mantenimientos.creadoPor, choferId)];
      if (vehiculo && d.tipo === 'mensual') cond.push(eq(mantenimientos.vehiculoId, vehiculo.id));
      if (d.tipo === 'mensual') {
        const [a, m] = d.periodo.split('-').map(Number);
        const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
        cond.push(gte(mantenimientos.fecha, `${d.periodo}-01`), lte(mantenimientos.fecha, fin), isNull(mantenimientos.reporteId));
      } else cond.push(eq(mantenimientos.id, d.mantenimientoId));
      lista = await conTrabajos(db, await db.select().from(mantenimientos).where(and(...cond)).orderBy(mantenimientos.fecha));
      if (d.tipo === 'individual' && !lista.length) throw new ErrorHttp(400, 'Mantenimiento no encontrado');
    }

    // ---- viajes terminados (un viaje abierto queda para el reporte siguiente) y tanqueos
    let listaViajes = [];
    let sueltos = []; // tanqueos fuera de viaje
    if (d.tipo === 'viaje') {
      const [v] = await db.select().from(viajes).where(and(eq(viajes.id, d.viajeId), eq(viajes.cuentaId, cuentaId), eq(viajes.creadoPor, choferId), eq(viajes.activo, true)));
      if (!v) throw new ErrorHttp(404, 'Viaje no encontrado');
      if (v.estado !== 'cerrado') throw new ErrorHttp(400, 'Termina el viaje para poder emitir su reporte');
      listaViajes = [v];
    } else if (d.tipo === 'mensual' && vehiculo) {
      const [a, m] = d.periodo.split('-').map(Number);
      const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
      listaViajes = await db.select().from(viajes).where(and(
        eq(viajes.cuentaId, cuentaId), eq(viajes.creadoPor, choferId), eq(viajes.cabezalId, vehiculo.id), eq(viajes.activo, true), eq(viajes.estado, 'cerrado'),
        gte(viajes.fechaSalida, `${d.periodo}-01`), lte(viajes.fechaSalida, fin), isNull(viajes.reporteId),
      )).orderBy(viajes.fechaSalida, viajes.horaSalida);
      sueltos = await db.select().from(tanqueos).where(and(
        eq(tanqueos.cuentaId, cuentaId), eq(tanqueos.creadoPor, choferId), eq(tanqueos.cabezalId, vehiculo.id), eq(tanqueos.activo, true), isNull(tanqueos.viajeId),
        gte(tanqueos.fechaHora, instante(`${d.periodo}-01`)), lte(tanqueos.fechaHora, instante(fin, '23:59')), isNull(tanqueos.reporteId),
      )).orderBy(tanqueos.fechaHora);
    }
    const idsViaje = listaViajes.map((v) => v.id);
    const delViaje = idsViaje.length ? await db.select().from(tanqueos).where(and(inArray(tanqueos.viajeId, idsViaje), eq(tanqueos.activo, true))).orderBy(tanqueos.fechaHora) : [];

    if (d.tipo === 'mensual' && !lista.length && !listaViajes.length && !sueltos.length) {
      throw new ErrorHttp(400, 'No hay nada nuevo de ese mes: lo registrado ya está en un reporte emitido o no hubo mantenimientos, viajes ni tanqueos');
    }

    const condEv = [];
    if (lista.length) condEv.push(inArray(evidencias.mantenimientoId, lista.map((m) => m.id)));
    if (idsViaje.length) condEv.push(inArray(evidencias.viajeId, idsViaje));
    const evs = condEv.length ? await db.select().from(evidencias).where(or(...condEv)) : [];

    // Sin vehículo indicado (o reporte de un solo registro): se toma el de lo incluido
    const deLista = [...new Set([...lista.map((m) => m.vehiculoId), ...listaViajes.map((v) => v.cabezalId)].filter(Boolean))];
    if (d.tipo !== 'mensual' || !vehiculo) {
      if (deLista.length > 1) throw new ErrorHttp(400, 'Hay registros de más de un vehículo: indica el vehículo del reporte');
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
        // Todos los trabajos de la visita, con su parte
        trabajos: m.trabajos.map((x) => ({ tipoTrabajoId: x.tipoTrabajoId, parte: x.parte, trabajo: x.trabajo, nota: x.nota ?? null })),
        proveedor: m.proveedor, costoRepuestos: m.costoRepuestos, repuestosDetalle: m.repuestosDetalle, notas: m.notas,
        provincia: m.provincia, canton: m.canton, pagoTaller: m.pagoTaller, pagoRepuestos: m.pagoRepuestos,
        evidencias: evs.filter((e) => e.mantenimientoId === m.id).map(evidenciaCongelada),
      })),
      total: total.toFixed(2),
    };

    // Viajes y tanqueos: solo cuando el reporte los trae (los reportes de un solo trabajo no cambian de forma)
    if (d.tipo !== 'individual') {
      const completos = await completarViajes(db, listaViajes);
      datos.viajes = completos.map((v) => {
        const suyos = delViaje.filter((t) => t.viajeId === v.id).map(tanqueoPlano);
        const tanqueado = suyos.reduce((s, t) => s + t.galones, 0);
        return {
          id: v.id, fechaSalida: v.fechaSalida, horaSalida: v.horaSalida, fechaRetorno: v.fechaRetorno, horaRetorno: v.horaRetorno,
          kmSalida: v.kmSalida, kmLlegada: v.kmLlegada, origen: v.origen, destino: v.destino,
          productos: v.productos.map((p) => ({ ...p, nombre: nombreProducto(p.producto) })), volumen: v.volumen,
          compartimentos: v.compartimentos, notas: v.notas,
          tanqueos: suyos.map((t) => ({ id: t.id, fecha: t.fecha, hora: t.hora, galones: t.galones, lugar: t.lugar, km: t.km, costo: t.costo })),
          combustible: tanqueado, // galones que consumió el vehículo en ese viaje (suma de sus tanqueos)
          kmRecorridos: kmRecorridos(v), kmPorGalon: kmPorGalon(kmRecorridos(v), tanqueado), // el rendimiento se guarda, no se muestra
          evidencias: evs.filter((e) => e.viajeId === v.id).map(evidenciaCongelada),
        };
      });
      datos.tanqueosFuera = sueltos.map(tanqueoPlano).map((t) => ({ id: t.id, fecha: t.fecha, hora: t.hora, galones: t.galones, lugar: t.lugar, km: t.km, costo: t.costo }));
      const km = datos.viajes.reduce((s, v) => s + v.kmRecorridos, 0);
      const tanqueado = datos.viajes.reduce((s, v) => s + v.combustible, 0) + datos.tanqueosFuera.reduce((s, t) => s + t.galones, 0);
      datos.totalesViajes = {
        viajes: datos.viajes.length, kmRecorridos: km,
        galonesPorProducto: Object.fromEntries(PRODUCTOS.map((p) => [p.id, datos.viajes.reduce((s, v) => s + v.productos.filter((x) => x.producto === p.id).reduce((a, x) => a + x.galones, 0), 0)])),
        galonesTanqueados: tanqueado,
        kmPorGalon: kmPorGalon(km, datos.viajes.reduce((s, v) => s + v.combustible, 0)),
      };
    }
    const hash = sha256(canonico(datos));

    const emitir = () => db.transaction(async (tx) => {
      const anio = Number(mesEcuador().slice(0, 4));
      const [{ n }] = await tx.select({ n: count() }).from(reportes).where(eq(reportes.cuentaId, cuentaId));
      const folio = `${PREFIJO[d.tipo]}-${anio}-${String(n + 1).padStart(3, '0')}`;
      const [nuevo] = await tx.insert(reportes).values({
        cuentaId, folio, tipo: d.tipo, periodo: d.periodo, choferId, vehiculoId: vehiculo?.id ?? null, generadoPor: req.usuario.id, total: datos.total, hash, datos,
      }).returning();
      // El mensual congela lo que incluye: ya no se puede corregir ni entrar a otro reporte
      if (d.tipo === 'mensual') {
        if (lista.length) await tx.update(mantenimientos).set({ bloqueado: true, reporteId: nuevo.id }).where(inArray(mantenimientos.id, lista.map((m) => m.id)));
        if (idsViaje.length) {
          await tx.update(viajes).set({ bloqueado: true, reporteId: nuevo.id }).where(inArray(viajes.id, idsViaje));
          await tx.insert(reporteViajes).values(idsViaje.map((viajeId) => ({ reporteId: nuevo.id, viajeId })));
        }
        const idsTanqueo = [...delViaje, ...sueltos].map((t) => t.id);
        if (idsTanqueo.length) {
          await tx.update(tanqueos).set({ bloqueado: true, reporteId: nuevo.id }).where(inArray(tanqueos.id, idsTanqueo));
          await tx.insert(reporteTanqueos).values(idsTanqueo.map((tanqueoId) => ({ reporteId: nuevo.id, tanqueoId })));
        }
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
    // Facturas y fotos de guía agregadas después de congelar el reporte: no cambian la huella y se muestran aparte como anexos
    const idsMant = rep.datos.mantenimientos.map((m) => m.id);
    const idsViaje = (rep.datos.viajes || []).map((v) => v.id);
    const congeladas = new Set([...rep.datos.mantenimientos, ...(rep.datos.viajes || [])].flatMap((x) => x.evidencias.map((e) => e.id)));
    const condEv = [];
    if (idsMant.length) condEv.push(inArray(evidencias.mantenimientoId, idsMant));
    if (idsViaje.length) condEv.push(inArray(evidencias.viajeId, idsViaje));
    const posteriores = (condEv.length ? await db.select().from(evidencias).where(or(...condEv)) : [])
      .filter((e) => !congeladas.has(e.id) && e.subidoEn)
      .map((e) => ({ id: e.id, mantenimientoId: e.mantenimientoId, viajeId: e.viajeId, categoria: e.categoria, nombreArchivo: e.nombreArchivo, mime: e.mime, subidoEn: e.subidoEn, anexoPosterior: true }));
    // Verificación de integridad: el hash guardado debe coincidir con los datos guardados
    res.json({ reporte: rep, integro: sha256(canonico(rep.datos)) === rep.hash, anexos: posteriores });
  });
  return r;
}
