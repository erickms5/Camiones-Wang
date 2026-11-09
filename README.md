# Camiones Wang · Registro de unidades

Prototipo web (PWA) del módulo de registro de vehículo y conductor: cabezal, tanquero con compartimentos y conductor.
Funciona sin internet y guarda los datos en el teléfono.

**Web:** https://app.camiones-wang.workers.dev

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
  sw.js               funcionamiento sin conexión
tests/                pruebas de validaciones y catálogo
wrangler.jsonc        configuración de Cloudflare Workers
```

## Trabajar en local

No necesita instalar dependencias.

```bash
python3 -m http.server 8790 -d public
```

Abrir http://localhost:8790

Pruebas:

```bash
node --test tests/
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
