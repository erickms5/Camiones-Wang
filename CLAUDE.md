# Mi Trailer (Camiones Wang) — guía para Claude

App de mantenimientos para una compañía de transporte de combustible en Ecuador: **todos los vehículos
son tanqueros**. Tres roles: **administrador** (soporte: Erick), **dueño** (uno o varios por vehículo) y
**chofer**. Flota del primer cliente (ya queda registrada sola, ver `api/src/flota-inicial.js`):

| Placa | Vehículo | Tipo | Compartimentos (de adelante hacia atrás) |
|---|---|---|---|
| ZAA-2010 | Freightliner Columbia 2020 | cabezal + tanquero (remolque) | 3000 · 2000 · 2000 · 3000 = 10.000 gal |
| LBA-2603 | Hino GH 2010 | camión con el tanque encima | 1000 · 2000 · 1000 = 4.000 gal |
| LBA-5785 | Chevrolet FVR 2011 | camión con el tanque encima | 1000 · 1000 · 1000 · 1000 = 4.000 gal |

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
- `index.html` es la **demo «Mi Trailer» que entregó el usuario**, con menú lateral desplegable (☰ a la
  izquierda; fijo en pantallas grandes): Inicio · Mi camión · Historial · Reportes · Mi cuenta.
  Sigue siendo la clase `TrailerApp` con datos en `localStorage` (`mi_trailer_*`). **Regla del usuario:
  no rehacerla**: cambios mínimos, en su lugar o envolviendo métodos de `window.app` desde módulos.
- `js/catalogo.js`: **catálogo de la flota** (lo usan la app y el servidor). Cada modelo define tipo
  (`tracto` = cabezal con tanquero, `camion` = tanque sobre el chasis), ejes, compartimentos, intervalos
  y trabajos propios. `partesDe`, `ejesDe`, `trabajosDe` arman las partes y los trabajos típicos de cada
  vehículo. **Agregar un modelo = agregar un objeto a `MODELOS`.** Se expone como `window.Flota`.
- `js/sincronizacion.js`: conecta la demo con la API. Ingreso (correo + contraseña; sin registro propio),
  cola sin conexión (`mi_trailer_pendientes`), envío de mantenimientos, facturas y fichas, y refresco del
  vehículo/km al abrir. Dueño y administrador pasan a su panel.
  - `API_PRODUCCION` está **vacío** hasta publicar el servidor (la web pública queda en modo local).
  - `SERVIDORES_PERMITIDOS`: la dirección del servidor solo puede ser una de la lista.
- `js/reporte.js` + `css/reporte.css`: **hoja del reporte** compartida por chofer y dueño, siempre desde
  los datos congelados del servidor. Las fotos van dentro del reporte; cada factura en PDF se dibuja
  página por página (pdf.js por CDN) como hojas adicionales. «Imprimir / PDF» copia la hoja a
  `#zona-impresion`.
- `js/reportes-chofer.js`: sección Reportes del chofer: elige el mes, emite el reporte y consulta los ya
  emitidos de cualquier mes.
- `camion3d.html` + `js/camion3d.js` + `js/vista.js`: camión 3D (Three.js en `vendor/`) dentro de «Mi
  camión»; se carga recién al abrir esa sección. Dibuja el cabezal con tanquero o el camión rígido según
  el vehículo. Cada llanta/freno tiene ficha (`mi_trailer_detalles`, se sincroniza).
- `dueno.html` + `js/dueno.js`: panel del dueño: Inicio (pendientes) · Mis vehículos (km, chofer, tanque)
  · Choferes · **Por pagar** (créditos) · Mantenimientos · Reportes · Mi cuenta.
- `admin.html` + `js/admin.js`: panel del administrador: empresas, dueños, vehículos (registrar, corregir,
  dueños de cada uno, baja), contraseñas. No ve mantenimientos ni reportes.
- `js/panel.js` + `css/menu.css`: piezas comunes de los paneles (menú lateral, ventanas de formulario).
- `js/evidencias.js`: fotos/PDF de facturas en IndexedDB con fecha y hora de subida.
- `consultas.js, store.js, plantillas.js, validaciones.js, textos.js, config.js`: módulos de la primera
  versión que siguen en uso por el 3D y por la API.
- `sw.js`: funcionamiento sin conexión. **Al cambiar archivos de `public/`, subir la versión de `CACHE`.**

### Backend (`api/`) — ver `api/README.md`
- **Nadie crea su propia cuenta.** El administrador sale de `ADMIN_EMAIL` + `ADMIN_CLAVE` del servidor
  (`src/administrador.js`); él crea empresas y dueños (`/admin/...`); cada dueño crea sus choferes.
- **Empresas aisladas** (`cuentas`): agregar otra no toca las existentes. **Varios dueños por vehículo**
  (tabla `propietarios`): cada dueño ve solo sus vehículos, con sus mantenimientos y reportes
  (`src/flota.js` → `idsAccesibles`). El tanquero enganchado va con su cabezal.
- Vehículos solo desde el catálogo (`crearVehiculo`): arma ejes → llantas y frenos, y compartimentos.
  El tanquero no lleva placa propia: se identifica por la de su cabezal.
- `src/flota-inicial.js`: con la base vacía registra la flota del primer cliente (ZAA-2010 con 300.630 km, los otros con km pendiente; sin
  cuentas de personas). `FLOTA_INICIAL=no` la omite.
- Contraseñas con scrypt; pausa de 15 min tras 8 fallos. Cédula cifrada AES-256-GCM (`CEDULA_CLAVE`, no
  cambiarla nunca en producción) + HMAC para duplicados.
