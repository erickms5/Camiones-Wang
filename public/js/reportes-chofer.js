// Reportes del chofer (con servidor): emite el reporte del mes que elija y consulta los ya emitidos,
// de este mes o de cualquier mes anterior. El reporte se abre desde los datos congelados del servidor,
// con las fotos de las facturas adentro y las facturas en PDF como hojas adicionales.
import { api, ErrorApi, enviarPendientes, pendientes, actualizarMantenimientos } from './sincronizacion.js';
import { abrirReporte, nombreMes } from './reporte.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
const CLAVE_LISTA = 'mi_trailer_reportes_servidor';
const mesLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 7);
};
const mensaje = (err) => (err instanceof ErrorApi ? err.message : 'No hay conexión con el servidor. Intenta cuando tengas señal.');

export function conectarReportes(app) {
  let lista = [];
  try {
    lista = JSON.parse(localStorage.getItem(CLAVE_LISTA)) || [];
  } catch {}
  let soloMes = true;

  const vista = $('view-reports');
  vista.innerHTML = `
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
      <div>
        <h2 class="text-xl sm:text-2xl font-black text-white flex items-center gap-2"><i class="fa-solid fa-calendar-check text-emerald-400"></i> Reporte del mes</h2>
        <p class="text-sm text-slate-400">Reúne los mantenimientos del mes con sus facturas, para entregar al dueño. Al emitirlo queda congelado.</p>
      </div>
      <label class="block text-slate-300 font-bold text-base" for="rc-mes">Mes
        <input type="month" id="rc-mes" class="mt-1 w-full bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 rounded-2xl py-3 px-4 text-lg font-bold text-white focus:outline-none"></label>
      <p id="rc-estado" class="text-base font-bold"></p>
      <button type="button" id="rc-emitir" class="touch-target w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black text-lg py-3.5 rounded-2xl shadow flex items-center justify-center gap-2">
        <i class="fa-solid fa-file-signature text-xl"></i><span id="rc-emitir-texto">EMITIR REPORTE</span></button>
    </div>
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 id="rc-titulo-lista" class="text-lg font-bold text-white"></h3>
        <button type="button" id="rc-todos" class="text-sm font-bold text-cyan-400 px-2 py-2"></button>
      </div>
      <div id="reports-generated-list" class="space-y-3"></div>
    </div>`;
  const mes = $('rc-mes');
  mes.max = mes.value = mesLocal();

  // Trabajos del mes elegido que todavía no están en ningún reporte
  const sinReporte = () => app.maintenances.filter((m) => String(m.fecha).startsWith(mes.value) && !m.bloqueado);

  function pintar() {
    const periodo = mes.value || mesLocal();
    const n = sinReporte().length;
    const delMes = lista.filter((r) => r.periodo === periodo);
    $('rc-estado').className = `text-base font-bold ${n ? 'text-emerald-300' : 'text-slate-400'}`;
    $('rc-estado').textContent = n
      ? `${n} ${n === 1 ? 'mantenimiento' : 'mantenimientos'} de ${nombreMes(periodo)} por incluir en el reporte.`
      : delMes.length ? `Todo lo de ${nombreMes(periodo)} ya está en un reporte emitido.` : `No hay mantenimientos registrados en ${nombreMes(periodo)}.`;
    $('rc-emitir').disabled = !n;
    $('rc-emitir-texto').textContent = `EMITIR REPORTE DE ${nombreMes(periodo).toUpperCase()}`;
    $('rc-titulo-lista').textContent = soloMes ? `Reportes de ${nombreMes(periodo)}` : 'Todos los reportes emitidos';
    $('rc-todos').textContent = soloMes ? 'Ver todos los meses ›' : `‹ Solo ${nombreMes(periodo)}`;
    const visibles = soloMes ? delMes : lista;
    $('reports-generated-list').innerHTML = visibles.length ? visibles.map((r) => `
      <button type="button" data-folio="${esc(r.folio)}" class="w-full text-left p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500 flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <span class="font-mono text-sm font-black text-emerald-400">${esc(r.folio)}</span>
          <p class="text-base font-bold text-white">${esc(r.tipo === 'mensual' ? `Mensual · ${nombreMes(r.periodo)}` : 'De un solo trabajo')}</p>
          <p class="text-xs text-slate-400">Emitido el ${esc(new Date(r.generadoEn).toLocaleDateString('es-EC'))}${r.placa ? ` · ${esc(r.placa)}` : ''}</p>
        </div>
        <div class="text-right shrink-0"><p class="text-xl font-black font-mono text-emerald-400">$${Number(r.total).toFixed(2)}</p><p class="text-xs font-bold text-cyan-400">Ver e imprimir ›</p></div>
      </button>`).join('')
      : `<p class="text-sm text-slate-400 bg-slate-950 border border-slate-800 rounded-2xl p-4">${soloMes ? `Aún no hay reportes emitidos de ${esc(nombreMes(periodo))}.` : 'Aún no has emitido reportes.'}</p>`;
    $('reports-generated-list').querySelectorAll('[data-folio]').forEach((b) => (b.onclick = () => ver(b.dataset.folio)));
  }

  async function ver(folio) {
    if (!navigator.onLine) return app.showToast('Necesitas señal para abrir el reporte', 'warning');
    try {
      await abrirReporte(folio);
    } catch (err) {
      app.showToast(mensaje(err), 'warning');
    }
  }

  // Reportes emitidos y estado de cada mantenimiento (cuáles ya están en un reporte), desde el servidor
  async function actualizar() {
    if (!navigator.onLine) return pintar();
    try {
      const { reportes } = await api('/reportes');
      lista = reportes;
      localStorage.setItem(CLAVE_LISTA, JSON.stringify(lista));
      await actualizarMantenimientos(app, Object.fromEntries(reportes.map((r) => [r.id, r.folio])));
    } catch {
      // sin señal: se muestra la última lista guardada
    }
    pintar();
  }

  async function emitir(cuerpo) {
    if (!navigator.onLine) return app.showToast('Necesitas señal para emitir el reporte', 'warning');
    await enviarPendientes(app);
    if (pendientes()) return app.showToast('Aún hay datos o facturas por enviar. Intenta de nuevo en un momento.', 'warning');
    try {
      const { reporte } = await api('/reportes', { metodo: 'POST', cuerpo });
      await actualizar();
      await ver(reporte.folio);
    } catch (err) {
      app.showToast(mensaje(err), 'warning');
    }
  }

  mes.onchange = () => {
    if (!mes.value || mes.value > mesLocal()) mes.value = mesLocal();
    soloMes = true;
    pintar();
  };
  $('rc-todos').onclick = () => {
    soloMes = !soloMes;
    pintar();
  };
  $('rc-emitir').onclick = async () => {
    const periodo = mes.value;
    const n = sinReporte().length;
    if (!confirm(`¿Emitir el reporte de ${nombreMes(periodo)} con ${n} ${n === 1 ? 'mantenimiento' : 'mantenimientos'}?\n\nQueda congelado: lo que registres después de este mes irá en otro reporte.`)) return;
    $('rc-emitir').disabled = true;
    await emitir({ tipo: 'mensual', periodo, unidadId: app.session.servidor.cabezalId });
    pintar();
  };

  // La pantalla principal usa estos tres nombres
  app.renderReportsList = () => {
    pintar();
    actualizar();
  };
  app.prepareMonthlyReportPreview = () => app.switchView('reports');
  app.generateSingleMaintenanceReport = (id) => emitir({ tipo: 'individual', mantenimientoId: id });
  if (app.session?.servidor) actualizar();
}
