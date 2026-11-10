# API de Mi Trailer (Node.js + PostgreSQL)

Servidor para choferes y dueños: unidades con su árbol de partes (ejes → llantas y frenos),
mantenimientos, facturas con fecha y hora de subida, y reportes congelados con hash SHA-256.

## Puesta en marcha

```bash
cp .env.example .env     # poner ADMIN_EMAIL y ADMIN_CLAVE
npm install
npm run dev              # aplica migraciones y arranca en http://localhost:3000
```

Sin `DATABASE_URL` (solo en desarrollo) usa una base local en `datos-locales/`: no hace falta instalar PostgreSQL.

## Pruebas

```bash
npm test
```

Usan PostgreSQL en memoria (PGlite): no necesitan la base instalada.

## Cambiar la base de datos

1. Editar `src/db/esquema.js`
2. `npm run db:generar` → crea el SQL en `drizzle/`
3. Revisar el SQL y subirlo con el resto del cambio

## Roles

- **Administrador**: su cuenta sale de `ADMIN_EMAIL` y `ADMIN_CLAVE` (se crea al arrancar; `ADMIN_RESTABLECER=si` restablece la contraseña). Crea empresas y dueños, registra y corrige vehículos, decide de quién es cada uno y pone contraseñas nuevas. No ve mantenimientos, facturas ni reportes.
- **Dueño**: lo crea el administrador. Ve solo los vehículos de los que es dueño (un vehículo puede tener varios dueños). Pone o corrige el km, asigna choferes, registra choferes, ve mantenimientos y reportes, y marca como pagado lo que quedó a crédito.
- **Chofer**: lo registra el dueño. Ve su vehículo asignado (y el tanquero enganchado), registra mantenimientos con sus facturas y formas de pago, y emite sus reportes.

Nadie crea su propia cuenta. Las contraseñas se guardan con scrypt. Cambiar la contraseña o desactivar a alguien cierra sus sesiones.

## Flota

Los vehículos se registran eligiendo un modelo de `public/js/catalogo.js` (cabezal con tanquero o camión con el tanque encima); el servidor arma ejes, llantas, frenos y compartimentos. Con la base vacía, `src/flota-inicial.js` deja registrada la flota del primer cliente con el km pendiente.

## Kilometraje

Puede quedar pendiente al registrar. Solo el dueño (o el administrador, a pedido) lo pone o corrige con motivo; después **sube solo con el km de cada mantenimiento**. Los trabajos del tanquero cuentan para el cabezal enganchado.

## Rutas principales

| Método | Ruta | Quién |
|---|---|---|
| POST | `/auth/entrar`, `/auth/clave`, `/auth/salir` · GET `/auth/yo` | todos |
| GET/POST/PATCH/PUT | `/admin/cuentas`, `/admin/cuentas/:id` (`/duenos`, `/vehiculos`), `/admin/usuarios/:id`, `/admin/unidades/:id` (`/propietarios`, `/km`, `/asignar`, `/acoplar`) | administrador |
| GET | `/flota` · POST `/vehiculos` | dueño |
| GET/POST/PATCH | `/choferes` | dueño |
| GET | `/unidades`, `/unidades/:id` | dueño y chofer |
| POST | `/unidades/:id/km`, `/acoplar`, `/asignar` | dueño |
| PATCH | `/unidades/componentes/:id` (ficha de llanta o freno) | dueño y chofer |
| GET/POST | `/mantenimientos` (`?porPagar=si`, `?vehiculo=`) · GET `/mantenimientos/:id` | dueño y chofer |
| POST | `/mantenimientos/:id/pagos` (marcar un crédito como pagado) | dueño |
| POST | `/mantenimientos/:id/evidencias` → PUT/GET `/evidencias/:id/archivo` | dueño y chofer |
| GET/POST | `/reportes` · GET `/reportes/:folio` (incluye anexos posteriores) | dueño y chofer |