- Facturas guardadas en PostgreSQL (tabla `archivos`): Render gratuito no tiene disco fijo.
- Reportes congelados con folio y SHA-256; cada reporte es de un chofer en un vehículo. Lo agregado
  después se devuelve aparte como anexo. El de un solo trabajo no se duplica.
- Migraciones: editar `src/db/esquema.js` → `npm --prefix api run db:generar` → revisar el SQL en
  `drizzle/`. El servidor las aplica al arrancar.

## Reglas de negocio (decididas por el usuario — respetarlas)
- **Kilometraje**: se pide al registrar el cabezal pero **puede quedar pendiente**. **Solo el dueño**
  lo pone o lo corrige (`POST /unidades/:id/km` con motivo, queda en auditoría). Después **sube solo
  con el km de cada mantenimiento**; nunca baja por un mantenimiento atrasado. Con km pendiente, un
  mantenimiento del chofer **no** fija el punto de partida. Saltos de más de 60.000 km se rechazan
  (error de tipeo), en el servidor y en el teléfono.
- El km pertenece al **cabezal**; los trabajos del remolque cuentan para el cabezal enganchado.
- **Ejes por separado**: cabezal = Eje delantero (2 llantas) + Eje trasero 1 y 2 (4 c/u); su tanquero =
  Eje 1, 2, 3 (4 c/u) → 22 llantas. Camión rígido = Eje delantero (2) + Eje trasero (4) → 6 llantas.
  **Llantas** y **Frenos** son además categorías: al registrar se elige el eje (o «Todos los ejes»).
- **Un chofer maneja un vehículo a la vez**; al asignarlo a otro, el anterior queda sin chofer.
- **Formas de pago**: el taller y los repuestos se pagan por separado (efectivo, transferencia, cheque o
  crédito). Lo que queda a **crédito** le aparece al dueño en «Por pagar» hasta que lo marca como pagado.
- **Reportes**: el chofer emite el del mes que elija (solo entra lo que aún no está en otro reporte) y
  puede abrir e imprimir los de meses anteriores. No se crean reportes vacíos ni inventados.
- **Sin datos de ejemplo**: no crear cuentas, vehículos ni reportes de muestra.
- Compartimento 1 = el de adelante (junto al cabezal).
- **Cada cabezal tiene su tanquero fijo**: no se cambia ni se le pide placa; se identifica por la del cabezal.
- No mostrar datos de ejemplo/inventados como si fueran reales.

## Comandos (desde la carpeta principal)

```bash
npm run dev    # servidor en http://localhost:3000 (sin DATABASE_URL usa una base local en api/datos-locales)
npm run app    # app en http://localhost:8790
npm test       # pruebas de la app (tests/) y de la API (api/test, con PGlite: no necesita PostgreSQL)
npm run deploy # publica public/ en Cloudflare (requiere `npx wrangler login`)
```

Primera vez en un equipo nuevo:
```bash
npm --prefix api install
cp api/.env.example api/.env   # poner ADMIN_EMAIL y ADMIN_CLAVE (10+ caracteres); DATABASE_URL es opcional en local
```
Al arrancar con la base vacía quedan el administrador y la flota del cliente. Entrar como administrador →
Empresas → crear los dueños y marcar de quién es cada vehículo.

El navegador integrado de Claude Code no tiene WebGL: para ver el 3D usar Chromium headless con
`--use-angle=swiftshader --enable-unsafe-swiftshader --screenshot`.

## Estado y pendientes (actualizar al terminar cada tarea)
- [x] Roles administrador / dueño / chofer; varios dueños por vehículo; flota de tanqueros por modelo.
- [x] Menú lateral en la app del chofer y en los paneles; formas de pago y créditos por pagar.
- [x] Reportes desde el servidor con fotos y PDF dentro, imprimibles; reportes por mes.
- [ ] **Confirmar con el cliente**: que el «FBR» es Chevrolet **FVR**; que el Hino y el Chevrolet son de
      2 ejes (6 llantas); el motor de cada uno; y el nombre de
      la empresa (hoy «Camiones Wang», se cambia en el panel del administrador).
- [ ] **Publicar el servidor en Render**: crear el Blueprint (New → Blueprint → este repo → Apply) y
      poner `ADMIN_EMAIL` y `ADMIN_CLAVE` en sus variables. Luego: la URL en `API_PRODUCCION`
      (`public/js/sincronizacion.js`), subir `CACHE` en `sw.js`, `npm run deploy`, y entrar como
      administrador para crear las cuentas de los dueños.
- [ ] Antes de datos reales: pasar la base y el servidor de Render a plan pagado (la base gratuita se
      borra a los ~30 días y el servidor gratuito se duerme).
- [ ] Validar los intervalos de mantenimiento de cada modelo con su manual (hoy son referenciales).
- [ ] Compilar Tailwind, FontAwesome y pdf.js dentro del proyecto (hoy por CDN: sin señal se pierden).
- [ ] Probar en un teléfono real la impresión del reporte y el 3D de los camiones rígidos.

## Cómo trabajar
- Ramas + Pull Request a `main`. Publicar en Cloudflare solo desde `main`.
- Commits en español, descriptivos; terminar con la línea de coautor que indique Claude Code.
- Correr `npm test` antes de subir. Agregar pruebas en `api/test/api.test.js` para reglas nuevas.
- Escapar todo texto antes de meterlo en HTML (helpers `esc`); nunca confiar en datos del usuario.
- No hacer commits de `api/.env` ni de claves.
