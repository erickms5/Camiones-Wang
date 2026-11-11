# Auditoría previa a la iteración 2

Fecha: 2026-11-10 · Rama: `iteracion-2` (desde `main` en `47970a7`) · No se modificó código en este paso.

## a) Stack, estructura y comandos

| Parte | Tecnología | Dónde |
|---|---|---|
| App (PWA) | HTML + JavaScript sin compilar; Tailwind, FontAwesome y pdf.js por CDN; Three.js en `vendor/` | `public/` → Cloudflare Workers (`app.camiones-wang.workers.dev`) |
| Servidor | Node.js 22, Express 5, Drizzle ORM, Zod | `api/` → Render (`mi-trailer-api.onrender.com`) |
| Base de datos | PostgreSQL (PGlite en pruebas y en desarrollo local) | Render (plan gratuito) |

Comandos (desde la carpeta principal):

- `npm run dev` → servidor en `localhost:3000` (sin `DATABASE_URL` usa `api/datos-locales`).
- `npm run app` → app en `localhost:8790`.
- `npm test` → pruebas de la app (`tests/`) y de la API (`api/test/`, con PGlite).
- `npm run deploy` → publica `public/` (en la práctica Cloudflare publica solo al unir a `main`).
- **No existe paso de build** (la app son archivos estáticos) **ni linter**. Ver «Desviaciones».

## b) Cómo está modelado hoy el mantenimiento

- **Un solo trabajo por registro.** La tabla `mantenimientos` tiene dos textos obligatorios: `parte` (p. ej.
  «Frenos - Eje 2 Remolque») y `trabajo` (p. ej. «Cambio de zapatas»), más fecha, km, taller, repuestos, formas de
  pago y notas.
- Relación con las partes: **por texto**. Existe la tabla `mantenimiento_componentes` (mantenimiento ↔ componente),
  pero ninguna ruta la llena. `unidad_id` apunta al cabezal/camión o al tanquero según la parte; `vehiculo_id` es
  siempre el cabezal o camión (por él ve el dueño).
- En el teléfono (`index.html`, clase `TrailerApp`): un formulario con tres listas (parte → eje → trabajo) y el
  registro se guarda en `localStorage` (`mi_trailer_maint`) con `parte` y `trabajo`.
- No hay edición ni baja de mantenimientos en el servidor: lo enviado no se borra desde el teléfono.

## c) Cómo se generan y congelan los reportes

- `POST /reportes` (`api/src/rutas/reportes.js`): toma los mantenimientos del chofer en el vehículo (mensual: los
  del mes que aún no están en otro reporte; individual: uno solo), arma `datos` (chofer, vehículo, mantenimientos y
  sus evidencias), calcula **SHA-256** sobre el JSON con claves ordenadas, asigna **folio** (`REP-AAAA-NNN` /
  `IND-AAAA-NNN`) y guarda todo en `reportes.datos`. En el mensual marca los mantenimientos con `bloqueado` y
  `reporte_id`.
- `GET /reportes/:folio` devuelve el reporte, verifica la huella y agrega aparte las evidencias subidas después
  («anexos»).
- La hoja se dibuja en `public/js/reporte.js` (misma para chofer y dueño), con fotos y páginas de PDF dentro.
- El corte de mes usa la fecha del registro (texto `AAAA-MM-DD`); «mes futuro» se compara con la hora del servidor
  (UTC) con un día de margen.

## d) Catálogo de tipos de trabajo

- Vive en `public/js/catalogo.js` (archivo de configuración compartido por la app y el servidor), constante
  `TRABAJOS`, **por clase de parte** (motor, caja, embrague, diferencial, enfriamiento, aire, suspensión, dirección,
  eléctrico, cabina, quinta, eje, llantas, frenos, compartimento, válvulas, enganche, seguridad, general) más
  trabajos propios por modelo. Son textos sin identificador.
- Contenido revisado: el vocabulario ya es de camión pesado («Cambio de zapatas», «Regulación de frenos»,
  «Cambio de pulmones de freno»). No aparece «pastillas». Faltan «Revisión de tanque de aire» y «Cambio de líquido
  de frenos». En compartimentos existe «Limpieza interna» (la limpieza queda fuera de esta iteración).
- No coincide con los ocho grupos pedidos (Motor, Caja, Frenos, Ejes y llantas, Suspensión, Sistema eléctrico,
  Tanque y válvulas, General).

## e) Evidencias, sin conexión y sincronización

- **Evidencias**: el archivo se guarda en el teléfono (IndexedDB, `js/evidencias.js`) con fecha y hora. En el
  servidor: `POST /mantenimientos/:id/evidencias` crea el registro y `PUT /evidencias/:id/archivo` sube el contenido
  (máx. 10 MB; JPG, PNG, WEBP, HEIC o PDF), que queda en PostgreSQL (tabla `archivos`). Toda evidencia pertenece hoy
  a un mantenimiento (`mantenimiento_id` obligatorio).
