// Panel del dueño: reportes de sus choferes (con facturas), choferes y camiones.
import { api, API } from './sincronizacion.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dinero = (n) => `$${Number(n || 0).toFixed(2)}`;
const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
const miles = (n) => Number(n || 0).toLocaleString('es-EC');
const datos = { choferes: [], unidades: [], reportes: [] };

function aviso(texto, tipo = 'ok') {
  const t = $('toast');
  t.textContent = texto;
  t.className = `fixed top-4 right-4 z-[60] px-5 py-3 rounded-2xl font-extrabold shadow-2xl ${tipo === 'ok' ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500 text-slate-950'}`;
  setTimeout(() => t.classList.add('hidden'), 3500);
}

function errorEn(id, err) {
  const el = $(id);
  el.textContent = err ? err.message || 'Sin conexión con el servidor' : '';
  el.classList.toggle('hidden', !err);
}

// ---------------------------------------------------------------- pestañas
function pestana(nombre) {
  document.querySelectorAll('.pestana').forEach((b) => {
    const activa = b.dataset.pestana === nombre;
    b.setAttribute('aria-selected', String(activa));
    b.className = `pestana touch-target rounded-xl font-bold border ${activa ? 'bg-emerald-500 text-slate-950 border-emerald-400' : 'border-slate-700 text-slate-300'}`;
  });
  ['reportes', 'choferes', 'unidades'].forEach((p) => $(`p-${p}`).classList.toggle('hidden', p !== nombre));
}
document.querySelectorAll('.pestana').forEach((b) => (b.onclick = () => pestana(b.dataset.pestana)));

// ---------------------------------------------------------------- reportes
async function cargarReportes() {
  const filtro = $('r-filtro').value;
  const { reportes } = await api(`/reportes${filtro ? `?chofer=${encodeURIComponent(filtro)}` : ''}`);
  datos.reportes = reportes;
  $('r-lista').innerHTML = reportes.length
    ? reportes.map((r) => `
      <button data-folio="${esc(r.folio)}" class="w-full text-left bg-slate-900 border border-slate-800 hover:border-emerald-500 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="font-mono text-xs bg-slate-800 text-cyan-300 px-2 py-0.5 rounded">${esc(r.folio)}</span>
          <span class="text-xs text-slate-400 ml-2">${esc(r.tipo === 'mensual' ? `Mensual ${r.periodo || ''}` : 'Individual')}</span>
          <p class="text-lg font-bold text-white mt-1">${esc(r.chofer || 'Chofer')}</p>
          <p class="text-xs text-slate-400">Emitido: ${esc(fechaHora(r.generadoEn))}</p>
        </div>
        <div class="text-right"><p class="text-2xl font-black font-mono text-emerald-400">${esc(dinero(r.total))}</p><p class="text-xs text-cyan-400">Ver detalle ›</p></div>
      </button>`).join('')
    : '<p class="text-slate-400 italic bg-slate-900 rounded-2xl p-5 border border-slate-800">Todavía no hay reportes emitidos por tus choferes.</p>';
  $('r-lista').querySelectorAll('[data-folio]').forEach((b) => (b.onclick = () => abrirReporte(b.dataset.folio)));
}
$('r-filtro').onchange = () => cargarReportes().catch((e) => aviso(e.message, 'error'));

