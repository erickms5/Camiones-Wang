// Reporte de mantenimiento tal como lo ven el chofer y el dueño: siempre desde los datos congelados
// del servidor. Las fotos de las facturas van dentro del reporte y cada factura en PDF se agrega
// como hojas adicionales (página por página), de modo que todo se ve y se imprime junto.
import { api } from './sincronizacion.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dinero = (n) => `$${Number(n || 0).toFixed(2)}`;
const miles = (n) => Number(n || 0).toLocaleString('es-EC');
const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export const FORMAS_PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', cheque: 'Cheque', credito: 'Crédito' };
export const nombrePago = (forma) => FORMAS_PAGO[forma] || 'Sin indicar';
export function nombreMes(periodo) {
  const [a, m] = String(periodo || '').split('-').map(Number);
  if (!a || !m) return '';
  const t = new Date(a, m - 1, 1).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------- contenido
const esPdf = (e) => e.mime === 'application/pdf';
const figuraFoto = (e, pie) => `
  <figure class="border border-slate-300 rounded-lg p-2 bg-slate-50">
    <img data-ev="${esc(e.id)}" alt="${esc(e.nombreArchivo)}" class="foto-evidencia rounded border border-slate-200">
    <figcaption class="mt-1 text-[11px] space-y-0.5">
      <div class="font-bold">${esc(e.categoria)}${e.anexoPosterior ? ' · agregada después de emitir el reporte' : ''}</div>
      <div class="text-slate-600">${esc(pie)}</div>
      <div class="font-mono">Subida: ${esc(fechaHora(e.subidoEn))}</div>
    </figcaption>
  </figure>`;
const bloquePdf = (e, pie) => `
  <section class="hoja-pdf space-y-2" data-ev-pdf="${esc(e.id)}">
    <div class="text-xs"><span class="font-black uppercase">${esc(e.categoria)} (PDF)</span>${e.anexoPosterior ? ' · agregada después de emitir el reporte' : ''}
      <span class="text-slate-600"> · ${esc(pie)} · ${esc(e.nombreArchivo)} · subida: ${esc(fechaHora(e.subidoEn))}</span></div>
    <p data-estado class="italic text-slate-500 text-sm p-3">Cargando la factura…</p>
  </section>`;

function evidenciasHTML(lista) {
  const fotos = lista.filter((x) => !esPdf(x.e));
  const pdfs = lista.filter((x) => esPdf(x.e));
  if (!lista.length) return '<p class="italic text-slate-500 text-sm">Sin facturas ni fotos adjuntas.</p>';
  return `${fotos.length ? `<div class="evidencias-fotos grid grid-cols-1 sm:grid-cols-2 gap-3">${fotos.map((x) => figuraFoto(x.e, x.pie)).join('')}</div>` : ''}
    ${pdfs.map((x) => bloquePdf(x.e, x.pie)).join('')}`;
}

const pagoHTML = (forma) => (forma ? `<div class="text-[10px] ${forma === 'credito' ? 'font-black text-amber-700' : 'text-slate-500'}">${esc(nombrePago(forma))}</div>` : '');

// { reporte, integro, anexos } tal como responde GET /reportes/:folio
export function htmlReporte({ reporte, integro, anexos = [] }) {
  const d = reporte.datos;
  const celda = 'p-2 border border-slate-300 align-top';
  const dato = (k, v, mono = '') => `<div><span class="font-bold text-slate-500 block">${k}</span><span class="text-sm font-bold ${mono}">${esc(v || '—')}</span></div>`;
  const filas = d.mantenimientos.map((m) => `
    <tr>
      <td class="${celda} font-mono">${esc(m.fecha)}<div class="text-[10px] text-slate-500">${esc(miles(m.km))} km</div></td>
      <td class="${celda} font-bold">${esc(m.parte)}</td>
      <td class="${celda}">${esc(m.trabajo)}${m.notas ? `<div class="text-[10px] italic text-slate-500">${esc(m.notas)}</div>` : ''}</td>
      <td class="${celda}">${esc(m.taller || '—')}<div class="font-mono font-bold">${esc(dinero(m.costoTaller))}</div>${Number(m.costoTaller) > 0 ? pagoHTML(m.pagoTaller) : ''}</td>
      <td class="${celda}">${esc(m.proveedor || '—')}<div class="font-mono font-bold">${esc(dinero(m.costoRepuestos))}</div>${Number(m.costoRepuestos) > 0 ? pagoHTML(m.pagoRepuestos) : ''}
        ${m.repuestosDetalle ? `<div class="text-[10px] text-slate-500">${esc(m.repuestosDetalle)}</div>` : ''}</td>
      <td class="${celda} text-right font-mono font-bold">${esc(dinero(Number(m.costoTaller) + Number(m.costoRepuestos)))}</td>
    </tr>`).join('');
  const pie = (m) => `${m.trabajo} · ${m.parte} · ${m.fecha}`;
  const congeladas = d.mantenimientos.flatMap((m) => m.evidencias.map((e) => ({ e, pie: pie(m) })));
  const posteriores = anexos.map((e) => ({ e, pie: pie(d.mantenimientos.find((m) => m.id === e.mantenimientoId) || {}) }));
  const credito = d.mantenimientos.reduce((s, m) => s + (m.pagoTaller === 'credito' ? Number(m.costoTaller) : 0) + (m.pagoRepuestos === 'credito' ? Number(m.costoRepuestos) : 0), 0);
  const v = d.vehiculo;
  return `
    <div class="flex justify-between items-start border-b-2 border-slate-800 pb-3 gap-3">
      <div><h4 class="text-2xl font-black">REPORTE DE MANTENIMIENTO</h4>
        <p class="text-xs text-slate-600 uppercase font-bold">${reporte.tipo === 'mensual' ? `Mensual · ${esc(nombreMes(reporte.periodo))}` : 'De un solo trabajo'}</p></div>
      <div class="text-right"><span class="bg-slate-900 text-white font-mono text-xs font-bold px-3 py-1 rounded whitespace-nowrap">FOLIO: ${esc(reporte.folio)}</span>
        <p class="text-xs text-slate-500 mt-1 font-mono">Emisión: ${esc(fechaHora(reporte.generadoEn))}</p></div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-100 p-3 rounded-xl text-xs">
      ${dato('VEHÍCULO', v ? `${v.placa} · ${v.modelo}` : '')}
      ${dato('CHOFER', d.chofer.nombre)}${dato('CÉDULA', d.chofer.cedula, 'font-mono')}
    </div>
    <div class="overflow-x-auto"><table class="w-full text-left text-xs border-collapse">
      <thead><tr class="bg-slate-200 font-bold"><th class="${celda}">Fecha / Km</th><th class="${celda}">Parte</th><th class="${celda}">Trabajo</th><th class="${celda}">Taller (mano de obra)</th><th class="${celda}">Repuestos</th><th class="${celda} text-right">Total</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr class="font-black bg-slate-100"><td colspan="5" class="${celda} text-right">TOTAL (${d.mantenimientos.length} ${d.mantenimientos.length === 1 ? 'trabajo' : 'trabajos'})</td><td class="${celda} text-right">${esc(dinero(d.total))}</td></tr>
        ${credito > 0 ? `<tr class="font-bold text-amber-800"><td colspan="5" class="${celda} text-right">De ese total quedó a crédito al emitir el reporte</td><td class="${celda} text-right">${esc(dinero(credito))}</td></tr>` : ''}</tfoot>
    </table></div>
    <div class="space-y-2"><h5 class="text-xs font-black uppercase text-slate-700">Facturas y fotos adjuntas</h5>${evidenciasHTML(congeladas)}</div>
    ${posteriores.length ? `<div class="space-y-2 border-t border-slate-300 pt-3"><h5 class="text-xs font-black uppercase text-slate-700">Anexos agregados después de emitir el reporte</h5>${evidenciasHTML(posteriores)}</div>` : ''}
    <div class="pt-3 border-t border-slate-300 text-[10px] font-mono text-slate-600 space-y-1">
      <p><strong>HUELLA SHA-256:</strong> <span class="break-all">${esc(reporte.hash)}</span></p>
      <p class="${integro ? 'text-emerald-700' : 'text-rose-700'} font-bold">${integro ? '✔ Integridad verificada: el reporte no fue modificado desde que se emitió.' : '✖ ATENCIÓN: los datos no coinciden con la huella.'}</p>
    </div>`;
}

// Bloque de facturas para una hoja que no es un reporte (detalle de un mantenimiento)
export const htmlEvidencias = (evidencias, pie = '') => evidenciasHTML(evidencias.filter((e) => e.subidoEn).map((e) => ({ e, pie })));

// ---------------------------------------------------------------- archivos (fotos y PDF)
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379';
let pdfjs = null;
async function cargarPdfjs() {
  if (!pdfjs) {
    pdfjs = await import(`${PDFJS}/pdf.min.mjs`);
    pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
  }
  return pdfjs;
}

// Cada página del PDF se dibuja como imagen dentro del reporte (así también sale al imprimir)
async function dibujarPdf(seccion, blob) {
  const lib = await cargarPdfjs();
  const doc = await lib.getDocument({ data: await blob.arrayBuffer() }).promise;
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const vista = pagina.getViewport({ scale: 1.6 });
    const lienzo = Object.assign(document.createElement('canvas'), { width: vista.width, height: vista.height });
    await pagina.render({ canvasContext: lienzo.getContext('2d'), viewport: vista }).promise;
    const hoja = document.createElement('div');
    hoja.className = n > 1 ? 'hoja-pdf' : '';
    hoja.innerHTML = `<img alt="Página ${n} de la factura" src="${lienzo.toDataURL('image/jpeg', 0.85)}">${doc.numPages > 1 ? `<p class="text-[10px] text-slate-500 text-right">Página ${n} de ${doc.numPages}</p>` : ''}`;
    seccion.appendChild(hoja);
  }
}

