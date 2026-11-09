// Aplica las migraciones pendientes: npm run db:migrar
import { conectar } from './conexion.js';

const { migrar, cerrar } = await conectar(process.env.DATABASE_URL);
await migrar();
await cerrar();
console.log('Migraciones aplicadas');
