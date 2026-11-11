// Pantalla «¿Qué se hizo?» del mantenimiento: una visita al taller con varios trabajos sobre varias partes.
// Casillas agrupadas por parte (el catálogo está en catalogo-trabajos.js), contador y «Lo mismo que la última vez».
// La pantalla principal (index.html) la usa como window.TrabajosVisita.
import {
  GRUPOS, TRABAJO_OTRO, gruposPara, marca, partesDeVisita, resumenTrabajos, textoTrabajos, trabajosDeRegistro, visitaIncluye,
} from './catalogo-trabajos.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

// Parte del camión (lista antigua de «Mi camión») → grupo del catálogo
export function grupoDeParte(parteId) {
  const p = String(parteId || '');
  if (/^General/.test(p) || /Seguridad|Cabina|Quinta|Perno/.test(p)) return 'general';
  if (/Motor|Enfriamiento/.test(p)) return 'motor';
  if (/Caja|Embrague|Card[aá]n/.test(p)) return 'caja';
  if (/Freno|Aire/.test(p)) return 'frenos';
  if (/Suspensi[oó]n/.test(p)) return 'suspension';
  if (/Eje|Llanta|Direcci[oó]n/.test(p)) return 'ejes';
  if (/El[eé]ctrico/.test(p)) return 'electrico';
  if (/Tanque|V[aá]lvulas|Compartimento/.test(p)) return 'tanque';
  return 'general';
}