const urlsArchivos = [];
async function abrirReporte(folio) {
  const { reporte, integro } = await api(`/reportes/${encodeURIComponent(folio)}`);
  const d = reporte.datos;
  const filas = d.mantenimientos.map((m) => `
    <tr class="border-b border-slate-200">
      <td class="p-2 border border-slate-300 font-mono">${esc(m.fecha)}<div class="text-[10px] text-slate-500">${esc(miles(m.km))} km</div></td>
      <td class="p-2 border border-slate-300 font-bold">${esc(m.parte)}</td>
      <td class="p-2 border border-slate-300">${esc(m.trabajo)}</td>
      <td class="p-2 border border-slate-300">${esc(m.taller || '—')}<div class="font-mono font-bold">${esc(dinero(m.costoTaller))}</div></td>
      <td class="p-2 border border-slate-300">${esc(m.proveedor || '—')}<div class="font-mono font-bold">${esc(dinero(m.costoRepuestos))}</div></td>
      <td class="p-2 border border-slate-300 text-right font-mono font-bold">${esc(dinero(Number(m.costoTaller) + Number(m.costoRepuestos)))}</td>
    </tr>`).join('');
  const evidencias = d.mantenimientos.flatMap((m) => m.evidencias.map((e) => ({ ...e, m })));
  $('reporte-imprimible').innerHTML = `
    <div class="flex justify-between items-start border-b-2 border-slate-800 pb-3 gap-3">
      <div><h4 class="text-2xl font-black">REPORTE DE MANTENIMIENTO</h4><p class="text-xs text-slate-600 uppercase font-bold">Mi Trailer · Reporte congelado</p></div>
      <div class="text-right"><span class="bg-slate-900 text-white font-mono text-xs font-bold px-3 py-1 rounded">FOLIO: ${esc(reporte.folio)}</span>
        <p class="text-xs text-slate-500 mt-1 font-mono">Emisión: ${esc(fechaHora(reporte.generadoEn))}</p></div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-100 p-3 rounded-xl text-xs">
      <div><span class="font-bold text-slate-500 block">CHOFER</span><span class="text-sm font-bold">${esc(d.chofer.nombre)}</span></div>
      <div><span class="font-bold text-slate-500 block">CÉDULA</span><span class="text-sm font-mono font-bold">${esc(d.chofer.cedula || '—')}</span></div>
      <div><span class="font-bold text-slate-500 block">PERIODO</span><span class="text-sm font-bold">${esc(d.periodo || 'Individual')}</span></div>
    </div>
    <div class="overflow-x-auto"><table class="w-full text-left text-xs border-collapse">
      <thead><tr class="bg-slate-200 font-bold"><th class="p-2 border border-slate-300">Fecha / Km</th><th class="p-2 border border-slate-300">Parte</th><th class="p-2 border border-slate-300">Trabajo</th><th class="p-2 border border-slate-300">Taller</th><th class="p-2 border border-slate-300">Repuestos</th><th class="p-2 border border-slate-300 text-right">Total</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr class="font-black bg-slate-100"><td colspan="5" class="p-2 border border-slate-300 text-right">TOTAL</td><td class="p-2 border border-slate-300 text-right">${esc(dinero(d.total))}</td></tr></tfoot>
    </table></div>
    <div class="space-y-2"><h5 class="text-xs font-bold uppercase text-slate-700">Evidencias adjuntas (facturas y fotos)</h5>
      <div id="m-evidencias" class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        ${evidencias.length ? evidencias.map((e) => `
          <figure class="border border-slate-300 rounded-lg p-2 bg-slate-50">
            ${e.mime.startsWith('image/') ? `<img data-ev="${esc(e.id)}" alt="${esc(e.nombreArchivo)}" class="w-full max-h-72 object-contain bg-white rounded border">`
              : `<div class="h-24 flex flex-col items-center justify-center bg-white rounded border"><i class="fa-solid fa-file-pdf text-3xl text-rose-600"></i><a data-ev-doc="${esc(e.id)}" target="_blank" class="no-print underline mt-1">Abrir documento</a></div>`}
            <figcaption class="mt-1 text-[11px] space-y-0.5">
              <div class="font-bold">${esc(e.categoria)}${e.anexoPosterior ? ' · anexo posterior' : ''}</div>
              <div class="break-all">${esc(e.nombreArchivo)}</div>
              <div class="font-mono font-bold">Subida: ${esc(fechaHora(e.subidoEn))}</div>
              <div class="text-slate-500">${esc(e.m.trabajo)} · ${esc(e.m.parte)}</div>
            </figcaption>
          </figure>`).join('') : '<span class="italic text-slate-500">Sin facturas adjuntas.</span>'}
      </div>
    </div>
    <div class="pt-3 border-t border-slate-300 text-[10px] font-mono text-slate-600 space-y-1">
      <p><strong>HUELLA SHA-256:</strong> <span class="break-all">${esc(reporte.hash)}</span></p>
      <p class="${integro ? 'text-emerald-700' : 'text-rose-700'} font-bold">${integro ? '✔ Integridad verificada: el reporte no fue modificado.' : '✖ ATENCIÓN: los datos no coinciden con la huella.'}</p>
    </div>`;
  $('modal-reporte').classList.remove('hidden');
  // Las imágenes se piden con la sesión del dueño
  urlsArchivos.splice(0).forEach((u) => URL.revokeObjectURL(u));
  for (const el of $('m-evidencias').querySelectorAll('[data-ev], [data-ev-doc]')) {
    const id = el.dataset.ev || el.dataset.evDoc;
    try {
      const u = URL.createObjectURL(await api(`/evidencias/${encodeURIComponent(id)}/archivo`));
      urlsArchivos.push(u);
      if (el.dataset.ev) el.src = u;
      else el.href = u;
    } catch {
      el.replaceWith(Object.assign(document.createElement('div'), { className: 'italic text-slate-500 p-3', textContent: 'Archivo aún no subido por el chofer' }));
    }
  }
}
$('m-cerrar').onclick = () => $('modal-reporte').classList.add('hidden');

