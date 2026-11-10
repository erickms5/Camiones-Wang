// Flota del primer cliente: queda registrada al arrancar el servidor por primera vez (base sin empresas),
// con el kilometraje que dio el cliente o pendiente para que lo ponga el dueño. No crea cuentas de personas:
// el administrador crea las de los dueños y marca de quién es cada vehículo.
// Para otro cliente se usa el panel del administrador (Nueva empresa → Registrar vehículo).
import { count } from 'drizzle-orm';
import { cuentas } from './db/esquema.js';
import { crearVehiculo, esquemaVehiculo } from './flota.js';

export const FLOTA_INICIAL = {
  empresa: 'Camiones Wang',
  vehiculos: [
    { modeloId: 'freightliner-columbia-2020', placa: 'ZAA-2010', anio: 2020, motor: 'Cummins ISX 500', kmInicial: 300630 }, // km dado por el cliente
    { modeloId: 'hino-gh-2010', placa: 'LBA-2603', anio: 2010 },
    { modeloId: 'chevrolet-fvr-2011', placa: 'LBA-5785', anio: 2011 },
  ],
};

export async function asegurarFlotaInicial(db, config, admin) {
  if (config.sinFlotaInicial) return null;
  const [{ n }] = await db.select({ n: count() }).from(cuentas);
  if (n > 0) return null; // ya hay empresas: no se toca nada
  const cuenta = await db.transaction(async (tx) => {
    const [c] = await tx.insert(cuentas).values({ nombre: config.flotaEmpresa || FLOTA_INICIAL.empresa }).returning();
    for (const v of FLOTA_INICIAL.vehiculos) {
      await crearVehiculo(tx, { cuentaId: c.id, usuarioId: admin?.id ?? null, datos: esquemaVehiculo.parse(v), duenos: [] });
    }
    return c;
  });
  console.log(`Flota inicial registrada en «${cuenta.nombre}»: ${FLOTA_INICIAL.vehiculos.map((v) => v.placa).join(', ')} `);
  return cuenta;
}