- **Sin conexión**: todo se guarda primero en `localStorage` y entra a una cola (`mi_trailer_pendientes`). El
  service worker (`sw.js`) sirve los archivos de la app sin señal.
- **Sincronización**: `js/sincronizacion.js` recorre la cola al recuperar señal, cada 60 s y al abrir. Los
  identificadores se generan en el teléfono y `POST /mantenimientos` es idempotente por `id` (sin duplicados). Lo
  que el servidor rechaza pasa a `mi_trailer_rechazados` y no bloquea la cola.

## f) Desviaciones respecto a `docs/requisitos/`

1. **`docs/requisitos/` no existe en el repositorio.** No hay documentación de requisitos contra la cual comparar.
   Fuente de verdad usada: `CLAUDE.md` (reglas decididas por el dueño del proyecto) y el encargo de esta iteración.
   *Duda real: falta que se entregue esa documentación.*
2. El encargo dice «un trailer es siempre cabezal + remolque». **La flota real tiene además dos camiones rígidos**
   (Hino GH y Chevrolet FVR, tanque sobre el chasis, sin remolque). Se mantiene el modelo actual: «vehículo» =
   cabezal con su tanquero **o** camión; placa y km en el cabezal/camión.
3. El encargo excluye «varios trailers» y «roles». **Ya existen en producción** (administrador, dueño, chofer;
   varios vehículos y varios dueños). No se tocan ni se amplían.
4. El encargo pide no tocar el service worker. `CLAUDE.md` obliga a subir la versión de `CACHE` al cambiar
   `public/`; sin eso los teléfonos no reciben la versión nueva. Se hace **solo** eso (versión y lista de archivos).
5. No hay linter ni build. Se agrega `npm run lint` (revisión de sintaxis de todos los `.js`); no se introduce un
   empaquetador (sería cambio de stack).
6. No existe `AGENTS.md`; la guía del proyecto es `CLAUDE.md`. Se crea `AGENTS.md` como resumen que remite a ella.
7. Mantenimientos: un solo trabajo por registro (el encargo pide varios). No hay filtros por parte ni por trabajo.
8. No existen viajes, tanqueos ni lugares.
9. Fechas: el servidor compara «futuro» en UTC; el encargo pide UTC-5.
10. Accesibilidad: hay textos de 10–12 px y botones menores a 56 px en historial y reportes (se trata en el bloque 2).
11. Mantenimientos con fecha pasada: el selector ya los admite y rechaza futuras, pero no hay atajos («Ayer»…) y el
    aviso de km menor es una pregunta, no un aviso (bloque 2).

## g) Plan de commits

Bloque 1
1. `docs:` auditoría y registro de decisiones.
2. `feat(mantenimiento):` varios trabajos por visita — tabla `mantenimiento_trabajos`, migración de los existentes,
   catálogo por grupos en un archivo de configuración, API y filtros.
3. `feat(mantenimiento):` pantalla «¿Qué se hizo?» con casillas por parte, contador y «Lo mismo que la última vez».
4. `feat(viajes):` modelo y API de viajes, lugares y tanqueos (uno abierto por vehículo, sin duplicados, auditoría).
5. `feat(viajes):` pantallas del chofer: nuevo viaje por pasos, viaje abierto, terminar, viaje pasado, historial,
   «Copiar mensaje».
6. `feat(tanqueos):` botón «Tanqueé» e historial.
7. `feat(reportes):` sección «Viajes», «Tanqueos fuera de viaje», reporte individual de viaje y congelado.
8. `chore:` `npm run lint`, `AGENTS.md`, README y guía al día.

Bloque 2
9. `fix(mantenimiento):` atajos de fecha y registro retroactivo sin bloqueo.
10. `fix(accesibilidad):` tamaños de texto y de botones, teclado numérico, textos junto a íconos.
11. `fix:` desviaciones restantes de esta auditoría.

## Estado de las desviaciones al cerrar el bloque 2

| N.º | Desviación | Estado |
|---|---|---|
| 1 | `docs/requisitos/` no existe | **Pendiente**: falta que se entregue la documentación. |
| 2 | «Siempre cabezal + remolque» frente a camiones rígidos | Resuelta por decisión D2 (se mantiene la flota real). |
| 3 | Roles y varios vehículos ya en producción | Sin cambios (D3). |
| 4 | Service worker | Solo versión y lista de archivos (D4). |
| 5 | Sin linter ni build | `npm run lint` agregado; sin build (D5). |
| 6 | Sin `AGENTS.md` | Creado. |
| 7 | Un solo trabajo por mantenimiento; sin filtros | Corregido en el bloque 1. |
| 8 | Sin viajes, tanqueos ni lugares | Corregido en el bloque 1. |
| 9 | Fechas en UTC | Corregido: hora de Ecuador en servidor y app (D10, D28). |
| 10 | Textos pequeños y botones bajos | Corregido en la app del chofer (`public/css/accesible.css`); paneles sin cambios (D31). |
| 11 | Fecha pasada sin atajos; km menor como pregunta | Corregido: «Cambiar fecha» con atajos y registro retroactivo sin bloqueo. |