// ---------------------------------------------------------------- choferes
async function cargarChoferes() {
  const { choferes } = await api('/choferes');
  datos.choferes = choferes;
  $('c-lista').innerHTML = choferes.length
    ? choferes.map((c) => `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-lg font-bold text-white">${esc(c.nombre)} ${c.activo ? '' : '<span class="text-xs bg-slate-700 text-slate-300 px-2 rounded-full">Inactivo</span>'}</p>
          <p class="text-sm text-slate-400">${esc(c.email)} · Cédula ${esc(c.cedula || '—')}</p>
          <p class="text-xs text-cyan-300">${c.unidades.length ? `Maneja ${esc(c.unidades.join(', '))}` : 'Sin unidad asignada'}</p>
        </div>
        <button data-chofer="${esc(c.id)}" data-activo="${c.activo}" class="px-4 py-2 rounded-xl border ${c.activo ? 'border-rose-500/40 text-rose-300' : 'border-emerald-500/40 text-emerald-300'} font-bold">${c.activo ? 'Desactivar' : 'Activar'}</button>
      </div>`).join('')
    : '<p class="text-slate-400 italic">Aún no registras choferes.</p>';
  $('c-lista').querySelectorAll('[data-chofer]').forEach((b) => (b.onclick = async () => {
    await api(`/choferes/${b.dataset.chofer}`, { metodo: 'PATCH', cuerpo: { activo: b.dataset.activo !== 'true' } });
    await cargarChoferes();
  }));
  const opciones = choferes.filter((c) => c.activo).map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
  $('r-filtro').innerHTML = `<option value="">Todos</option>${choferes.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}`;
  document.querySelector('#s-form [name=chofer]').innerHTML = opciones || '<option value="">Registra un chofer primero</option>';
}

$('c-form').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await api('/choferes', {
      metodo: 'POST',
      cuerpo: {
        nombre: f.get('nombre'), email: f.get('email'), cedula: f.get('cedula'),
        telefono: f.get('telefono') || undefined, consentimiento: f.get('consentimiento') === 'on',
      },
    });
    errorEn('c-error');
    e.target.reset();
    aviso('Chofer registrado. Ya puede entrar con su correo.');
    await cargarChoferes();
  } catch (err) {
    errorEn('c-error', err);
  }
};

