// Conexión a PostgreSQL. En pruebas se usa PGlite (PostgreSQL dentro de Node, en memoria).
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migrarPg } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import * as esquema from './esquema.js';

const carpetaMigraciones = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function conectar(url) {
  if (!url) throw new Error('Falta DATABASE_URL (ej. postgres://mitrailer:mitrailer_dev@localhost:5432/mitrailer)');
  const pool = new pg.Pool({ connectionString: url, ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined });
  const db = drizzlePg(pool, { schema: esquema });
  return { db, migrar: () => migrarPg(db, { migrationsFolder: carpetaMigraciones }), cerrar: () => pool.end() };
}

export async function conectarMemoria() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const cliente = new PGlite();
  const db = drizzle(cliente, { schema: esquema });
  await migrate(db, { migrationsFolder: carpetaMigraciones });
  return { db, cerrar: () => cliente.close() };
}
