# Camiones Wang · Registro de unidades

Prototipo web (PWA) del módulo de registro de vehículo y conductor: cabezal, tanquero con compartimentos y conductor.
Funciona sin internet y guarda los datos en el teléfono.

**Web:** https://app.camiones-wang.workers.dev

## Estructura

```
public/               ← todo lo que se publica
  index.html
  css/app.css
  js/app.js           pantallas y asistente de registro
  js/plantillas.js    tipos de unidad (agregar un tipo = agregar una plantilla)
  js/catalogo.js      catálogo interno de modelos e intervalos de mantenimiento (no visible)
  js/validaciones.js  placa, cédula, teléfono, compartimentos
  js/textos.js        todos los mensajes
  js/config.js        decisiones abiertas D1–D5
  js/store.js         almacenamiento local
  js/consultas.js     consultas de datos (unidades, acoples, km, intervalos)
  js/vista.js         panel de control con el camión en 3D (sensores simulados con aviso)
  vendor/             Three.js 0.160 (licencia MIT), guardado localmente para funcionar sin internet
  sw.js               funcionamiento sin conexión
tests/                pruebas de validaciones
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
