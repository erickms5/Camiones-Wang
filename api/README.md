# API de Mi Trailer (Node.js + PostgreSQL)

Servidor para choferes y dueños: unidades con su árbol de partes (ejes → llantas y frenos),
mantenimientos, facturas con fecha y hora de subida, y reportes congelados con hash SHA-256.

## Puesta en marcha

```bash
bash scripts/instalar-postgres.sh   # una sola vez (CachyOS/Arch)
cp .env.example .env
npm install
npm run dev                         # aplica migraciones y arranca en http://localhost:3000
```

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

- **Dueño**: crea su cuenta con correo y contraseña (`POST /auth/registro`), registra choferes y unidades, ve los reportes de todos sus choferes.
- **Chofer**: lo registra el dueño con una contraseña que le entrega (y que puede cambiar si la olvida); entra con correo y contraseña; ve sus unidades asignadas, registra mantenimientos y genera sus reportes.

Las contraseñas se guardan con scrypt (nunca en texto). Cambiar la contraseña o desactivar a un chofer cierra sus sesiones.

## Kilometraje

Se pide al registrar el cabezal (puede quedar pendiente) y después **sube solo con el km de cada mantenimiento**. Solo el dueño puede ponerlo o corregirlo (`POST /unidades/:id/km` con motivo, queda en la auditoría); el chofer no. Los trabajos del remolque cuentan para el cabezal enganchado.

## Rutas principales

| Método | Ruta | Quién |
|---|---|---|
| POST | `/auth/registro`, `/auth/entrar`, `/auth/clave`, `/auth/salir` · GET `/auth/yo` | todos |
| GET/POST/PATCH | `/choferes` (PATCH: activar/desactivar o contraseña nueva) | dueño |
| GET/POST | `/unidades` · GET `/unidades/:id` | ambos |
| POST | `/unidades/:id/acoplar`, `/unidades/:id/asignar` | dueño |
| PATCH | `/unidades/componentes/:id` (ficha de llanta o freno) | ambos |
| GET/POST | `/mantenimientos` · GET `/mantenimientos/:id` | ambos (el chofer ve los suyos) |
| POST | `/mantenimientos/:id/evidencias` → PUT/GET `/evidencias/:id/archivo` | ambos |
| GET/POST | `/reportes` · GET `/reportes/:folio` | ambos (el dueño ve los de sus choferes) |
