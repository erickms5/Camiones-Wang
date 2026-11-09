// Almacenamiento de archivos de evidencias (misma interfaz para disco, base de datos o, más adelante, R2).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { archivos } from './db/esquema.js';
import path from 'node:path';

export function crearAlmacenDisco(carpeta) {
  const ruta = (clave) => {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(clave)) throw new Error('Clave de archivo no válida');
    return path.join(carpeta, clave);
  };
  return {
    async guardar(clave, datos) {
      await mkdir(path.dirname(ruta(clave)), { recursive: true });
      await writeFile(ruta(clave), datos);
    },
    leer: (clave) => readFile(ruta(clave)),
  };
}

export function crearAlmacenMemoria() {
  const m = new Map();
  return { guardar: async (k, d) => void m.set(k, Buffer.from(d)), leer: async (k) => m.get(k) };
}

// En PostgreSQL (tabla archivos). Si no está ahí, busca en la carpeta de disco (archivos subidos antes del cambio).
export function crearAlmacenBD(db, carpetaAnterior) {
  const disco = carpetaAnterior ? crearAlmacenDisco(carpetaAnterior) : null;
  return {
    async guardar(clave, datos) {
      await db.insert(archivos).values({ clave, datos: Buffer.from(datos) }).onConflictDoUpdate({ target: archivos.clave, set: { datos: Buffer.from(datos) } });
    },
    async leer(clave) {
      const [fila] = await db.select().from(archivos).where(eq(archivos.clave, clave));
      if (fila) return Buffer.from(fila.datos);
      return disco ? disco.leer(clave).catch(() => null) : null;
    },
  };
}
