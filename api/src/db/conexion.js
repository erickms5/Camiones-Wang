// Conexión a PostgreSQL. En pruebas se usa PGlite (PostgreSQL dentro de Node, en memoria).
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migrarPg } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import * as esquema from './esquema.js';

const carpetaMigraciones = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function conectar(url) {
  if (!url) throw new Error('Falta DATABASE_URL (ej. postgres://mitrailer:mitrailer_dev@localhost:5432/mitrailer)');
  if (url.startsWith('pglite:')) return conectarMemoria(url.slice(7));
  // Con SSL siempre se verifica el certificado del servidor; PG_CA_CERT permite indicar la CA del proveedor
  const ssl = /sslmode=(require|verify-ca|verify-full)/.test(url)
    ? { rejectUnauthorized: true, ...(process.env.PG_CA_CERT ? { ca: process.env.PG_CA_CERT } : {}) }
    : undefined;
  const pool = new pg.Pool({ connectionString: url, ssl });
  const db = drizzlePg(pool, { schema: esquema });
  return { db, migrar: () => migrarPg(db, { migrationsFolder: carpetaMigraciones }), cerrar: () => pool.end() };
}

// PGlite: en memoria (pruebas) o en una carpeta local (desarrollo sin instalar PostgreSQL)
export async function conectarMemoria(carpeta) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const cliente = new PGlite(carpeta || undefined);
  if (carpeta) console.log(`Base de datos local en ${carpeta} (solo para desarrollo)`);
  const db = drizzle(cliente, { schema: esquema });
  const migrar = () => migrate(db, { migrationsFolder: carpetaMigraciones });
  if (!carpeta) await migrar();
  return { db, migrar, cerrar: () => cliente.close() };
}
