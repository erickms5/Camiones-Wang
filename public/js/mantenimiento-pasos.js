// Formulario de mantenimiento, una tarea por pantalla, y fecha del trabajo con atajos.
// No rehace el formulario original (index.html): reparte sus bloques en cuatro pasos y agrega «Atrás» y «Siguiente».
//   1. ¿Qué se hizo?   2. Kilometraje, fecha y lugar   3. Taller y mano de obra   4. Repuestos y notas
// La fecha parte en «Hoy»; con «Cambiar fecha» se elige «Ayer», «La semana pasada» u otra fecha anterior.
import { hoyEcuador } from './viajes-logica.js';

const $ = (id) => document.getElementById(id);
const PASOS = ['¿Qué se hizo?', 'Kilometraje, fecha y lugar', 'Taller y mano de obra', 'Repuestos y notas'];
const BOTON = 'min-h-[56px] rounded-2xl font-black text-xl px-5 flex items-center justify-center gap-2';
const fechaCorta = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const restarDias = (fecha, dias) => new Date(Date.parse(`${fecha}T12:00:00Z`) - dias * 86400000).toISOString().slice(0, 10);

export function conectarPasos(app) {
  const form = $('form-maintenance');
  if (!form || $('mp-nav')) return;
  let paso = 1;

  // ---- cada bloque del formulario va a su paso
  const pasoDe = (bloque) => {
    if (bloque.querySelector('#maint-km, #maint-provincia') || bloque.matches('#maint-km, #maint-provincia')) return 2;
    if (bloque.querySelector('#maint-taller')) return 3;
    if (bloque.querySelector('#maint-proveedor, #maint-costo-total-preview, #maint-notas')) return 4;
    if (bloque.matches('button[type="submit"]')) return 4;
    return 1;
  };
  [...form.children].forEach((b) => (b.dataset.paso = pasoDe(b)));

  const nav = document.createElement('div');
  nav.id = 'mp-nav';
  nav.className = 'space-y-3';
  nav.innerHTML = `
    <p id="mp-error" class="hidden text-xl font-bold text-amber-300 bg-amber-500/10 border-2 border-amber-500/50 rounded-2xl p-4" role="alert"></p>
    <div class="flex flex-col-reverse sm:flex-row gap-3">
      <button type="button" id="mp-atras" class="${BOTON} sm:flex-1 border-2 border-slate-600 text-slate-100"><i class="fa-solid fa-arrow-left"></i><span>Atrás</span></button>
      <button type="button" id="mp-seguir" class="${BOTON} sm:flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950"><span>Siguiente</span><i class="fa-solid fa-arrow-right"></i></button>
    </div>`;
  form.appendChild(nav);
  const enviar = form.querySelector('button[type="submit"]');
  nav.querySelector('.flex').appendChild(enviar); // «Guardar» ocupa el lugar de «Siguiente» en el último paso
  enviar.classList.add('sm:flex-1');
  enviar.dataset.paso = '';

  const error = (texto) => {
    $('mp-error').textContent = texto || '';
    $('mp-error').classList.toggle('hidden', !texto);
    if (texto) $('mp-error').scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const subtitulo = document.querySelector('#modal-maintenance h3 + p');
  function mostrar() {
    [...form.children].forEach((b) => b.dataset.paso && b.classList.toggle('mp-oculto', Number(b.dataset.paso) !== paso));
    $('mp-atras').classList.toggle('hidden', paso === 1);
    $('mp-seguir').classList.toggle('hidden', paso === PASOS.length);
    enviar.classList.toggle('hidden', paso !== PASOS.length);
    if (subtitulo) subtitulo.textContent = `Paso ${paso} de ${PASOS.length} · ${PASOS[paso - 1]}`;
    error('');
    document.querySelector('#modal-maintenance > div')?.scrollTo({ top: 0 });
  }
  // Los bloques de otros pasos se ocultan con una clase propia (algunos ya usan «hidden» para otra cosa)
  if (!$('mp-estilo')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'mp-estilo', textContent: '.mp-oculto { display: none !important; }' }));

  // Qué falta en cada paso, dicho de forma que se sepa qué hacer
  const problema = (n) => {
    if (n === 1 && window.TrabajosVisita && !window.TrabajosVisita.seleccion().length) return 'Marca al menos un trabajo. Toca una parte (por ejemplo «Motor») y marca lo que se hizo.';
    if (n === 2) {
      const km = parseInt($('maint-km').value, 10);
      if (!(km > 0)) return 'Escribe el kilometraje que marca el tablero.';
      if (!$('maint-date').value) return 'Elige la fecha del trabajo.';
      if ($('maint-date').value > hoyEcuador()) return 'La fecha no puede ser futura. Elige hoy o un día anterior.';
    }
    return null;
  };
  $('mp-seguir').onclick = () => {
    const p = problema(paso);
    if (p) return error(p);
    paso = Math.min(PASOS.length, paso + 1);
    mostrar();
  };
  $('mp-atras').onclick = () => {
    paso = Math.max(1, paso - 1);
    mostrar();
  };

  // «Enter» en un campo de un paso intermedio avanza en vez de guardar; al guardar se revisan los pasos anteriores
  const guardar = app.handleSaveMaintenance.bind(app);
  app.handleSaveMaintenance = async (e) => {
    if (paso < PASOS.length) {
      e?.preventDefault?.();
      return $('mp-seguir').click();
    }
    for (const n of [1, 2]) {
      const p = problema(n);
      if (p) {
        e?.preventDefault?.();
        paso = n;
        mostrar();
        return error(p);
      }
    }
    return guardar(e);
  };

  // ---------------------------------------------------------------- fecha con atajos
  const caja = $('maint-fecha-box');
  const entrada = $('maint-date');
  function pintarFecha(eligiendo = false) {
    if (!caja || !entrada) return;
    const hoy = hoyEcuador();
    entrada.max = hoy;
    if (!entrada.value || entrada.value > hoy) entrada.value = hoy;
    const f = entrada.value;
    const nombre = f === hoy ? 'Hoy' : f === restarDias(hoy, 1) ? 'Ayer' : f === restarDias(hoy, 7) ? 'La semana pasada' : 'Fecha anterior';
    const atajo = (dias, texto) => `<button type="button" data-dias="${dias}" class="${BOTON} border-2 ${f === restarDias(hoy, dias) ? 'border-emerald-400 text-emerald-200' : 'border-slate-600 text-slate-100'}">${texto}</button>`;
    caja.innerHTML = `
      <div class="bg-slate-950 border-2 border-slate-700 rounded-2xl p-3 space-y-3">
        <p class="text-2xl font-black text-white">${nombre} <span class="font-mono text-emerald-300">· ${fechaCorta(f)}</span></p>
        <button type="button" id="mp-cambiar-fecha" class="${BOTON} w-full bg-cyan-600 hover:bg-cyan-500 text-white"><i class="fa-solid fa-calendar-day"></i><span>Cambiar fecha</span></button>
        <div id="mp-atajos" class="${eligiendo ? '' : 'hidden'} grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${atajo(0, 'Hoy')}${atajo(1, 'Ayer')}${atajo(7, 'La semana pasada')}
          <button type="button" id="mp-elegir" class="${BOTON} border-2 border-slate-600 text-slate-100"><i class="fa-solid fa-calendar"></i><span>Elegir fecha</span></button>
        </div>
        ${f < hoy ? '<p class="text-lg font-bold text-cyan-200">Registro de una fecha anterior: si su kilometraje es menor al actual, no cambia tu kilometraje.</p>' : ''}
      </div>`;
    $('mp-cambiar-fecha').onclick = () => $('mp-atajos').classList.toggle('hidden');
    caja.querySelectorAll('[data-dias]').forEach((b) => (b.onclick = () => {
      entrada.value = restarDias(hoy, Number(b.dataset.dias));
      entrada.classList.add('hidden');
      pintarFecha();
    }));
    $('mp-elegir').onclick = () => {
      entrada.classList.remove('hidden');
      entrada.focus();
      entrada.showPicker?.();
    };
  }
  if (entrada) {
    entrada.onchange = () => {
      if (entrada.value > hoyEcuador()) {
        entrada.value = hoyEcuador();
        app.showToast('La fecha no puede ser futura. Elige hoy o un día anterior.', 'warning');
      }
      pintarFecha(true);
    };
  }

  // El kilometraje y la fecha van uno debajo del otro (la fecha con sus atajos necesita el ancho completo)
  $('maint-km')?.closest('.grid')?.classList.remove('sm:grid-cols-2');
  // Teclado numérico en el kilometraje y en los costos
  $('maint-km')?.setAttribute('inputmode', 'numeric');
  ['maint-costo-taller', 'maint-costo-repuestos'].forEach((id) => $(id)?.setAttribute('inputmode', 'decimal'));

  // Al abrir: primer paso y fecha de hoy
  const abrir = app.openNewMaintenanceModal.bind(app);
  app.openNewMaintenanceModal = (...a) => {
    abrir(...a);
    paso = 1;
    if (entrada) {
      entrada.value = hoyEcuador();
      entrada.classList.add('hidden');
    }
    pintarFecha();
    mostrar();
  };
  pintarFecha();
  mostrar();
}
