# Decisiones tomadas por defecto

Cada decisión se tomó porque el encargo no lo definía o chocaba con lo que ya está en producción.
Si alguna no es la deseada, se cambia aquí y en el código.

## Iteración 2

| N.º | Tema | Decisión | Motivo |
|---|---|---|---|
| D1 | Fuente de verdad | `docs/requisitos/` no existe. Mandan `CLAUDE.md` y el encargo; si chocan, gana `CLAUDE.md`. | Son las reglas ya decididas por el dueño del proyecto y están en uso. |
| D2 | «Trailer» | Vehículo = cabezal con su tanquero **o** camión rígido. Un viaje guarda `cabezal_id` (obligatorio) y `remolque_id` (vacío en los camiones). | La flota real tiene dos camiones sin remolque. |
| D3 | Roles y varios vehículos | Se dejan como están; no se amplían. | Ya están en producción. |
| D4 | Service worker | Solo se sube `CACHE` y se agregan los archivos nuevos a su lista. | Sin eso los teléfonos no reciben la versión nueva. |
| D5 | Lint y build | `npm run lint` revisa la sintaxis de todos los `.js`. No hay build: la app son archivos estáticos. | Agregar un empaquetador sería cambio de stack. |
| D6 | Commits | Conventional Commits con el texto en español. | Encargo + regla de idioma del proyecto. |
| D7 | Productos | Fijos: `diesel`, `super`, `ecopais`. | Decisión por defecto del encargo. |
| D8 | Lugares | Por usuario, creados desde los viajes; sin pantalla de administración. | Decisión por defecto del encargo. |
| D9 | Tanqueo sin viaje | Queda asociado al vehículo. | Decisión por defecto del encargo. |
| D10 | Fechas y cortes de mes | UTC-5 (Ecuador) en el servidor para «hoy», «futuro» y el mes. | Decisión por defecto del encargo. |
| D11 | Viaje abierto de más de 48 h | Recordatorio «¿Terminaste este viaje?»; no se cierra solo. | Decisión por defecto del encargo. |
| D12 | Reporte: viaje con varios productos | **Una fila por viaje** con los valores separados por «/». | Cabe en la hoja (letra pequeña y tabla con desplazamiento en pantalla); una fila por viaje se parece a la bitácora de la compañía. |
| D13 | Reporte mensual | Entran los viajes **terminados** del mes y los tanqueos del mes. Un viaje abierto queda para el reporte siguiente. Se puede emitir un mes que solo tenga viajes o tanqueos. | Un viaje sin km de llegada no se puede congelar completo. |
| D14 | Tipo de trabajo | `tipo_trabajo_id` es la clave del catálogo (`public/js/catalogo-trabajos.js`); además se guardan el nombre de la parte y del trabajo tal como se vieron. | El catálogo es configuración; guardar el texto evita que un cambio futuro del catálogo altere registros viejos. |
| D15 | `componente_id` del trabajo | Se llena cuando la parte corresponde a un componente único del vehículo (motor, caja, tanque); en las demás queda vacío. | Frenos, llantas o suspensión abarcan varios componentes. |
| D16 | Eje en frenos y llantas | Si se marca un trabajo de «Frenos» o «Ejes y llantas» se pregunta el eje y se guarda en la nota del trabajo. | Regla vigente del proyecto: en llantas y frenos se elige el eje. |
| D17 | Mantenimientos existentes | Cada uno pasa a ser una visita con un trabajo (`tipo_trabajo_id = 'anterior'`), con su parte y trabajo originales. | Migrar sin perder datos. |
| D18 | Visita y unidad | La visita se guarda en el cabezal o camión, aunque incluya partes del tanquero. | Una visita mezcla partes de ambos; el km y el dueño van por el cabezal. |
| D19 | Edición de viajes y tanqueos | El teléfono vuelve a enviar el registro completo con el mismo identificador; el servidor lo actualiza si no está bloqueado y deja el cambio en auditoría. | Idempotente y sin duplicados sin conexión. |
| D20 | Km por galón | Se calcula y se guarda en los datos congelados (`kmPorGalon`), pero la hoja no lo muestra. | Pedido del encargo. |
| D21 | Panel del dueño | El dueño tiene la sección «Viajes y tanqueos» (solo consulta: filtros por vehículo, mes, destino y producto, totales y detalle con la foto de la guía). No corrige ni da de baja. | Pedido después del bloque 1. Los registros son del chofer; el dueño los revisa. |
| D23 | Km pendiente y viajes | Si el dueño aún no pone el km del vehículo, terminar un viaje no lo fija; se avisa. | Regla vigente: el punto de partida del km lo pone solo el dueño. |
| D24 | Salto de km | Un km de salida o de llegada más de 60.000 km por encima del actual se rechaza como error de tipeo. | Misma regla que ya tienen los mantenimientos. |
| D25 | «Copiar mensaje» | El mensaje sale en líneas: viaje, una línea por producto, km y tanqueos. | El encargo pide una línea por producto; así se lee mejor al pegarlo en un chat. |
| D26 | Coincidencia de lugares | Al comparar nombres se ignoran también los espacios («La Toma» = «latoma»). | Pedido del encargo: mayúsculas, tildes y espacios. |
| D27 | Otro trabajo | Un trabajo escrito a mano se guarda en «General» con la clave `otro`. | Mantiene una sola casilla de texto libre, simple de usar. |
| D28 | Hora del teléfono | La app usa la fecha y la hora de Ecuador aunque el teléfono tenga otra zona. | Coincide con el servidor y con la bitácora. |
| D29 | Una tarea por pantalla | El mantenimiento se reparte en 4 pasos (qué se hizo · km, fecha y lugar · taller · repuestos y notas) sin rehacer el formulario original. | Regla del proyecto: no rehacer `index.html`. |
| D30 | Tamaño de letra | Texto de lectura a 20 px; etiquetas y distintivos a 18 px. La hoja del reporte conserva sus tamaños (es un documento para imprimir). | «Texto base ≥ 20 px» sin romper la hoja impresa ni los distintivos. |
| D31 | Alcance de la accesibilidad | Se aplicó a la app del chofer. Los paneles del dueño y del administrador y el camión 3D no se cambiaron. | El requisito nace del chofer de edad avanzada; «Mi camión» ya tiene la alternativa «Ver como lista». |
| D32 | Km menor con fecha de hoy | Se pregunta antes de guardar (lo más probable es un error de tipeo). Con fecha anterior no se pregunta: es retroactivo. | El encargo pide no bloquear los registros de fecha anterior. |
| D22 | «Limpieza interna» | El catálogo nuevo por grupos no incluye limpieza de compartimentos. | Fuera de alcance de la iteración. |
