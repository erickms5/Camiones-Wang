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
  app.set('trust proxy', 1);
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
  const limiteAuth = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.prod ? 20 : 1000, standardHeaders: 'draft-8', legacyHeaders: false });

  const ctx = { ...dep, autenticado, soloDueno };
  app.get('/salud', (_req, res) => res.json({ ok: true }));
  app.use('/auth', limiteAuth, rutasAuth(ctx));
  app.use('/choferes', autenticado, rutasChoferes(ctx));
  app.use('/unidades', autenticado, rutasUnidades(ctx));
  app.use('/', autenticado, rutasMantenimientos(ctx));
  app.use('/reportes', autenticado, rutasReportes(ctx));

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
      };
      return res.status(409).json({ error: mensajes[pgErr.constraint] || 'Ese dato ya está registrado' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  });
  return app;
}
