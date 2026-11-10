// Cuenta del administrador. No se crea desde la app: sale de las variables ADMIN_EMAIL y ADMIN_CLAVE
// del servidor, así nadie puede fabricarse una desde internet.
import { eq } from 'drizzle-orm';
import { sesiones, usuarios } from './db/esquema.js';
import { hashClave } from './seguridad.js';

export async function asegurarAdmin(db, config) {
  if (!config.adminEmail || !config.adminClave) {
    console.log('Sin ADMIN_EMAIL y ADMIN_CLAVE: no se crea la cuenta de administrador');
    return null;
  }
  if (config.adminClave.length < 10) throw new Error('ADMIN_CLAVE debe tener al menos 10 caracteres');
  const [existe] = await db.select().from(usuarios).where(eq(usuarios.email, config.adminEmail));
  if (existe) {
    if (existe.rol !== 'admin') throw new Error('ADMIN_EMAIL ya pertenece a un dueño o chofer: usa otro correo');
    // La contraseña se cambia desde su panel y no se pisa en cada arranque. Si se olvidó: ADMIN_RESTABLECER=si
    if (config.adminRestablecer) {
      await db.update(usuarios).set({ claveHash: hashClave(config.adminClave), intentosFallidos: 0, bloqueadoHasta: null, activo: true }).where(eq(usuarios.id, existe.id));
      await db.delete(sesiones).where(eq(sesiones.usuarioId, existe.id));
      console.log('Contraseña del administrador restablecida (quita ADMIN_RESTABLECER para que no se repita)');
    }
    return existe;
  }
  const [admin] = await db.insert(usuarios).values({ email: config.adminEmail, nombre: config.adminNombre, rol: 'admin', claveHash: hashClave(config.adminClave) }).returning();
  console.log(`Cuenta de administrador creada: ${admin.email}`);
  return admin;
}
