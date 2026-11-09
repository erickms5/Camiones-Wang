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

Sin SMTP configurado, los códigos de acceso se muestran en la consola.

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

- **Dueño**: crea su cuenta (`POST /auth/registro`), registra choferes y unidades, ve los reportes de todos sus choferes.
- **Chofer**: lo registra el dueño; entra con un código a su email; ve sus unidades asignadas, registra mantenimientos y genera sus reportes.

## Rutas principales

| Método | Ruta | Quién |
|---|---|---|
| POST | `/auth/registro`, `/auth/codigo`, `/auth/verificar`, `/auth/salir` · GET `/auth/yo` | todos |
| GET/POST/PATCH | `/choferes` | dueño |
| GET/POST | `/unidades` · GET `/unidades/:id` · POST `/unidades/:id/odometro` | ambos |
| POST | `/unidades/:id/acoplar`, `/unidades/:id/asignar` | dueño |
| PATCH | `/unidades/componentes/:id` (ficha de llanta o freno) | ambos |
| GET/POST | `/mantenimientos` · GET `/mantenimientos/:id` | ambos (el chofer ve los suyos) |
| POST | `/mantenimientos/:id/evidencias` → PUT/GET `/evidencias/:id/archivo` | ambos |
| GET/POST | `/reportes` · GET `/reportes/:folio` | ambos (el dueño ve los de sus choferes) |
