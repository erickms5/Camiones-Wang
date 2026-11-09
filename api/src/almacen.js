// Almacenamiento de archivos de evidencias. Hoy en disco; en producción se cambia por Cloudflare R2 (misma interfaz).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