export function conectarTrabajos(app) {
  const marcados = new Set(); // «grupo|trabajo»
  const tipo = () => app.session?.vehiculo?.tipo || 'tracto';
  const grupos = () => gruposPara(tipo());
  // Trabajos del último mantenimiento que siguen en el catálogo
  const ultimos = () => {
    const m = app.maintenances.find((x) => Array.isArray(x.trabajos) && x.trabajos.some((t) => t.tipoTrabajoId !== TRABAJO_OTRO));
    if (!m) return [];
    return m.trabajos.map((t) => {
      const g = grupos().find((x) => x.nombre === t.parte);
      return g?.trabajos.some((x) => x.id === t.tipoTrabajoId) ? marca(g.id, t.tipoTrabajoId) : null;
    }).filter(Boolean);
  };

  function actualizar() {
    const caja = $('maint-trabajos');
    if (!caja) return;
    const otro = $('mt-otro')?.value.trim();
    const n = marcados.size + (otro ? 1 : 0);
    $('mt-contador').textContent = n === 1 ? '1 trabajo seleccionado' : `${n} trabajos seleccionados`;
    $('mt-contador').className = `text-lg font-black ${n ? 'text-emerald-300' : 'text-amber-300'}`;
    grupos().forEach((g) => {
      const k = [...marcados].filter((x) => x.startsWith(`${g.id}|`)).length;
      const insignia = caja.querySelector(`[data-cuenta="${g.id}"]`);
      if (insignia) {
        insignia.textContent = k ? String(k) : '';
        insignia.classList.toggle('hidden', !k);
      }
    });
    // En frenos y en ejes y llantas se pregunta el eje
    const pideEje = grupos().some((g) => g.pideEje && [...marcados].some((x) => x.startsWith(`${g.id}|`)));
    $('maint-eje-box')?.classList.toggle('hidden', !pideEje);
  }

  function pintar(abierto) {
    const caja = $('maint-trabajos');
    if (!caja) return;
    const hayUltimos = ultimos().length > 0;
    caja.innerHTML = `
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p class="text-slate-200 font-black text-xl">¿Qué se hizo? <span class="text-emerald-400">*</span></p>
          <p class="text-base text-slate-400">Marca todos los trabajos de esta visita al taller.</p>
        </div>
        <p id="mt-contador" class="text-lg font-black" aria-live="polite"></p>
      </div>
      ${hayUltimos ? `<button type="button" id="mt-ultima" class="w-full min-h-[56px] rounded-2xl border-2 border-cyan-600 text-cyan-200 font-bold text-lg px-4 flex items-center justify-center gap-2">
        <i class="fa-solid fa-rotate-left"></i><span>Lo mismo que la última vez</span></button>` : ''}
      <div class="space-y-2">
        ${grupos().map((g) => `
          <details class="bg-slate-950 border-2 border-slate-800 rounded-2xl" data-grupo="${esc(g.id)}" ${g.id === abierto ? 'open' : ''}>
            <summary class="min-h-[56px] px-4 flex items-center gap-3 cursor-pointer text-xl font-black text-white">
              <i class="fa-solid ${esc(g.icono)} text-emerald-400 w-7 text-center"></i><span class="flex-1">${esc(g.nombre)}</span>
              <span data-cuenta="${esc(g.id)}" class="hidden bg-emerald-500 text-slate-950 text-base font-black px-3 py-0.5 rounded-full"></span>
            </summary>
            <div class="px-2 pb-2 space-y-1">
              ${g.trabajos.map((x) => `
                <label class="min-h-[56px] px-3 py-2 flex items-center gap-3 rounded-xl hover:bg-slate-900 cursor-pointer">
                  <input type="checkbox" data-marca="${esc(marca(g.id, x.id))}" ${marcados.has(marca(g.id, x.id)) ? 'checked' : ''} class="w-7 h-7 shrink-0 accent-emerald-500">
                  <span class="text-xl text-slate-100">${esc(x.nombre)}</span>
                </label>`).join('')}
            </div>
          </details>`).join('')}
      </div>
      <label class="block text-lg font-bold text-slate-300" for="mt-otro">Otro trabajo que no está en la lista
        <input type="text" id="mt-otro" maxlength="110" placeholder="Escríbelo aquí (opcional)"
               class="mt-1 w-full bg-slate-950 border-2 border-slate-700 rounded-2xl py-3 px-4 text-xl text-white focus:outline-none focus:border-emerald-500"></label>`;
    caja.querySelectorAll('[data-marca]').forEach((c) => (c.onchange = () => {
      if (c.checked) marcados.add(c.dataset.marca);
      else marcados.delete(c.dataset.marca);
      actualizar();
    }));
    $('mt-otro').oninput = actualizar;
    const ultima = $('mt-ultima');
    if (ultima) {
      ultima.onclick = () => {
        ultimos().forEach((x) => marcados.add(x));
        const abiertos = [...caja.querySelectorAll('details[open]')].map((d) => d.dataset.grupo);
        pintar(null);
        // Quedan a la vista las partes que tienen algo marcado
        caja.querySelectorAll('details').forEach((d) => (d.open = abiertos.includes(d.dataset.grupo) || [...marcados].some((x) => x.startsWith(`${d.dataset.grupo}|`))));
      };
    }
    actualizar();
  }

  const api = {
    // Al abrir el formulario: nada marcado; queda abierta la parte desde la que se entró
    abrir() {
      marcados.clear();
      pintar(grupoDeParte(app.selectedPart));
    },
    // Trabajos marcados, listos para guardar: [{ tipoTrabajoId, parte, trabajo, nota }]
    seleccion() {
      const eje = $('maint-eje')?.value || null;
      const lista = [];
      grupos().forEach((g) => g.trabajos.forEach((x) => {
        if (marcados.has(marca(g.id, x.id))) lista.push({ tipoTrabajoId: x.id, parte: g.nombre, trabajo: x.nombre, nota: g.pideEje ? eje : null });
      }));
      const otro = $('mt-otro')?.value.trim();
      if (otro) lista.push({ tipoTrabajoId: TRABAJO_OTRO, parte: 'General', trabajo: otro, nota: null });
      return lista;
    },
    partes: (trabajos) => partesDeVisita(trabajos).join(' · '),
    resumen: (trabajos) => resumenTrabajos(trabajos),
    // «Motor: cambio de aceite, filtros de diésel · Caja: cambio de aceite»
    texto: (m) => textoTrabajos(trabajosDeRegistro(m)),
    titulo: (m) => resumenTrabajos(trabajosDeRegistro(m)),
    cuantos: (m) => trabajosDeRegistro(m).length,
    // Filtros del historial: visitas que incluyen la parte o el trabajo elegidos
    filtrar(lista) {
      const parte = $('hist-parte')?.value || '';
      const trabajo = $('hist-trabajo')?.value || '';
      return parte || trabajo ? lista.filter((m) => visitaIncluye(m, { parte, trabajo })) : lista;
    },
  };
  window.TrabajosVisita = api;

  // Filtros por parte y por trabajo, encima del historial
  const lista = $('maintenance-history-list');
  if (lista && !$('hist-parte')) {
    const filtros = document.createElement('div');
    filtros.className = 'grid sm:grid-cols-2 gap-3 mb-4';
    const clase = 'mt-1 w-full min-h-[56px] bg-slate-950 border-2 border-slate-700 rounded-2xl px-4 text-xl font-bold text-white focus:outline-none focus:border-emerald-500';
    filtros.innerHTML = `
      <label class="block text-lg font-bold text-slate-300" for="hist-parte">Ver solo esta parte
        <select id="hist-parte" class="${clase}"><option value="">Todas las partes</option>${GRUPOS.map((g) => `<option value="${esc(g.nombre)}">${esc(g.nombre)}</option>`).join('')}</select></label>
      <label class="block text-lg font-bold text-slate-300" for="hist-trabajo">Ver solo este trabajo
        <select id="hist-trabajo" class="${clase}"></select></label>`;
    lista.before(filtros);
    const llenarTrabajos = () => {
      const g = GRUPOS.find((x) => x.nombre === $('hist-parte').value);
      const nombres = [...new Set((g ? [g] : GRUPOS).flatMap((x) => x.trabajos.map((y) => y.nombre)))].sort((a, b) => a.localeCompare(b));
      $('hist-trabajo').innerHTML = `<option value="">Todos los trabajos</option>${nombres.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}`;
    };
    llenarTrabajos();
    $('hist-parte').onchange = () => {
      llenarTrabajos();
      app.renderHistory();
    };
    $('hist-trabajo').onchange = () => app.renderHistory();
  }

  // «Mi camión»: el último mantenimiento de una parte también busca dentro de las visitas con varios trabajos
  const ultimoOriginal = app.getLastMaintenanceForPart.bind(app);
  app.getLastMaintenanceForPart = (parteId) => {
    const g = GRUPOS.find((x) => x.id === grupoDeParte(parteId));
    const nuevos = app.maintenances.filter((m) => Array.isArray(m.trabajos) && m.trabajos.some((t) => t.parte === g?.nombre));
    return [ultimoOriginal(parteId), ...nuevos].filter(Boolean).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0] || null;
  };

  if (app.session) app.refreshUI();
  return api;
}