const urls = [];
// Trae del servidor (con la sesión de quien mira) las fotos y los PDF de la hoja ya pintada
export async function cargarEvidencias(hoja) {
  urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  const falta = (el, texto) => el.replaceWith(Object.assign(document.createElement('div'), { className: 'italic text-slate-500 text-sm p-3 border border-dashed border-slate-300 rounded', textContent: texto }));
  await Promise.all([...hoja.querySelectorAll('[data-ev], [data-ev-pdf]')].map(async (el) => {
    const id = el.dataset.ev || el.dataset.evPdf;
    let blob;
    try {
      blob = await api(`/evidencias/${encodeURIComponent(id)}/archivo`);
    } catch {
      return el.dataset.ev ? falta(el, 'El archivo todavía no llega al servidor (falta señal en el teléfono del chofer).') : (el.querySelector('[data-estado]').textContent = 'El archivo todavía no llega al servidor.');
    }
    const u = URL.createObjectURL(blob);
    urls.push(u);
    if (el.dataset.ev) {
      el.src = u;
      return;
    }
    const estado = el.querySelector('[data-estado]');
    try {
      await dibujarPdf(el, blob);
      estado.remove();
    } catch {
      // Sin el lector de PDF (p. ej. sin internet): queda el enlace para abrirlo aparte
      estado.innerHTML = `No se pudo mostrar aquí. <a href="${u}" target="_blank" rel="noopener" class="underline font-bold text-cyan-700">Abrir la factura en PDF</a>`;
    }
  }));
}

