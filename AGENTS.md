# Guía para agentes

La guía completa del proyecto está en [CLAUDE.md](CLAUDE.md): arquitectura, reglas de negocio decididas por el
dueño del proyecto, comandos y pendientes. Léela antes de cambiar algo.

Resumen de lo que más se rompe si se ignora:

- Todo en **español** (código, comentarios, textos, commits). Respuestas cortas y sin jerga.
- `public/index.html` es la demo entregada por el usuario: **no rehacerla**. Cambios mínimos en su lugar o desde
  módulos que envuelven `window.app`.
- Al cambiar `public/`, subir `CACHE` en `public/sw.js` y agregar ahí los archivos nuevos.
- **Sin datos de ejemplo** en ningún formulario ni en la base.
- «Carga» = producto del tanque; «Tanqueo» = combustible del camión. No mezclar.
- Catálogos y textos editables viven en archivos de configuración: `public/js/catalogo.js` (flota),
  `public/js/catalogo-trabajos.js` (trabajos por parte), `public/js/plantilla-mensaje.js` (mensaje del viaje).
- Reportes inmutables: copia de los datos + folio + SHA-256. Lo posterior entra como anexo.
- Todo funciona sin conexión: se guarda en el teléfono y se envía con la cola; los identificadores se crean en el
  teléfono para no duplicar.

Antes de subir: `npm run lint` y `npm test`. Ramas + Pull Request a `main`.

Decisiones tomadas por defecto: [docs/DECISIONES.md](docs/DECISIONES.md). Auditoría de la iteración 2:
[docs/auditoria-iteracion2.md](docs/auditoria-iteracion2.md).
