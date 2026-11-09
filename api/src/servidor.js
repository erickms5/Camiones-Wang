// Arranque del servidor: npm run dev (desarrollo) o npm start (producción)
import { leerConfig } from './config.js';
import { conectar } from './db/conexion.js';
import { crearApp } from './app.js';
import { crearSeguridad } from './seguridad.js';
import { crearCorreo } from './correo.js';
import { crearAlmacenDisco } from './almacen.js';

const config = leerConfig();
const { db, migrar } = await conectar(config.baseDatos);
await migrar();
const app = crearApp({
  db, config, seguridad: crearSeguridad(config), correo: crearCorreo(config.correo), almacen: crearAlmacenDisco(config.carpetaArchivos),
});
app.listen(config.puerto, () => console.log(`API de Mi Trailer en http://localhost:${config.puerto}`));