// ---------------------------------------------------------------- camiones
async function cargarUnidades() {
  const { unidades } = await api('/unidades');
  datos.unidades = unidades;
  $('u-lista').innerHTML = unidades.length
    ? unidades.map((u) => `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <span class="font-mono font-black bg-white text-slate-900 px-2 py-0.5 rounded">${esc(u.placa)}</span>
        <p class="text-white font-bold mt-2">${esc(u.rol === 'cabezal' ? 'Cabezal' : `Remolque ${u.tipo}`)} · ${esc(u.marca)} ${esc(u.modelo)} ${esc(u.anio || '')}</p>
        <p class="text-xs text-slate-400">${esc(u.numEjes)} ejes · ${esc(u.numLlantas)} llantas${u.atributos?.capacidad_galones ? ` · ${esc(miles(u.atributos.capacidad_galones))} gal` : ''}</p>
      </div>`).join('')
    : '<p class="text-slate-400 italic">Aún no registras camiones.</p>';
  const op = (lista) => lista.map((u) => `<option value="${esc(u.id)}">${esc(u.placa)} · ${esc(u.marca)}</option>`).join('');
  document.querySelector('#a-form [name=cabezal]').innerHTML = op(unidades.filter((u) => u.rol === 'cabezal'));
  document.querySelector('#a-form [name=remolque]').innerHTML = op(unidades.filter((u) => u.rol === 'remolque'));
  document.querySelector('#s-form [name=unidad]').innerHTML = op(unidades);
}

const formU = $('u-form');
formU.tipo.onchange = () => {
  const cabezal = formU.tipo.value === 'tracto';
  $('u-km').classList.toggle('hidden', !cabezal);
  $('u-comps').classList.toggle('hidden', formU.tipo.value !== 'tanquero');
};
formU.onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(formU);
  const num = (k) => (f.get(k) === '' ? undefined : Number(f.get(k)));
  const cabezal = f.get('tipo') === 'tracto';
  try {
    await api('/unidades', {
      metodo: 'POST',
      cuerpo: {
        rol: cabezal ? 'cabezal' : 'remolque', tipo: f.get('tipo'), placa: f.get('placa'), marca: f.get('marca'), modelo: f.get('modelo'),
        anio: num('anio'), numEjes: num('numEjes'), numLlantas: num('numLlantas'),
        kmInicial: cabezal ? num('kmInicial') : undefined,
        compartimentos: f.get('tipo') === 'tanquero' ? String(f.get('compartimentos')).split(',').map((x) => Number(x.replace(/\D/g, ''))).filter((x) => !Number.isNaN(x)) : undefined,
      },
    });
    errorEn('u-error');
    formU.reset();
    formU.tipo.onchange();
    aviso('Unidad registrada con sus ejes, llantas y frenos');
    await cargarUnidades();
  } catch (err) {
    errorEn('u-error', err);
  }
};

$('a-form').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await api(`/unidades/${f.get('cabezal')}/acoplar`, { metodo: 'POST', cuerpo: { remolqueId: f.get('remolque') } });
    aviso('Remolque enganchado');
  } catch (err) {
    aviso(err.message, 'error');
  }
};
$('s-form').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await api(`/unidades/${f.get('unidad')}/asignar`, { metodo: 'POST', cuerpo: { choferId: f.get('chofer') } });
    aviso('Chofer asignado');
    await cargarChoferes();
  } catch (err) {
    aviso(err.message, 'error');
  }
};

// ---------------------------------------------------------------- inicio
$('d-salir').onclick = async () => {
  await api('/auth/salir', { metodo: 'POST' }).catch(() => {});
  localStorage.removeItem('mi_trailer_token');
  location.href = './index.html';
};

async function iniciar() {
  if (!API || !localStorage.getItem('mi_trailer_token')) return (location.href = './index.html');
  try {
    const { usuario } = await api('/auth/yo');
    if (usuario.rol !== 'dueno') return (location.href = './index.html');
    $('d-usuario').textContent = `${usuario.nombre} · ${usuario.email}`;
    pestana('reportes');
    await cargarChoferes();
    await Promise.all([cargarReportes(), cargarUnidades()]);
  } catch (err) {
    if (err.estado === 401) {
      localStorage.removeItem('mi_trailer_token');
      return (location.href = './index.html');
    }
    aviso(err.message || 'Sin conexión con el servidor', 'error');
  }
}
iniciar();
