// Aplicación Express de la API de Mi Trailer.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { and, eq, gt } from 'drizzle-orm';
import { sesiones, usuarios } from './db/esquema.js';
import { rutasAuth } from './rutas/auth.js';
import { rutasChoferes } from './rutas/choferes.js';
import { rutasUnidades } from './rutas/unidades.js';
import { rutasMantenimientos } from './rutas/mantenimientos.js';
import { rutasReportes } from './rutas/reportes.js';
import { rutasViajes } from './rutas/viajes.js';
import { rutasAdmin } from './rutas/admin.js';

export class ErrorHttp extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

export function crearApp(dep) {
  const { db, seguridad, config } = dep;
  const app = express();
  app.disable('x-powered-by');
  // Número de proxies delante (Render: 1). Así el límite por IP usa la IP real del cliente.
  app.set('trust proxy', config.proxies);
  app.use(helmet());
  app.use(cors({ origin: config.origenes, allowedHeaders: ['Content-Type', 'Authorization'], methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] }));
  app.use(express.json({ limit: '1mb' }));

  // Sesión: «Authorization: Bearer <token>»
  app.use(async (req, _res, next) => {
    const token = req.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return next();
    const [fila] = await db
      .select({ usuario: usuarios })
      .from(sesiones)
      .innerJoin(usuarios, eq(sesiones.usuarioId, usuarios.id))
      .where(and(eq(sesiones.tokenHash, seguridad.hashToken(token)), gt(sesiones.expiraEn, new Date()), eq(usuarios.activo, true)));
    if (fila) req.usuario = fila.usuario;
    next();
  });

  const autenticado = (req, _res, next) => (req.usuario ? next() : next(new ErrorHttp(401, 'Inicia sesión para continuar')));
  const soloDueno = (req, _res, next) => (req.usuario?.rol === 'dueno' ? next() : next(new ErrorHttp(403, 'Solo el dueño puede hacer esto')));
  const soloAdmin = (req, _res, next) => (req.usuario?.rol === 'admin' ? next() : next(new ErrorHttp(403, 'Solo el administrador puede hacer esto')));
  // Dueños y choferes trabajan dentro de su empresa; el administrador usa solo su propio panel
  const deEmpresa = (req, _res, next) => (req.usuario?.cuentaId ? next() : next(new ErrorHttp(403, 'Usa el panel de administración')));
  const limiteAuth = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.prod ? 20 : 1000, standardHeaders: 'draft-8', legacyHeaders: false });

  const ctx = { ...dep, autenticado, soloDueno };
  app.get('/salud', (_req, res) => res.json({ ok: true }));
  app.use('/auth', limiteAuth, rutasAuth(ctx));
  app.use('/admin', autenticado, soloAdmin, rutasAdmin(ctx));
  app.use('/choferes', autenticado, deEmpresa, rutasChoferes(ctx));
  app.use('/reportes', autenticado, deEmpresa, rutasReportes(ctx));
  app.use('/', autenticado, deEmpresa, rutasUnidades(ctx));
  app.use('/', autenticado, deEmpresa, rutasMantenimientos(ctx));
  app.use('/', autenticado, deEmpresa, rutasViajes(ctx));

  app.use((_req, _res, next) => next(new ErrorHttp(404, 'No encontrado')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ZodError) return res.status(400).json({ error: 'Datos no válidos', detalles: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })) });
    if (err instanceof ErrorHttp) return res.status(err.estado).json({ error: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo es demasiado grande' });
    // Dato repetido (la base de datos rechaza el duplicado; Drizzle envuelve el error original en «cause»)
    const pgErr = err.code ? err : err.cause;
    if (pgErr?.code === '23505') {
      const mensajes = {
        unidades_placa_unica: 'Esa placa ya está registrada',
        usuarios_email_unico: 'Ese correo ya está registrado',
        usuarios_cedula_cuenta_unica: 'Ya hay un chofer con esa cédula',
        viajes_un_abierto_por_vehiculo: 'Ya hay un viaje abierto en este vehículo. Termínalo antes de empezar otro.',
        viaje_producto_unico: 'Cada producto va una sola vez por viaje',
      };
      return res.status(409).json({ error: mensajes[pgErr.constraint] || 'Ese dato ya está registrado' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  });
  return app;
}
