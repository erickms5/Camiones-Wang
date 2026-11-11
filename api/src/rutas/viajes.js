// Viajes, lugares y tanqueos.
//   «Carga»   = producto que lleva el tanque (Diésel, Súper o Ecopaís).
//   «Tanqueo» = combustible que consume el camión.
// El teléfono genera los identificadores y vuelve a enviar el registro completo cada vez (PUT): sin duplicados.
// Viajes y tanqueos se pueden corregir hasta que entran a un reporte; nada se borra (baja lógica) y todo cambio
// queda en auditoría.
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  auditoria, componentes, evidencias, lugares, odometro, tanqueos, viajeCompartimentos, viajeProductos, viajes,
} from '../db/esquema.js';
import { ErrorHttp } from '../app.js';
import { acopleActivo, idsAccesibles, kmActual, unidadAccesible } from '../flota.js';
import {
  PRODUCTOS, actualizaOdometro, errorCierre, errorProductos, errorSalida, errorTanqueo, hoyEcuador, horaEcuador, instante, limpiarNombre,
  normalizarLugar, volumenTotal,
} from '../../../public/js/viajes-logica.js';

const SALTO_MAXIMO_KM = 60_000; // más que esto de golpe es casi seguro un error de tipeo
const TIPOS_ARCHIVO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const uuid = z.string().uuid();
const km = z.number().int().min(0).max(5_000_000);
const lugar = z.object({ nombre: z.string().trim().min(1, 'Escribe el nombre del lugar').max(80), tipo: z.enum(['estacion', 'gasolinera', 'minera', 'otro']).nullable().optional() });
const producto = z.enum(PRODUCTOS.map((p) => p.id), { errorMap: () => ({ message: 'Producto: Diésel, Súper o Ecopaís' }) });

const esquemaViaje = z.object({
  unidadId: uuid, // cabezal o camión
  fechaSalida: z.string().date(), horaSalida: z.string(),
  origen: lugar, destino: lugar,
  kmSalida: km,
  productos: z.array(z.object({ producto, galones: z.number().int().positive('Los galones deben ser un número entero mayor a cero').max(100_000), numeroGuia: z.string().trim().min(1, 'Falta el número de guía').max(40) })).min(1).max(3),
  // Opcional: en qué compartimento (1 = el de adelante) fue cada producto
  compartimentos: z.array(z.object({ numero: z.number().int().min(1).max(12), producto })).max(12).optional(),
  notas: z.string().trim().max(500).nullable().optional(),
  estado: z.enum(['abierto', 'cerrado']),
  fechaRetorno: z.string().date().nullable().optional(), horaRetorno: z.string().nullable().optional(),
  kmLlegada: km.nullable().optional(),
});

const esquemaTanqueo = z.object({
  unidadId: uuid,
  viajeId: uuid.nullable().optional(),
  fecha: z.string().date(), hora: z.string(),
  galones: z.number().positive('Los galones deben ser mayores a cero').max(2000),
  lugar: z.string().trim().max(80).nullable().optional(),
  km: km.nullable().optional(),
  costo: z.number().min(0).max(100_000).nullable().optional(),
});

// Viajes visibles: el chofer ve los suyos; el dueño, los de sus vehículos.
export async function filtroViajes(db, usuario, tabla = viajes) {
  const base = eq(tabla.cuentaId, usuario.cuentaId);
  if (usuario.rol !== 'dueno') return and(base, eq(tabla.creadoPor, usuario.id));
  const ids = await idsAccesibles(db, usuario);
  return ids.length ? and(base, inArray(tabla.cabezalId, ids)) : sql`false`;
}

