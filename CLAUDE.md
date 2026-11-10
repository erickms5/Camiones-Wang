# Mi Trailer (Camiones Wang) — guía para Claude

App de mantenimientos para choferes de tráiler (cabezal + remolque) en Ecuador. El primer cliente es un
chofer mayor que maneja un **Freightliner Columbia** con un **tanquero de 10.000 galones**
(compartimentos 3.000 · 2.000 · 2.000 · 3.000, del cabezal hacia atrás). El dueño del camión revisa
los reportes de sus choferes.

Idioma: todo (código, comentarios, textos, commits) en **español**. Respuestas al usuario en español,
cortas y sin jerga técnica: el dueño del proyecto (Erick) no es programador de backend.

## Arquitectura

```
public/   → app web (PWA) publicada en Cloudflare Workers: https://app.camiones-wang.workers.dev
api/      → servidor Node.js 22 (Express 5 + Drizzle ORM + PostgreSQL) — se publica en Render
render.yaml → Blueprint de Render (servidor + base de datos)
wrangler.jsonc → publicación de public/ en Cloudflare
```

### Frontend (`public/`)
- `index.html` es la **demo «Mi Trailer» que entregó el usuario, casi tal cual** (Tailwind y
  FontAwesome por CDN, clase `TrailerApp`, datos en `localStorage` con claves `mi_trailer_*`).
  **Regla del usuario: no rehacerla.** Los cambios se integran con lo mínimo (editar en su lugar o
  envolver métodos de `window.app` desde módulos aparte). «Ahorrar recursos» = cambios pequeños.
- `js/sincronizacion.js`: conecta la demo con la API. Pantalla de ingreso (correo + contraseña),
  cola sin conexión (`mi_trailer_pendientes`), envío de mantenimientos, facturas y fichas de llantas
  y frenos, reportes emitidos en el servidor. Envuelve métodos de `app` (handleSaveMaintenance,
  reportes, logout, switchView, getMaxKm).
  - `API_PRODUCCION` está **vacío** hasta publicar el servidor: sin servidor, la web pública queda en
    modo demostración local. En `localhost` usa `http://localhost:3000`.
  - `SERVIDORES_PERMITIDOS`: la dirección del servidor solo puede ser una de la lista (seguridad: un
    enlace `?api=` no puede desviar sesiones). Al publicar en Render, poner la URL en `API_PRODUCCION`.
- `camion3d.html` + `js/camion3d.js` + `js/vista.js`: camión 3D (Three.js 0.160 en `vendor/`)
  **incrustado en la pantalla principal** con un iframe (`?embebido=1`). Cada eje, llanta y freno se
  toca; cada llanta/freno tiene ficha (se guarda en `mi_trailer_detalles` y se sincroniza). Sin
  telemetría ni diagnóstico (el usuario los pidió quitar).
- `dueno.html` + `js/dueno.js`: panel del dueño (reportes de choferes con imágenes de facturas,
  registrar choferes con contraseña, camiones, enganchar, asignar, poner/corregir km).
- `js/evidencias.js`: fotos/PDF de facturas en IndexedDB con fecha y hora de subida (salen en el reporte).
- `consultas.js, store.js, plantillas.js, validaciones.js, textos.js, config.js, catalogo.js`: módulos
  de la primera versión que siguen en uso por el 3D y por la API (validación de cédula, placa, teléfono;
  catálogo interno de modelos e intervalos).
- `sw.js`: funcionamiento sin conexión. **Al cambiar archivos de `public/`, subir la versión de `CACHE`.**

### Backend (`api/`) — ver `api/README.md`
- Roles: **dueño** (crea su cuenta, registra choferes y camiones, ve reportes de todos sus choferes)
  y **chofer** (lo registra el dueño; ve solo sus unidades asignadas).
- Ingreso con **correo + contraseña** (scrypt). Sin envío de correos (el usuario lo pidió quitar).
  El dueño pone/cambia la contraseña del chofer. Pausa de 15 min tras 8 fallos (atómica).
- Cédula cifrada AES-256-GCM (`CEDULA_CLAVE`, no cambiarla nunca en producción) + HMAC para duplicados.
- Árbol de partes por unidad: ejes → llantas (sencillas adelante, dobles atrás) y frenos; compartimentos.
- Facturas guardadas en PostgreSQL (tabla `archivos`): Render gratuito no tiene disco fijo.
- Reportes congelados con folio y SHA-256 real; lo agregado después entra como anexo.
- Migraciones: editar `src/db/esquema.js` → `npm run db:generar` → revisar el SQL en `drizzle/`.
  El servidor aplica las migraciones al arrancar.

