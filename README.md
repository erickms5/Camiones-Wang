# Camiones Wang · Mi Trailer

App de mantenimientos para choferes de tráiler (cabezal + tanquero) y panel para el dueño del camión.

- **App (web/PWA):** https://app.camiones-wang.workers.dev — hoy en modo demostración hasta publicar el servidor.
- **Servidor:** Node.js + PostgreSQL en la carpeta `api/` (se publica en Render con `render.yaml`).
- **Para Claude Code:** leer `CLAUDE.md` (reglas, estado y pendientes del proyecto).

## Qué hace
- **Chofer:** entra con correo y contraseña, ve su camión en 3D (cada eje, llanta y freno se toca),
  registra mantenimientos con fotos de facturas (con fecha y hora de subida) y genera reportes.
  Funciona sin señal: lo guarda en el teléfono y lo envía al volver la conexión.
- **Dueño:** registra choferes (con su contraseña) y camiones, engancha remolques, asigna choferes,
  pone o corrige el kilometraje y ve los reportes de todos sus choferes con sus facturas.

## Estructura

```
public/
  index.html          app «Mi Trailer» (demo de mantenimientos: registro, historial, reportes)
  camion3d.html       camión en 3D (va incrustado en la pantalla principal con ?embebido=1)
  js/evidencias.js    fotos y PDF de facturas guardadas en el teléfono (IndexedDB) con fecha y hora
  js/camion3d.js      arma los datos de la vista 3D a partir de la sesión de la demo
  js/vista.js         panel de control 3D (sensores simulados con aviso)
  js/catalogo.js      catálogo interno de modelos e intervalos de mantenimiento
  js/consultas.js, store.js, plantillas.js, validaciones.js, textos.js, config.js
  css/app.css         estilos de la vista 3D
  vendor/             Three.js 0.160 (licencia MIT), guardado localmente
render.yaml           servidor y base de datos en Render (Blueprint)
  sw.js               funcionamiento sin conexión
tests/                pruebas de validaciones y catálogo
wrangler.jsonc        configuración de Cloudflare Workers
```

## Trabajar en local

Desde la carpeta principal del proyecto, en dos terminales:

```bash
npm run dev   # servidor (API + PostgreSQL) en http://localhost:3000
npm run app   # la app en http://localhost:8790
```

La primera vez: `bash api/scripts/instalar-postgres.sh`, `cp api/.env.example api/.env` y `npm --prefix api install`.

Pruebas de todo:

```bash
npm test
```

## Cómo colaboramos

1. Antes de empezar: `git pull`
2. Crear una rama para el cambio: `git switch -c nombre-del-cambio`
3. Hacer commits y subir la rama: `git push -u origin nombre-del-cambio`
4. Abrir un Pull Request en GitHub. Cloudflare genera una URL de vista previa para revisarlo.
5. Al unir el PR a `main`, Cloudflare publica la web automáticamente.

Si cambias archivos en `public/`, sube la versión de `CACHE` en `public/sw.js` para que los teléfonos descarguen la nueva versión.

## Publicación

La publicación es automática desde `main` (Cloudflare Workers Builds conectado a este repositorio).
Publicación manual, si hace falta:

```bash
npx wrangler@4 deploy
```

## Iteración 2: visitas con varios trabajos, viajes y tanqueos

- **Mantenimiento = visita al taller.** En «¿Qué se hizo?» se marcan todos los trabajos de la visita, agrupados
  por parte (Motor, Caja, Frenos, Ejes y llantas, Suspensión, Sistema eléctrico, Tanque y válvulas, General). El
  catálogo está en `public/js/catalogo-trabajos.js`.
- **Viajes**: botón «Viaje» en el inicio. Tres pasos (datos, carga, kilometraje y guía); el viaje queda abierto con
  los botones «Tanqueé» y «Terminar viaje». En «Viajes y tanqueos» se pasan viajes ya terminados en una sola
  pantalla y se consulta el historial.
- **Tanqueos**: combustible que consume el camión; se ligan al viaje abierto o quedan en el vehículo.
- **Reportes**: el mensual agrega la sección «Viajes» (columnas de la bitácora de la compañía), «Tanqueos fuera de
  viaje» y los totales del mes. Hay reporte individual de viaje.
- Comandos: `npm run lint` (sintaxis) y `npm test`. Decisiones por defecto en `docs/DECISIONES.md`.
