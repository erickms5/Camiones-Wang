// Revisión de sintaxis de todo el JavaScript del proyecto (npm run lint).
// La app no se compila ni usa empaquetador: este paso detecta errores de escritura antes de publicar.
import { readdirSync, readFileSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const CARPETAS = ['public/js', 'public/sw.js', 'api/src', 'api/test', 'tests', 'scripts'];
const IGNORAR = ['node_modules', 'vendor', 'datos-locales'];

function archivos(ruta) {
  if (IGNORAR.some((x) => ruta.split(/[\\/]/).includes(x))) return [];
  if (statSync(ruta).isFile()) return ['.js', '.mjs'].includes(extname(ruta)) ? [ruta] : [];
  return readdirSync(ruta).flatMap((n) => archivos(join(ruta, n)));
}

const temporal = mkdtempSync(join(tmpdir(), 'lint-'));
let fallas = 0;
const lista = CARPETAS.flatMap(archivos);
for (const ruta of lista) {
  // Todo el proyecto usa módulos (import/export): se revisa como .mjs
  const copia = join(temporal, 'archivo.mjs');
  writeFileSync(copia, readFileSync(ruta));
  const r = spawnSync(process.execPath, ['--check', copia], { encoding: 'utf8' });
  if (r.status !== 0) {
    fallas++;
    console.error(`✖ ${ruta}\n${r.stderr.split('\n').slice(0, 6).join('\n')}`);
  }
}
rmSync(temporal, { recursive: true, force: true });
console.log(fallas ? `${fallas} archivo(s) con errores de ${lista.length}` : `Sintaxis correcta en ${lista.length} archivos`);
process.exit(fallas ? 1 : 0);