// ---------------------------------------------------------------- ventana e impresión
export function imprimir(hoja) {
  let zona = document.getElementById('zona-impresion');
  if (!zona) document.body.appendChild((zona = Object.assign(document.createElement('div'), { id: 'zona-impresion' })));
  zona.replaceChildren(hoja.cloneNode(true));
  document.body.classList.add('imprimiendo');
  const limpiar = () => {
    document.body.classList.remove('imprimiendo');
    zona.replaceChildren();
    window.removeEventListener('afterprint', limpiar);
  };
  window.addEventListener('afterprint', limpiar);
  window.print();
}

// Abre una hoja blanca sobre la pantalla con botones para imprimir (o guardar como PDF) y cerrar
export function abrirHoja(titulo, html) {
  document.getElementById('ventana-hoja')?.remove();
  const fondo = document.createElement('div');
  fondo.id = 'ventana-hoja';
  fondo.className = 'fixed inset-0 bg-black/85 z-[55] flex items-start justify-center p-2 sm:p-6 overflow-y-auto';
  fondo.innerHTML = `
    <div class="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl p-3 sm:p-5 space-y-3 my-2">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-lg sm:text-xl font-black text-white truncate">${esc(titulo)}</h3>
        <div class="flex gap-2 shrink-0">
          <button type="button" data-imprimir disabled class="touch-target px-4 bg-emerald-500 disabled:opacity-50 text-slate-950 rounded-xl font-black"><i class="fa-solid fa-print mr-1"></i> Imprimir / PDF</button>
          <button type="button" data-cerrar class="touch-target px-3 text-slate-300 text-2xl" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="hoja-reporte rounded-2xl p-4 sm:p-7 space-y-4">${html}</div>
    </div>`;
  document.body.appendChild(fondo);
  const hoja = fondo.querySelector('.hoja-reporte');
  fondo.querySelector('[data-cerrar]').onclick = () => fondo.remove();
  const boton = fondo.querySelector('[data-imprimir]');
  boton.onclick = () => imprimir(hoja);
  // Se imprime cuando ya cargaron todas las fotos y facturas
  cargarEvidencias(hoja).finally(() => (boton.disabled = false));
  return hoja;
}

export async function abrirReporte(folio) {
  const datos = await api(`/reportes/${encodeURIComponent(folio)}`);
  return abrirHoja(`Reporte ${datos.reporte.folio}`, htmlReporte(datos));
}