## Reglas de negocio (decididas por el usuario — respetarlas)
- **Kilometraje**: se pide al registrar el cabezal pero **puede quedar pendiente**. **Solo el dueño**
  lo pone o lo corrige (`POST /unidades/:id/km` con motivo, queda en auditoría). Después **sube solo
  con el km de cada mantenimiento**; nunca baja por un mantenimiento atrasado. Con km pendiente, un
  mantenimiento del chofer **no** fija el punto de partida. Saltos de más de 60.000 km se rechazan
  (error de tipeo), en el servidor y en el teléfono.
- El km pertenece al **cabezal**; los trabajos del remolque cuentan para el cabezal enganchado.
- **Ejes por separado**: cabezal = Eje delantero (2 llantas) + Eje trasero 1 y 2 (4 llantas c/u);
  tanquero = Eje 1, 2, 3 (4 llantas c/u) → 22 llantas en total. **Llantas** y **Frenos** son además
  categorías: al registrar se elige el eje (o «Todos los ejes») → se guarda «Frenos - Eje 2 Remolque».
- Compartimento 1 = el de adelante (junto al cabezal).
- No mostrar datos de ejemplo/inventados como si fueran reales.

## Comandos (desde la carpeta principal)

```bash
npm run dev    # servidor en http://localhost:3000 (necesita PostgreSQL local y api/.env)
npm run app    # app en http://localhost:8790
npm test       # pruebas de la app (tests/) y de la API (api/test, con PGlite: no necesita PostgreSQL)
npm run deploy # publica public/ en Cloudflare (requiere `npx wrangler login`)
```

Primera vez en un equipo nuevo:
```bash
npm --prefix api install
cp api/.env.example api/.env
# PostgreSQL local: api/scripts/instalar-postgres.sh (CachyOS/Arch; en otro sistema instalar PostgreSQL
# y crear usuario/base «mitrailer» con contraseña «mitrailer_dev», como dice api/.env.example)
```
La base local empieza vacía: crear una cuenta de dueño desde la app («¿Eres dueño…? Créala aquí»),
luego choferes y camiones desde su panel.

El navegador integrado de Claude Code no tiene WebGL: para ver el 3D usar Chromium headless con
`--use-angle=swiftshader --enable-unsafe-swiftshader --screenshot`.

## Estado y pendientes (actualizar al terminar cada tarea)
- [x] App conectada a la API con cola sin conexión; panel del dueño; reportes con facturas.
- [ ] **Publicar el servidor en Render**: el usuario crea el Blueprint (New → Blueprint → este repo →
      Apply). Luego: poner la URL en `API_PRODUCCION` (`public/js/sincronizacion.js`), subir `CACHE`
      en `sw.js`, `npm run deploy`, y probar ingreso real en la web pública.
- [ ] Antes de datos reales del cliente: pasar la base y el servidor de Render a plan pagado (la base
      gratuita se borra a los ~30 días y el servidor gratuito se duerme).
- [ ] Registrar en producción el camión de prueba real: cabezal **ZAA-2010** Freightliner Columbia,
      motor Cummins ISX 500, 3 ejes, km pendiente; tanquero 3 ejes, compartimentos 3000/2000/2000/3000
      (**falta su placa**, preguntarla al usuario). El usuario crea la cuenta del chofer.
- [ ] Compilar Tailwind y FontAwesome dentro del proyecto (hoy por CDN: sin señal la demo pierde estilos).
- [ ] Recuperación de contraseña del dueño (hoy solo se puede cambiar en la base de datos).
- [ ] Opción para editar datos de un camión (año, motor) desde el panel del dueño.
- [ ] La tabla `codigos_acceso` ya no se usa (quedó del ingreso por código); se puede borrar.

## Cómo trabajar
- Ramas + Pull Request a `main`. Publicar en Cloudflare solo desde `main`.
- Commits en español, descriptivos; terminar con la línea de coautor que indique Claude Code.
- Correr `npm test` antes de subir. Agregar pruebas en `api/test/api.test.js` para reglas nuevas.
- Escapar todo texto antes de meterlo en HTML (helpers `esc`); nunca confiar en datos del usuario.
- No hacer commits de `api/.env` ni de claves.
