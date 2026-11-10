// Arranque del servidor: npm run dev (desarrollo) o npm start (producción)
import { leerConfig } from './config.js';
import { conectar } from './db/conexion.js';
import { crearApp } from './app.js';
import { crearSeguridad } from './seguridad.js';
import { crearAlmacenBD } from './almacen.js';
import { asegurarAdmin } from './administrador.js';
import { asegurarFlotaInicial } from './flota-inicial.js';

const config = leerConfig();
// Sin DATABASE_URL en desarrollo: base de datos local en una carpeta (no hace falta instalar PostgreSQL)
const { db, migrar } = await conectar(config.baseDatos || (config.prod ? '' : 'pglite:./datos-locales'));
await migrar();
const admin = await asegurarAdmin(db, config);
await asegurarFlotaInicial(db, config, admin);
const app = crearApp({
  db, config, seguridad: crearSeguridad(config), almacen: crearAlmacenBD(db, config.carpetaArchivos),
});
app.listen(config.puerto, () => console.log(`API de Mi Trailer en http://localhost:${config.puerto}`));