// Viaje completo: con los nombres de sus lugares, su carga y lo tanqueado
export async function completarViajes(db, filas) {
  if (!filas.length) return [];
  const ids = filas.map((v) => v.id);
  const idsLugar = [...new Set(filas.flatMap((v) => [v.origenId, v.destinoId]))];
  const [prods, lugs, tanq, comps] = await Promise.all([
    db.select().from(viajeProductos).where(inArray(viajeProductos.viajeId, ids)),
    db.select().from(lugares).where(inArray(lugares.id, idsLugar)),
    db.select().from(tanqueos).where(and(inArray(tanqueos.viajeId, ids), eq(tanqueos.activo, true))),
    db.select({ viajeId: viajeCompartimentos.viajeId, producto: viajeCompartimentos.producto, posicion: componentes.posicion })
      .from(viajeCompartimentos).innerJoin(componentes, eq(viajeCompartimentos.componenteId, componentes.id)).where(inArray(viajeCompartimentos.viajeId, ids)),
  ]);
  const orden = (p) => PRODUCTOS.findIndex((x) => x.id === p.producto);
  return filas.map((v) => {
    const productos = prods.filter((p) => p.viajeId === v.id).sort((a, b) => orden(a) - orden(b)).map((p) => ({ producto: p.producto, galones: p.galones, numeroGuia: p.numeroGuia }));
    const suyos = tanq.filter((t) => t.viajeId === v.id);
    return {
      ...v,
      origen: lugs.find((l) => l.id === v.origenId)?.nombre || '', destino: lugs.find((l) => l.id === v.destinoId)?.nombre || '',
      productos, volumen: volumenTotal(productos),
      compartimentos: comps.filter((c) => c.viajeId === v.id).map((c) => ({ numero: Number(c.posicion) + 1, producto: c.producto })).sort((a, b) => a.numero - b.numero),
      galonesTanqueados: suyos.reduce((s, t) => s + Number(t.galones), 0),
    };
  });
}

export const tanqueoPlano = (t) => ({
  ...t, galones: Number(t.galones), costo: t.costo === null ? null : Number(t.costo),
  fecha: hoyEcuador(t.fechaHora), hora: horaEcuador(t.fechaHora),
});

export function rutasViajes({ db }) {
  const r = Router();
  const auditar = (tx, req, entidad, entidadId, accion, datos) =>
    tx.insert(auditoria).values({ cuentaId: req.usuario.cuentaId, usuarioId: req.usuario.id, entidad, entidadId, accion, datos });

  async function viajeVisible(req, id) {
    if (!uuid.safeParse(id).success) throw new ErrorHttp(404, 'Viaje no encontrado');
    const [v] = await db.select().from(viajes).where(and(eq(viajes.id, id), await filtroViajes(db, req.usuario)));
    if (!v) throw new ErrorHttp(404, 'Viaje no encontrado');
    return v;
  }

  // Reutiliza el lugar del chofer con ese nombre (sin mayúsculas, tildes ni espacios) o lo crea: nunca duplica
  async function lugarDe(tx, usuarioId, dato, uso, contar) {
    const nombre = limpiarNombre(dato.nombre);
    const norm = normalizarLugar(nombre);
    if (!norm) throw new ErrorHttp(400, 'Escribe el nombre del lugar');
    const marcas = uso === 'carga' ? { usadoComoCarga: true } : { usadoComoDestino: true };
    const [ya] = await tx.select().from(lugares).where(and(eq(lugares.usuarioId, usuarioId), eq(lugares.nombreNormalizado, norm)));
    if (ya) {
      const [act] = await tx.update(lugares).set({ ...marcas, tipo: ya.tipo || dato.tipo || null, activo: true, vecesUsado: ya.vecesUsado + (contar ? 1 : 0) })
        .where(eq(lugares.id, ya.id)).returning();
      return act;
    }
    const [nuevo] = await tx.insert(lugares).values({ usuarioId, nombre, nombreNormalizado: norm, tipo: dato.tipo || null, ...marcas, vecesUsado: 1 }).returning();
    return nuevo;
  }

  // ---------------------------------------------------------------- lugares
  r.get('/lugares', async (req, res) => {
    const lista = await db.select().from(lugares).where(and(eq(lugares.usuarioId, req.usuario.id), eq(lugares.activo, true))).orderBy(desc(lugares.vecesUsado));
    res.json({ lugares: lista });
  });

  // ---------------------------------------------------------------- viajes
  // Crea el viaje o lo actualiza (mismo id). Sirve para abrirlo, corregirlo, terminarlo o pasar uno atrasado completo.
  r.put('/viajes/:id', async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw new ErrorHttp(400, 'Identificador no válido');
    const d = esquemaViaje.parse(req.body);
    const hoy = hoyEcuador();
    const cerrado = d.estado === 'cerrado';
    const datos = { ...d, origen: d.origen.nombre, destino: d.destino.nombre };
    const problema = errorSalida(datos, hoy) || errorProductos(d.productos) || (cerrado ? errorCierre(datos, hoy) : null);
    if (problema) throw new ErrorHttp(400, problema);

    const unidad = await unidadAccesible(db, req.usuario, d.unidadId);
    if (unidad.rol !== 'cabezal') throw new ErrorHttp(400, 'El viaje se registra en el cabezal o camión');
    const [previo] = await db.select().from(viajes).where(eq(viajes.id, req.params.id));
    if (previo) {
      if (previo.cuentaId !== req.usuario.cuentaId || (req.usuario.rol !== 'dueno' && previo.creadoPor !== req.usuario.id)) throw new ErrorHttp(409, 'Identificador en uso');
      if (!previo.activo) throw new ErrorHttp(409, 'Ese viaje fue dado de baja');
      if (previo.bloqueado) throw new ErrorHttp(409, 'Ese viaje ya está en un reporte emitido y no se puede cambiar');
      if (previo.cabezalId !== unidad.id) throw new ErrorHttp(400, 'El viaje es de otro vehículo');
    }
    if (!cerrado) {
      const [otro] = await db.select({ id: viajes.id }).from(viajes).where(and(eq(viajes.cabezalId, unidad.id), eq(viajes.estado, 'abierto'), eq(viajes.activo, true)));
      if (otro && otro.id !== req.params.id) throw new ErrorHttp(409, 'Ya hay un viaje abierto en este vehículo. Termínalo antes de empezar otro.');
    }
    // Un salto imposible de km es un error de tipeo: se rechaza antes de mover el odómetro
    const kmHoy = await kmActual(db, unidad.id);
    const mayor = cerrado ? d.kmLlegada : d.kmSalida;
    if (kmHoy !== null && mayor > kmHoy + SALTO_MAXIMO_KM) {
      throw new ErrorHttp(400, `El kilometraje ${mayor.toLocaleString('es-EC')} es mucho mayor al actual (${kmHoy.toLocaleString('es-EC')}). Revisa que esté bien escrito.`);
    }

    const acople = await acopleActivo(db, unidad.id);
    const remolqueId = acople?.cabezalId === unidad.id ? acople.remolqueId : null;
    const chofer = previo?.creadoPor || req.usuario.id; // los lugares son del chofer del viaje
    let aviso = null;
    await db.transaction(async (tx) => {
      const origen = await lugarDe(tx, chofer, d.origen, 'carga', !previo);
      const destino = await lugarDe(tx, chofer, d.destino, 'destino', !previo);
      const fila = {
        cabezalId: unidad.id, remolqueId, fechaSalida: d.fechaSalida, horaSalida: d.horaSalida, origenId: origen.id, destinoId: destino.id,
        kmSalida: d.kmSalida, notas: d.notas || null, estado: d.estado,
        fechaRetorno: cerrado ? d.fechaRetorno : null, horaRetorno: cerrado ? d.horaRetorno : null, kmLlegada: cerrado ? d.kmLlegada : null,
        actualizadoEn: new Date(),
      };
      if (previo) await tx.update(viajes).set(fila).where(eq(viajes.id, previo.id));
      else await tx.insert(viajes).values({ ...fila, id: req.params.id, cuentaId: req.usuario.cuentaId, creadoPor: req.usuario.id });

      await tx.delete(viajeProductos).where(eq(viajeProductos.viajeId, req.params.id));
      await tx.insert(viajeProductos).values(d.productos.map((p) => ({ viajeId: req.params.id, ...p })));
      await tx.delete(viajeCompartimentos).where(eq(viajeCompartimentos.viajeId, req.params.id));
      if (d.compartimentos?.length) {
        // Los compartimentos están en el tanquero (cabezal) o en el mismo camión
        const delTanque = await tx.select().from(componentes).where(and(eq(componentes.unidadId, remolqueId || unidad.id), eq(componentes.tipo, 'compartimento'), eq(componentes.activo, true)));
        const filas = d.compartimentos.filter((c) => d.productos.some((p) => p.producto === c.producto))
          .map((c) => ({ viajeId: req.params.id, producto: c.producto, componenteId: delTanque.find((x) => Number(x.posicion) === c.numero - 1)?.id }))
          .filter((c) => c.componenteId);
        if (filas.length) await tx.insert(viajeCompartimentos).values(filas);
      }

      // Al terminar, el km de llegada sube el odómetro del cabezal. Un viaje atrasado (km menor al actual) no lo toca,
      // y con el km pendiente el punto de partida lo pone solo el dueño.
      if (cerrado && (!previo || previo.estado !== 'cerrado' || previo.kmLlegada !== d.kmLlegada)) {
        if (kmHoy === null) aviso = 'El dueño todavía no pone el kilometraje del vehículo: este viaje no lo cambia.';
        else if (actualizaOdometro(d.kmLlegada, kmHoy)) await tx.insert(odometro).values({ unidadId: unidad.id, km: d.kmLlegada, fuente: 'manual', registradoPor: req.usuario.id });
        else aviso = `Este viaje es anterior: tu kilometraje actual sigue en ${kmHoy.toLocaleString('es-EC')} km.`;
      }
      await auditar(tx, req, 'viaje', req.params.id, previo ? (cerrado && previo.estado !== 'cerrado' ? 'terminar' : 'editar') : 'crear', previo ? { antes: previo, ahora: d } : d);
    });
    const [guardado] = await db.select().from(viajes).where(eq(viajes.id, req.params.id));
    res.status(previo ? 200 : 201).json({ viaje: (await completarViajes(db, [guardado]))[0], aviso, km: await kmActual(db, unidad.id) });
  });

  // Historial con filtros: rango de fechas, destino y producto
  r.get('/viajes', async (req, res) => {
    const q = z.object({
      desde: z.string().date().optional(), hasta: z.string().date().optional(), destino: z.string().trim().max(80).optional(),
      producto: producto.optional(), vehiculo: uuid.optional(), estado: z.enum(['abierto', 'cerrado']).optional(),
    }).parse(req.query);
    const cond = [await filtroViajes(db, req.usuario), eq(viajes.activo, true)];
    if (q.desde) cond.push(gte(viajes.fechaSalida, q.desde));
    if (q.hasta) cond.push(lte(viajes.fechaSalida, q.hasta));
    if (q.vehiculo) cond.push(eq(viajes.cabezalId, q.vehiculo));
    if (q.estado) cond.push(eq(viajes.estado, q.estado));
    let lista = await completarViajes(db, await db.select().from(viajes).where(and(...cond)).orderBy(desc(viajes.fechaSalida), desc(viajes.horaSalida)));
    if (q.destino) lista = lista.filter((v) => normalizarLugar(v.destino).includes(normalizarLugar(q.destino)));
    if (q.producto) lista = lista.filter((v) => v.productos.some((p) => p.producto === q.producto));
    res.json({ viajes: lista });
  });

  r.get('/viajes/:id', async (req, res) => {
    const v = await viajeVisible(req, req.params.id);
    const [viaje] = await completarViajes(db, [v]);
    const [evs, tqs] = await Promise.all([
      db.select().from(evidencias).where(eq(evidencias.viajeId, v.id)),
      db.select().from(tanqueos).where(and(eq(tanqueos.viajeId, v.id), eq(tanqueos.activo, true))).orderBy(tanqueos.fechaHora),
    ]);
    res.json({ viaje, evidencias: evs, tanqueos: tqs.map(tanqueoPlano) });
  });

  // Baja lógica: el viaje deja de verse, pero no se borra. Sus tanqueos quedan en el vehículo.
  r.delete('/viajes/:id', async (req, res) => {
    const v = await viajeVisible(req, req.params.id);
    if (v.bloqueado) throw new ErrorHttp(409, 'Ese viaje ya está en un reporte emitido y no se puede dar de baja');
    await db.transaction(async (tx) => {
      await tx.update(viajes).set({ activo: false, actualizadoEn: new Date() }).where(eq(viajes.id, v.id));
      await tx.update(tanqueos).set({ viajeId: null, actualizadoEn: new Date() }).where(eq(tanqueos.viajeId, v.id));
      await auditar(tx, req, 'viaje', v.id, 'baja', v);
    });
    res.json({ ok: true });
  });

  // Foto de la guía: 1) se registra; 2) el archivo se sube con PUT /evidencias/:id/archivo (máx. 10 MB).
  // Si el viaje ya está en un reporte, entra como anexo posterior.
  r.post('/viajes/:id/evidencias', async (req, res) => {
    const v = await viajeVisible(req, req.params.id);
    const d = z.object({
      categoria: z.string().trim().min(2).max(80).default('Guía'),
      nombreArchivo: z.string().trim().min(1).max(200),
      mime: z.enum(TIPOS_ARCHIVO, { errorMap: () => ({ message: 'Solo fotos (JPG, PNG, WEBP, HEIC) o PDF' }) }),
    }).parse(req.body);
    const [ev] = await db.insert(evidencias).values({ ...d, viajeId: v.id, anexoPosterior: v.bloqueado, subidoPor: req.usuario.id }).returning();
    res.status(201).json({ evidencia: ev, subirA: `/evidencias/${ev.id}/archivo` });
  });

  // ---------------------------------------------------------------- tanqueos
  r.put('/tanqueos/:id', async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw new ErrorHttp(400, 'Identificador no válido');
    const d = esquemaTanqueo.parse(req.body);
    const problema = errorTanqueo(d);
    if (problema) throw new ErrorHttp(400, problema);
    const unidad = await unidadAccesible(db, req.usuario, d.unidadId);
    if (unidad.rol !== 'cabezal') throw new ErrorHttp(400, 'El tanqueo se registra en el cabezal o camión');
    const [previo] = await db.select().from(tanqueos).where(eq(tanqueos.id, req.params.id));
    if (previo) {
      if (previo.cuentaId !== req.usuario.cuentaId || (req.usuario.rol !== 'dueno' && previo.creadoPor !== req.usuario.id)) throw new ErrorHttp(409, 'Identificador en uso');
      if (!previo.activo) throw new ErrorHttp(409, 'Ese tanqueo fue dado de baja');
      if (previo.bloqueado) throw new ErrorHttp(409, 'Ese tanqueo ya está en un reporte emitido y no se puede cambiar');
    }
    if (d.viajeId) {
      const [v] = await db.select().from(viajes).where(and(eq(viajes.id, d.viajeId), eq(viajes.cabezalId, unidad.id), eq(viajes.activo, true)));
      if (!v) throw new ErrorHttp(400, 'El viaje de ese tanqueo no existe en este vehículo');
      if (v.bloqueado) throw new ErrorHttp(409, 'El viaje de ese tanqueo ya está en un reporte emitido');
    }
    const fila = {
      cabezalId: unidad.id, viajeId: d.viajeId || null, fechaHora: instante(d.fecha, d.hora), galones: d.galones.toFixed(2),
      lugar: d.lugar || null, km: d.km ?? null, costo: d.costo === null || d.costo === undefined ? null : d.costo.toFixed(2), actualizadoEn: new Date(),
    };
    await db.transaction(async (tx) => {
      if (previo) await tx.update(tanqueos).set(fila).where(eq(tanqueos.id, previo.id));
      else await tx.insert(tanqueos).values({ ...fila, id: req.params.id, cuentaId: req.usuario.cuentaId, creadoPor: req.usuario.id });
      await auditar(tx, req, 'tanqueo', req.params.id, previo ? 'editar' : 'crear', previo ? { antes: previo, ahora: d } : d);
    });
    const [guardado] = await db.select().from(tanqueos).where(eq(tanqueos.id, req.params.id));
    res.status(previo ? 200 : 201).json({ tanqueo: tanqueoPlano(guardado) });
  });

  r.get('/tanqueos', async (req, res) => {
    const q = z.object({ desde: z.string().date().optional(), hasta: z.string().date().optional(), vehiculo: uuid.optional() }).parse(req.query);
    const cond = [await filtroViajes(db, req.usuario, tanqueos), eq(tanqueos.activo, true)];
    if (q.desde) cond.push(gte(tanqueos.fechaHora, instante(q.desde)));
    if (q.hasta) cond.push(lte(tanqueos.fechaHora, instante(q.hasta, '23:59')));
    if (q.vehiculo) cond.push(eq(tanqueos.cabezalId, q.vehiculo));
    const lista = await db.select().from(tanqueos).where(and(...cond)).orderBy(desc(tanqueos.fechaHora));
    res.json({ tanqueos: lista.map(tanqueoPlano) });
  });

  r.delete('/tanqueos/:id', async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw new ErrorHttp(404, 'Tanqueo no encontrado');
    const [t] = await db.select().from(tanqueos).where(and(eq(tanqueos.id, req.params.id), await filtroViajes(db, req.usuario, tanqueos)));
    if (!t) throw new ErrorHttp(404, 'Tanqueo no encontrado');
    if (t.bloqueado) throw new ErrorHttp(409, 'Ese tanqueo ya está en un reporte emitido y no se puede dar de baja');
    await db.transaction(async (tx) => {
      await tx.update(tanqueos).set({ activo: false, actualizadoEn: new Date() }).where(eq(tanqueos.id, t.id));
      await auditar(tx, req, 'tanqueo', t.id, 'baja', t);
    });
    res.json({ ok: true });
  });

  return r;
}
