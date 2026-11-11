// Viajes y tanqueos del chofer.
//   «Carga»   = producto que lleva el tanque (Diésel, Súper o Ecopaís).
//   «Tanqueo» = combustible que consume el camión.
// Todo se guarda primero en el teléfono (funciona sin señal) y se envía con la misma cola de los mantenimientos.
// Los identificadores se crean aquí, así un reintento nunca duplica. La pantalla principal lo usa como window.Viajes.
import { api, ErrorApi, encolar, enCola, enviarPendientes, manejadores, preguntar } from './sincronizacion.js';
import { dialogo } from './panel.js';
import { abrirReporte } from './reporte.js';
import {
  MAX_PRODUCTOS, PRODUCTOS, TIPOS_LUGAR, errorCierre, errorProductos, errorSalida, errorTanqueo, galonesTanqueados, hoyEcuador, horaEcuador,
  kmRecorridos, mensajeViaje, miles, nombreProducto, normalizarLugar, nuevoId, pideRecordatorio, sugerirLugares, usarLugar, viajeAbierto, volumenTotal,
} from './viajes-logica.js';

const CLAVES = { viajes: 'mi_trailer_viajes', tanqueos: 'mi_trailer_tanqueos', lugares: 'mi_trailer_lugares' };
const SALTO_MAXIMO_KM = 60000;
const MAX_FOTO = 10 * 1024 * 1024;
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
const leer = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k)) || [];
  } catch {
    return [];
  }
};
const entero = (t) => (/^\d[\d.\s]*$/.test(String(t ?? '').trim()) ? Number(String(t).replace(/[.\s]/g, '')) : NaN);
const decimal = (t) => Number(String(t ?? '').trim().replace(',', '.'));
const fechaCorta = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');

// Estilos comunes: texto de 20 px y botones de 56 px de alto
const CAMPO = 'mt-1 w-full min-h-[56px] bg-slate-950 border-2 border-slate-700 rounded-2xl px-4 text-xl text-white font-bold focus:outline-none focus:border-emerald-500';
const ETIQUETA = 'block text-lg font-bold text-slate-200';
const BOTON = 'min-h-[56px] rounded-2xl font-black text-xl px-5 flex items-center justify-center gap-2';
const PRINCIPAL = `${BOTON} bg-emerald-500 hover:bg-emerald-400 text-slate-950`;
const SECUNDARIO = `${BOTON} border-2 border-slate-600 text-slate-100`;
const CELESTE = `${BOTON} bg-cyan-600 hover:bg-cyan-500 text-white`;

export function conectarViajes(app) {
  let viajes = leer(CLAVES.viajes);
  let tanqueos = leer(CLAVES.tanqueos);
  let lugares = leer(CLAVES.lugares);
  let ultimaTraida = 0;
  const filtros = { desde: '', hasta: '', destino: '', producto: '' };

  const guardar = () => {
    localStorage.setItem(CLAVES.viajes, JSON.stringify(viajes));
    localStorage.setItem(CLAVES.tanqueos, JSON.stringify(tanqueos));
    localStorage.setItem(CLAVES.lugares, JSON.stringify(lugares));
  };
  // Si entra otro chofer en este teléfono, se empieza con lo suyo (lo guardado del anterior ya se limpió)
  let usuario = app.session?.servidor?.usuarioId || null;
  const servidor = () => {
    const s = app.session?.servidor || null;
    if ((s?.usuarioId || null) !== usuario) {
      usuario = s?.usuarioId || null;
      viajes = leer(CLAVES.viajes);
      tanqueos = leer(CLAVES.tanqueos);
      lugares = leer(CLAVES.lugares);
      ultimaTraida = 0;
    }
    return s;
  };
  const cabezalId = () => servidor()?.cabezalId || null;
  const activos = () => viajes.filter((v) => v.activo !== false && v.cabezalId === cabezalId());
  const abierto = () => viajeAbierto(viajes, cabezalId());
  const susTanqueos = () => tanqueos.filter((t) => t.activo !== false && t.cabezalId === cabezalId());
  const ruta = (v) => `${v.origen} → ${v.destino}`;
  const aviso = (texto, tipo = 'success') => app.showToast(texto, tipo);
  const repintar = () => {
    pintarInicio();
    if (app.currentView === 'trips') pintarVista();
  };
  const subirKm = (km) => {
    const s = servidor();
    // El km actual solo sube; con el km pendiente (0) lo pone el dueño
    if (s && s.km > 0 && km > s.km) {
      s.km = km;
      app.saveStorage();
      app.refreshUI();
    }
  };

  // ---------------------------------------------------------------- envío al servidor
  const cuerpoViaje = (v) => ({
    unidadId: v.cabezalId, fechaSalida: v.fechaSalida, horaSalida: v.horaSalida,
    origen: { nombre: v.origen, tipo: v.origenTipo || null }, destino: { nombre: v.destino, tipo: v.destinoTipo || null },
    kmSalida: v.kmSalida, productos: v.productos, compartimentos: v.compartimentos?.length ? v.compartimentos : undefined,
    notas: v.notas || null, estado: v.estado,
    fechaRetorno: v.estado === 'cerrado' ? v.fechaRetorno : null, horaRetorno: v.estado === 'cerrado' ? v.horaRetorno : null, kmLlegada: v.estado === 'cerrado' ? v.kmLlegada : null,
  });

  manejadores.viaje = async (t) => {
    const v = viajes.find((x) => x.id === t.id);
    if (!v || v.activo === false) return;
    const r = await api(`/viajes/${v.id}`, { metodo: 'PUT', cuerpo: cuerpoViaje(v) });
    v.sincronizado = true;
    guardar();
    if (r.km) subirKm(r.km);
    (v.evidencias || []).filter((e) => !e.enviada).forEach((e) => encolar({ tipo: 'evidencia-viaje', id: v.id, evidencia: e.id }));
  };
  manejadores['evidencia-viaje'] = async (t) => {
    const v = viajes.find((x) => x.id === t.id);
    const ev = v?.evidencias?.find((e) => e.id === t.evidencia);
    if (!ev || ev.enviada) return;
    if (!ev.servidorId) {
      const r = await api(`/viajes/${v.id}/evidencias`, { metodo: 'POST', cuerpo: { categoria: 'Guía', nombreArchivo: ev.nombre, mime: ev.tipo } });
      ev.servidorId = r.evidencia.id;
      guardar();
    }
    const blob = await window.Evidencias.obtener(ev.id);
    if (blob) {
      try {
        await api(`/evidencias/${ev.servidorId}/archivo`, { metodo: 'PUT', archivo: blob, tipo: ev.tipo });
      } catch (e) {
        if (e.estado !== 409) throw e; // 409 = ya estaba subida
      }
    }
    ev.enviada = true;
    guardar();
  };
  manejadores.tanqueo = async (t) => {
    const q = tanqueos.find((x) => x.id === t.id);
    if (!q || q.activo === false) return;
    await api(`/tanqueos/${q.id}`, { metodo: 'PUT', cuerpo: { unidadId: q.cabezalId, viajeId: q.viajeId || null, fecha: q.fecha, hora: q.hora, galones: q.galones, lugar: q.lugar || null, km: q.km ?? null, costo: q.costo ?? null } });
    q.sincronizado = true;
    guardar();
  };
  const baja = (ruta_) => async (t) => {
    try {
      await api(`${ruta_}/${t.id}`, { metodo: 'DELETE' });
    } catch (e) {
      if (!(e instanceof ErrorApi) || e.estado !== 404) throw e; // 404 = nunca llegó al servidor
    }
  };
  manejadores['baja-viaje'] = baja('/viajes');
  manejadores['baja-tanqueo'] = baja('/tanqueos');

  const enviar = (tarea) => {
    guardar();
    if (servidor()) {
      encolar(tarea);
      enviarPendientes(app);
    }
  };

  // Trae lo que ya está en el servidor (otro teléfono, o registros que entraron a un reporte) sin pisar lo pendiente de envío
  async function traer() {
    if (!servidor() || !navigator.onLine) return;
    try {
      const [rv, rt, rl] = await Promise.all([api('/viajes'), api('/tanqueos'), api('/lugares')]);
      ultimaTraida = Date.now();
      const pendiente = (id) => enCola((t) => t.id === id);
      const fundir = (locales, delServidor, convertir) => {
        const ids = new Set(delServidor.map((x) => x.id));
        // Se conserva lo local que aún no se envía; lo ya enviado que el servidor no devuelve fue dado de baja
        const propios = locales.filter((x) => pendiente(x.id) || (!ids.has(x.id) && !x.sincronizado));
        const idsPropios = new Set(propios.map((x) => x.id));
        return [...propios, ...delServidor.filter((x) => !idsPropios.has(x.id)).map((x) => convertir(x, locales.find((l) => l.id === x.id)))];
      };
      viajes = fundir(viajes, rv.viajes, (v, local) => ({
        id: v.id, cabezalId: v.cabezalId, fechaSalida: v.fechaSalida, horaSalida: v.horaSalida, origen: v.origen, destino: v.destino,
        kmSalida: v.kmSalida, productos: v.productos, compartimentos: v.compartimentos || [], notas: v.notas || '', estado: v.estado,
        fechaRetorno: v.fechaRetorno, horaRetorno: v.horaRetorno, kmLlegada: v.kmLlegada, bloqueado: v.bloqueado, activo: true, sincronizado: true,
        evidencias: local?.evidencias || [],
      }));
      tanqueos = fundir(tanqueos, rt.tanqueos, (q) => ({
        id: q.id, cabezalId: q.cabezalId, viajeId: q.viajeId, fecha: q.fecha, hora: q.hora, galones: q.galones, lugar: q.lugar || '', km: q.km, costo: q.costo,
        bloqueado: q.bloqueado, activo: true, sincronizado: true,
      }));
      const delServidor = new Set(rl.lugares.map((l) => l.nombreNormalizado));
      lugares = [...rl.lugares.map((l) => ({ id: l.id, nombre: l.nombre, nombreNormalizado: l.nombreNormalizado, tipo: l.tipo, usadoComoCarga: l.usadoComoCarga, usadoComoDestino: l.usadoComoDestino, vecesUsado: l.vecesUsado, activo: true })),
        ...lugares.filter((l) => !delServidor.has(l.nombreNormalizado))];
      guardar();
      repintar();
    } catch {
      // sin señal: se sigue con lo guardado en el teléfono
    }
  }

  // ---------------------------------------------------------------- ventana propia (pasos y formularios largos)
  function ventana(titulo, subtitulo = '') {
    $('ventana-viaje')?.remove();
    const fondo = document.createElement('div');
    fondo.id = 'ventana-viaje';
    fondo.className = 'fixed inset-0 bg-black/80 z-50 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 overflow-y-auto';
    fondo.innerHTML = `
      <div class="bg-slate-900 border-2 border-slate-700 rounded-3xl w-full max-w-xl p-5 sm:p-7 shadow-2xl space-y-4 my-2" role="dialog" aria-modal="true" aria-labelledby="vv-titulo">
        <div class="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-12 h-12 shrink-0 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl"><i class="fa-solid fa-route"></i></div>
            <div class="min-w-0"><h3 id="vv-titulo" class="text-2xl font-black text-white">${esc(titulo)}</h3><p id="vv-subtitulo" class="text-base text-slate-400">${esc(subtitulo)}</p></div>
          </div>
          <button type="button" data-cerrar class="min-h-[56px] min-w-[56px] text-slate-300 hover:text-white flex flex-col items-center justify-center"><i class="fa-solid fa-xmark text-2xl"></i><span class="text-sm font-bold">Cerrar</span></button>
        </div>
        <div data-cuerpo class="space-y-4"></div>
      </div>`;
    document.body.appendChild(fondo);
    const cerrar = () => fondo.remove();
    fondo.querySelector('[data-cerrar]').onclick = cerrar;
    return { fondo, cuerpo: fondo.querySelector('[data-cuerpo]'), cerrar, subtitulo: (t) => (fondo.querySelector('#vv-subtitulo').textContent = t) };
  }

  // ---------------------------------------------------------------- formulario de viaje
  // modo 'nuevo'  → tres pasos; el viaje queda abierto.
  // modo 'pasado' → una sola pantalla con todo (incluido el retorno), para pasar bitácoras atrasadas.
  // modo 'editar' → una sola pantalla para corregir un viaje que aún no está en un reporte.
  function formularioViaje(modo, base = null, conservar = null) {
    const editando = modo === 'editar';
    const conRetorno = modo === 'pasado' || (editando && base.estado === 'cerrado');
    const porPasos = modo === 'nuevo';
    const hoy = hoyEcuador();
    const ultimo = activos().filter((v) => v.id !== base?.id).sort((a, b) => `${b.fechaSalida}${b.horaSalida}`.localeCompare(`${a.fechaSalida}${a.horaSalida}`))[0];
    const f = editando ? {
      fechaSalida: base.fechaSalida, horaSalida: base.horaSalida, origen: base.origen, origenTipo: base.origenTipo || '', destino: base.destino, destinoTipo: base.destinoTipo || '',
      productos: base.productos.map((p) => ({ producto: p.producto, galones: String(p.galones), numeroGuia: p.numeroGuia })),
      compartimentos: Object.fromEntries((base.compartimentos || []).map((c) => [c.numero, c.producto])),
      kmSalida: String(base.kmSalida), fechaRetorno: base.fechaRetorno || hoy, horaRetorno: base.horaRetorno || horaEcuador(), kmLlegada: base.kmLlegada ? String(base.kmLlegada) : '', notas: base.notas || '',
    } : {
      // Sin datos de ejemplo: solo la fecha y la hora de ahora, y el km actual del vehículo (se pueden cambiar)
      fechaSalida: hoy, horaSalida: modo === 'nuevo' ? horaEcuador() : '', origen: conservar?.origen || '', origenTipo: '', destino: conservar?.destino || '', destinoTipo: '',
      productos: [{ producto: '', galones: '', numeroGuia: '' }], compartimentos: {},
      kmSalida: modo === 'nuevo' && app.getMaxKm() > 0 ? String(app.getMaxKm()) : '', fechaRetorno: hoy, horaRetorno: '', kmLlegada: '', notas: '',
    };
    let evidencia = null; // foto de la guía (opcional)
    let guardandoFoto = null;
    let paso = 1;
    const titulos = { nuevo: 'Nuevo viaje', pasado: 'Viaje ya terminado', editar: 'Corregir viaje' };
    const v = ventana(titulos[modo], porPasos ? 'Paso 1 de 3' : modo === 'pasado' ? 'Para pasar la bitácora de días anteriores' : ruta(base));

    const tanque = app.session?.vehiculo?.compartimentos || [];
    const elegidos = () => f.productos.map((p) => p.producto).filter(Boolean);
    const opcionesProducto = (actual) => `<option value="">Elige…</option>${PRODUCTOS.filter((p) => p.id === actual || !elegidos().includes(p.id)).map((p) => `<option value="${p.id}" ${p.id === actual ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}`;

    const campoLugar = (clave, etiqueta, uso) => `
      <div>
        <label class="${ETIQUETA}" for="vj-${clave}">${etiqueta}</label>
        <input type="text" id="vj-${clave}" value="${esc(f[clave])}" maxlength="80" autocomplete="off" placeholder="Escribe el nombre" class="${CAMPO}">
        <div id="vj-${clave}-sug" data-uso="${uso}" class="flex flex-wrap gap-2 mt-2"></div>
        <label id="vj-${clave}-tipo-caja" class="hidden mt-2 text-base font-bold text-slate-300">Lugar nuevo. ¿Qué es? (opcional)
          <select id="vj-${clave}-tipo" class="${CAMPO}"><option value="">Sin indicar</option>${TIPOS_LUGAR.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</select></label>
      </div>`;

    const seccionDatos = () => `
      <section data-paso="1" class="space-y-4">
        ${ultimo && !editando ? `<button type="button" id="vj-igual" class="${SECUNDARIO} w-full"><i class="fa-solid fa-rotate-left"></i><span>Igual que el último viaje</span></button>` : ''}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="${ETIQUETA}" for="vj-fecha">Fecha de salida
            <input type="date" id="vj-fecha" value="${esc(f.fechaSalida)}" max="${hoy}" class="${CAMPO}"></label>
          <label class="${ETIQUETA}" for="vj-hora">Hora de salida
            <input type="time" id="vj-hora" value="${esc(f.horaSalida)}" class="${CAMPO}"></label>
        </div>
        ${campoLugar('origen', 'Lugar de carga', 'carga')}
        ${campoLugar('destino', 'Destino final', 'destino')}
      </section>`;

    const seccionCarga = () => `
      <section data-paso="2" class="space-y-4">
        <div>
          <p class="text-xl font-black text-white">Carga del tanque</p>
          <p class="text-base text-slate-400">Producto que llevas, sus galones y el número de guía.</p>
        </div>
        <div id="vj-productos" class="space-y-3"></div>
        <button type="button" id="vj-agregar" class="${SECUNDARIO} w-full"><i class="fa-solid fa-plus"></i><span>Agregar producto</span></button>
        <div class="bg-slate-950 border-2 border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <span class="text-lg font-bold text-slate-300">Volumen total</span>
          <span id="vj-volumen" class="text-3xl font-black font-mono text-emerald-400">0 gal</span>
        </div>
        ${tanque.length ? `<details class="bg-slate-950 border-2 border-slate-800 rounded-2xl">
          <summary class="min-h-[56px] px-4 flex items-center gap-2 cursor-pointer text-lg font-bold text-cyan-300"><i class="fa-solid fa-cubes"></i><span>¿En qué compartimentos va? (opcional)</span></summary>
          <div class="p-3 pt-0 space-y-2">
            <p class="text-base text-slate-400">Toca un compartimento para cambiar su producto. El 1 es el de adelante.</p>
            <div id="vj-tanque" class="flex gap-2"></div>
          </div>
        </details>` : ''}
      </section>`;

    const seccionSalida = () => `
      <section data-paso="3" class="space-y-4">
        <label class="${ETIQUETA}" for="vj-km-salida">Kilometraje de salida
          <input type="text" inputmode="numeric" id="vj-km-salida" value="${esc(f.kmSalida)}" placeholder="Lo que marca el tablero" class="${CAMPO} font-mono"></label>
        ${conRetorno ? `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="${ETIQUETA}" for="vj-fecha-retorno">Fecha de retorno
              <input type="date" id="vj-fecha-retorno" value="${esc(f.fechaRetorno)}" max="${hoy}" class="${CAMPO}"></label>
            <label class="${ETIQUETA}" for="vj-hora-retorno">Hora de retorno
              <input type="time" id="vj-hora-retorno" value="${esc(f.horaRetorno)}" class="${CAMPO}"></label>
          </div>
          <label class="${ETIQUETA}" for="vj-km-llegada">Kilometraje de llegada
            <input type="text" inputmode="numeric" id="vj-km-llegada" value="${esc(f.kmLlegada)}" placeholder="Lo que marcaba al volver" class="${CAMPO} font-mono"></label>` : ''}
        ${editando ? '' : `<div class="bg-slate-950 border-2 border-slate-800 rounded-2xl p-4 space-y-2">
          <label class="${ETIQUETA}" for="vj-foto">Foto de la guía (opcional)</label>
          <input type="file" id="vj-foto" accept="image/*,.pdf" class="block w-full text-lg text-slate-300 file:mr-3 file:min-h-[56px] file:px-5 file:rounded-2xl file:border-0 file:text-lg file:font-black file:bg-cyan-600 file:text-white">
          <p id="vj-foto-estado" class="text-base text-slate-400">Puedes tomarla ahora o agregarla después.</p>
        </div>`}
      </section>`;

    v.cuerpo.innerHTML = `
      <form id="vj-form" novalidate class="space-y-5">
        ${seccionDatos()}${seccionCarga()}${seccionSalida()}
        <p id="vj-error" class="hidden text-xl font-bold text-amber-300 bg-amber-500/10 border-2 border-amber-500/50 rounded-2xl p-4" role="alert"></p>
        <div class="flex flex-col-reverse sm:flex-row gap-3">
          <button type="button" id="vj-atras" class="${SECUNDARIO} sm:flex-1"><i class="fa-solid fa-arrow-left"></i><span>Atrás</span></button>
          <button type="submit" id="vj-seguir" class="${PRINCIPAL} sm:flex-1"><span id="vj-seguir-texto"></span><i class="fa-solid fa-arrow-right"></i></button>
        </div>
      </form>`;

    const error = (texto) => {
      const e = $('vj-error');
      e.textContent = texto || '';
      e.classList.toggle('hidden', !texto);
      if (texto) e.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    // ---- lugares con sugerencias (los más usados primero; sin distinguir mayúsculas ni tildes)
    const conectarLugar = (clave) => {
      const entrada = $(`vj-${clave}`);
      const caja = $(`vj-${clave}-sug`);
      const pintarSugerencias = () => {
        f[clave] = entrada.value;
        const norm = normalizarLugar(entrada.value);
        const existe = lugares.some((l) => l.nombreNormalizado === norm);
        const lista = sugerirLugares(lugares, entrada.value, caja.dataset.uso, 5).filter((l) => l.nombreNormalizado !== norm || l.nombre !== entrada.value.trim());
        caja.innerHTML = lista.map((l) => `<button type="button" data-nombre="${esc(l.nombre)}" class="min-h-[56px] px-4 rounded-2xl bg-slate-800 border-2 border-slate-600 text-lg font-bold text-white">${esc(l.nombre)}</button>`).join('');
        caja.querySelectorAll('[data-nombre]').forEach((b) => (b.onclick = () => {
          entrada.value = b.dataset.nombre;
          pintarSugerencias();
        }));
        $(`vj-${clave}-tipo-caja`).classList.toggle('hidden', !norm || existe);
      };
      entrada.oninput = pintarSugerencias;
      entrada.onfocus = pintarSugerencias;
      $(`vj-${clave}-tipo`).onchange = (e) => (f[`${clave}Tipo`] = e.target.value);
      pintarSugerencias();
    };
    conectarLugar('origen');
    conectarLugar('destino');
    $('vj-fecha').onchange = (e) => (f.fechaSalida = e.target.value);
    $('vj-hora').onchange = (e) => (f.horaSalida = e.target.value);
    if ($('vj-igual')) {
      $('vj-igual').onclick = () => {
        $('vj-origen').value = ultimo.origen;
        $('vj-destino').value = ultimo.destino;
        $('vj-origen').dispatchEvent(new Event('input'));
        $('vj-destino').dispatchEvent(new Event('input'));
      };
    }

    // ---- productos (máximo 3, sin repetir) y compartimentos
    const pintarTanque = () => {
      const caja = $('vj-tanque');
      if (!caja) return;
      Object.keys(f.compartimentos).forEach((n) => !elegidos().includes(f.compartimentos[n]) && delete f.compartimentos[n]);
      caja.innerHTML = tanque.map((g, i) => {
        const p = f.compartimentos[i + 1];
        return `<button type="button" data-comp="${i + 1}" style="flex:${Number(g) || 1}" class="min-h-[72px] rounded-xl border-2 ${p ? 'bg-cyan-600/30 border-cyan-400' : 'bg-slate-900 border-slate-700'} px-1 py-2 text-center">
          <span class="block text-base font-black text-slate-300">${i + 1}</span>
          <span class="block text-base font-bold ${p ? 'text-cyan-100' : 'text-slate-500'}">${esc(p ? nombreProducto(p) : 'Vacío')}</span></button>`;
      }).join('');
      caja.querySelectorAll('[data-comp]').forEach((b) => (b.onclick = () => {
        const opciones = [undefined, ...elegidos()];
        const sig = opciones[(opciones.indexOf(f.compartimentos[b.dataset.comp]) + 1) % opciones.length];
        if (sig) f.compartimentos[b.dataset.comp] = sig;
        else delete f.compartimentos[b.dataset.comp];
        pintarTanque();
      }));
    };
    const pintarVolumen = () => ($('vj-volumen').textContent = `${miles(volumenTotal(f.productos.map((p) => ({ galones: entero(p.galones) || 0 }))))} gal`);
    const pintarProductos = () => {
      $('vj-productos').innerHTML = f.productos.map((p, i) => `
        <div class="bg-slate-950 border-2 border-slate-800 rounded-2xl p-3 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-lg font-black text-emerald-300">Producto ${i + 1}</span>
            ${f.productos.length > 1 ? `<button type="button" data-quitar="${i}" class="min-h-[56px] px-4 rounded-2xl border-2 border-rose-500/50 text-rose-300 text-lg font-bold flex items-center gap-2"><i class="fa-solid fa-trash-can"></i><span>Quitar</span></button>` : ''}
          </div>
          <label class="${ETIQUETA}" for="vj-p-${i}">Producto
            <select id="vj-p-${i}" data-i="${i}" data-campo="producto" class="${CAMPO}">${opcionesProducto(p.producto)}</select></label>
          <div class="grid grid-cols-2 gap-3">
            <label class="${ETIQUETA}" for="vj-g-${i}">Galones
              <input type="text" inputmode="numeric" id="vj-g-${i}" data-i="${i}" data-campo="galones" value="${esc(p.galones)}" class="${CAMPO} font-mono"></label>
            <label class="${ETIQUETA}" for="vj-n-${i}">N.º de guía
              <input type="text" inputmode="numeric" id="vj-n-${i}" data-i="${i}" data-campo="numeroGuia" value="${esc(p.numeroGuia)}" maxlength="40" class="${CAMPO} font-mono"></label>
          </div>
        </div>`).join('');
      $('vj-productos').querySelectorAll('[data-campo]').forEach((el) => {
        const anotar = () => {
          f.productos[el.dataset.i][el.dataset.campo] = el.value;
          if (el.dataset.campo === 'producto') {
            pintarProductos(); // las otras filas dejan de ofrecer el producto ya elegido
            pintarTanque();
          } else pintarVolumen();
        };
        el[el.tagName === 'SELECT' ? 'onchange' : 'oninput'] = anotar;
      });
      $('vj-productos').querySelectorAll('[data-quitar]').forEach((b) => (b.onclick = () => {
        f.productos.splice(Number(b.dataset.quitar), 1);
        pintarProductos();
        pintarTanque();
      }));
      $('vj-agregar').classList.toggle('hidden', f.productos.length >= MAX_PRODUCTOS);
      pintarVolumen();
    };
    $('vj-agregar').onclick = () => {
      if (f.productos.length < MAX_PRODUCTOS) f.productos.push({ producto: '', galones: '', numeroGuia: '' });
      pintarProductos();
    };
    pintarProductos();
    pintarTanque();

    // ---- foto de la guía (máximo 10 MB)
    if ($('vj-foto')) {
      $('vj-foto').onchange = (e) => {
        const archivo = e.target.files[0];
        const estado = $('vj-foto-estado');
        evidencia = null;
        if (!archivo) return (estado.textContent = 'Puedes tomarla ahora o agregarla después.');
        if (archivo.size > MAX_FOTO) {
          e.target.value = '';
          return (estado.textContent = 'Esa foto pesa más de 10 MB. Toma otra o elige una más pequeña.');
        }
        estado.textContent = 'Guardando la foto…';
        guardandoFoto = window.Evidencias.guardar(archivo, 'Guía').then((ev) => {
          evidencia = ev;
          estado.textContent = `Foto lista: ${archivo.name}`;
        }).catch(() => (estado.textContent = 'No se pudo guardar la foto en el teléfono. Intenta otra vez.'));
      };
    }

    // ---- datos del formulario → viaje
    const leerViaje = () => ({
      fechaSalida: $('vj-fecha').value, horaSalida: $('vj-hora').value, origen: $('vj-origen').value.replace(/\s+/g, ' ').trim(), destino: $('vj-destino').value.replace(/\s+/g, ' ').trim(),
      kmSalida: entero($('vj-km-salida').value),
      productos: f.productos.map((p) => ({ producto: p.producto, galones: entero(p.galones), numeroGuia: String(p.numeroGuia).trim() })),
      fechaRetorno: $('vj-fecha-retorno')?.value || null, horaRetorno: $('vj-hora-retorno')?.value || null, kmLlegada: $('vj-km-llegada') ? entero($('vj-km-llegada').value) : null,
    });
    const errorDePaso = (d, n) => {
      if (n === 1) return errorSalida({ ...d, kmSalida: 0 }, hoy);
      if (n === 2) return errorProductos(d.productos);
      const km = app.getMaxKm();
      const mayor = conRetorno ? d.kmLlegada : d.kmSalida;
      return errorSalida(d, hoy) || (conRetorno ? errorCierre(d, hoy) : null)
        || (km > 0 && mayor > km + SALTO_MAXIMO_KM ? `El kilometraje ${miles(mayor)} es mucho mayor al actual (${miles(km)}). Revisa que esté bien escrito.` : null);
    };

    const mostrarPaso = () => {
      v.cuerpo.querySelectorAll('[data-paso]').forEach((s) => s.classList.toggle('hidden', porPasos && Number(s.dataset.paso) !== paso));
      $('vj-atras').classList.toggle('hidden', !porPasos || paso === 1);
      $('vj-seguir-texto').textContent = porPasos && paso < 3 ? 'Siguiente' : editando ? 'Guardar cambios' : 'Guardar viaje';
      if (porPasos) v.subtitulo(`Paso ${paso} de 3 · ${['Datos del viaje', 'Carga', 'Kilometraje y guía'][paso - 1]}`);
      error('');
    };
    $('vj-atras').onclick = () => {
      paso = Math.max(1, paso - 1);
      mostrarPaso();
    };

    $('vj-form').onsubmit = async (e) => {
      e.preventDefault();
      const d = leerViaje();
      const problema = porPasos ? errorDePaso(d, paso) : errorDePaso(d, 1) || errorDePaso(d, 2) || errorDePaso(d, 3);
      if (problema) return error(problema);
      if (porPasos && paso < 3) {
        paso += 1;
        return mostrarPaso();
      }
      if (guardandoFoto) await guardandoFoto;
      const cerrado = conRetorno;
      const viaje = {
        ...(base || {}), id: base?.id || nuevoId(), cabezalId: cabezalId(), ...d,
        origenTipo: f.origenTipo || base?.origenTipo || null, destinoTipo: f.destinoTipo || base?.destinoTipo || null,
        compartimentos: Object.entries(f.compartimentos).map(([numero, producto]) => ({ numero: Number(numero), producto })),
        notas: f.notas, estado: cerrado ? 'cerrado' : 'abierto',
        fechaRetorno: cerrado ? d.fechaRetorno : null, horaRetorno: cerrado ? d.horaRetorno : null, kmLlegada: cerrado ? d.kmLlegada : null,
        bloqueado: false, activo: true, sincronizado: false,
        evidencias: [...(base?.evidencias || []), ...(evidencia ? [evidencia] : [])],
      };
      // El lugar se guarda la primera vez; después se reutiliza el mismo (nunca se duplica)
      viaje.origen = usarLugar(lugares, viaje.origen, 'carga', { tipo: viaje.origenTipo, contar: !editando }).nombre;
      viaje.destino = usarLugar(lugares, viaje.destino, 'destino', { tipo: viaje.destinoTipo, contar: !editando }).nombre;
      viajes = [viaje, ...viajes.filter((x) => x.id !== viaje.id)];
      const kmAntes = app.getMaxKm();
      enviar({ tipo: 'viaje', id: viaje.id });
      v.cerrar();
      if (cerrado) {
        if (kmAntes > 0 && viaje.kmLlegada < kmAntes) aviso('Este viaje es de una fecha anterior; no cambia tu kilometraje actual', 'info');
        else subirKm(viaje.kmLlegada);
      }
      repintar();
      if (modo === 'pasado') {
        if (await preguntar('Viaje guardado', `${ruta(viaje)} · ${fechaCorta(viaje.fechaSalida)}. ¿Quieres pasar otro viaje con el mismo lugar de carga y el mismo destino?`, 'Registrar otro')) {
          formularioViaje('pasado', null, { origen: viaje.origen, destino: viaje.destino });
        }
      } else aviso(editando ? 'Viaje corregido' : 'Viaje guardado. Buen viaje.');
    };
    mostrarPaso();
  }

  // ---------------------------------------------------------------- acciones
  async function nuevo() {
    if (!servidor()) return;
    const a = abierto();
    if (a) {
      if (await preguntar('Ya tienes un viaje abierto', `${ruta(a)}, salida ${fechaCorta(a.fechaSalida)} a las ${a.horaSalida}. Termínalo antes de empezar otro.`, 'Terminar ese viaje')) terminar(a);
      return;
    }
    formularioViaje('nuevo');
  }

  async function terminar(v) {
    const r = await dialogo({
      titulo: 'Terminar viaje', texto: `${ruta(v)} · saliste con ${miles(v.kmSalida)} km.`, boton: 'Terminar viaje',
      campos: [
        { nombre: 'fechaRetorno', etiqueta: 'Fecha de retorno', tipo: 'fecha', valor: hoyEcuador() },
        { nombre: 'horaRetorno', etiqueta: 'Hora de retorno', tipo: 'hora', valor: horaEcuador() },
        { nombre: 'kmLlegada', etiqueta: 'Kilometraje de llegada (lo que marca el tablero)', tipo: 'numero', mono: true },
      ],
      alAceptar: (x) => {
        const d = { ...v, fechaRetorno: x.fechaRetorno, horaRetorno: x.horaRetorno, kmLlegada: entero(x.kmLlegada) };
        const km = app.getMaxKm();
        const problema = errorCierre(d) || (km > 0 && d.kmLlegada > km + SALTO_MAXIMO_KM ? `El kilometraje ${miles(d.kmLlegada)} es mucho mayor al actual (${miles(km)}). Revisa que esté bien escrito.` : null);
        if (problema) throw new Error(problema);
        return d;
      },
    });
    if (!r) return;
    Object.assign(v, { fechaRetorno: r.fechaRetorno, horaRetorno: r.horaRetorno, kmLlegada: r.kmLlegada, estado: 'cerrado', sincronizado: false });
    const kmAntes = app.getMaxKm();
    enviar({ tipo: 'viaje', id: v.id });
    if (kmAntes > 0 && v.kmLlegada < kmAntes) aviso('Viaje terminado. Es de una fecha anterior; no cambia tu kilometraje actual', 'info');
    else {
      subirKm(v.kmLlegada);
      aviso(`Viaje terminado: ${miles(kmRecorridos(v))} km recorridos`);
    }
    repintar();
  }

  // «Tanqueé»: combustible que consume el camión. Con viaje abierto queda ligado a él.
  async function tanquear(existente = null) {
    if (!servidor()) return;
    const a = existente ? viajes.find((x) => x.id === existente.viajeId) : abierto();
    const r = await dialogo({
      titulo: existente ? 'Corregir tanqueo' : 'Tanqueé',
      texto: a ? `Queda anotado en tu viaje: ${ruta(a)}.` : 'No hay un viaje abierto: queda anotado en el vehículo.',
      boton: 'Guardar tanqueo',
      campos: [
        { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', valor: existente?.fecha || hoyEcuador() },
        { nombre: 'hora', etiqueta: 'Hora', tipo: 'hora', valor: existente?.hora || horaEcuador() },
        { nombre: 'galones', etiqueta: 'Galones que tanqueaste', tipo: 'decimal', valor: existente?.galones ?? '', mono: true },
        { nombre: 'lugar', etiqueta: 'Lugar', valor: existente?.lugar || '', opcional: true },
        { nombre: 'km', etiqueta: 'Kilometraje', tipo: 'numero', valor: existente?.km ?? '', opcional: true, mono: true },
        { nombre: 'costo', etiqueta: 'Costo en dólares', tipo: 'decimal', valor: existente?.costo ?? '', opcional: true, mono: true },
      ],
      alAceptar: (x) => {
        const d = { fecha: x.fecha, hora: x.hora, galones: decimal(x.galones), lugar: x.lugar || '', km: x.km ? entero(x.km) : null, costo: x.costo ? decimal(x.costo) : null };
        const problema = errorTanqueo(d) || (x.km && !Number.isInteger(d.km) ? 'Escribe el kilometraje solo con números.' : null) || (x.costo && !(d.costo >= 0) ? 'Escribe el costo solo con números.' : null);
        if (problema) throw new Error(problema);
        return d;
      },
    });
    if (!r) return;
    const q = { ...(existente || {}), id: existente?.id || nuevoId(), cabezalId: cabezalId(), viajeId: existente ? existente.viajeId : a?.id || null, ...r, bloqueado: false, activo: true, sincronizado: false };
    tanqueos = [q, ...tanqueos.filter((x) => x.id !== q.id)];
    enviar({ tipo: 'tanqueo', id: q.id });
    aviso(`Tanqueo guardado: ${miles(q.galones)} galones`);
    repintar();
  }

  async function darDeBaja(tipo, registro) {
    const esViaje = tipo === 'viaje';
    if (!(await preguntar(esViaje ? '¿Dar de baja este viaje?' : '¿Dar de baja este tanqueo?', esViaje ? `${ruta(registro)} · ${fechaCorta(registro.fechaSalida)}. Deja de aparecer en tu historial.` : `${fechaCorta(registro.fecha)} · ${miles(registro.galones)} galones. Deja de aparecer en tu historial.`, 'Dar de baja', true))) return;
    registro.activo = false;
    if (esViaje) tanqueos.forEach((t) => t.viajeId === registro.id && (t.viajeId = null));
    enviar({ tipo: esViaje ? 'baja-viaje' : 'baja-tanqueo', id: registro.id });
    $('ventana-viaje')?.remove();
    aviso(esViaje ? 'Viaje dado de baja' : 'Tanqueo dado de baja', 'info');
    repintar();
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Respaldo para teléfonos que no dejan usar el portapapeles directamente
      const area = Object.assign(document.createElement('textarea'), { value: texto });
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    aviso('Mensaje copiado. Pégalo donde lo necesites.');
  }

  async function reporteDeViaje(v) {
    if (!navigator.onLine) return aviso('Necesitas señal para emitir el reporte', 'warning');
    await enviarPendientes(app);
    if (enCola((t) => t.id === v.id)) return aviso('El viaje aún se está enviando. Intenta de nuevo en un momento.', 'warning');
    try {
      const { reporte } = await api('/reportes', { metodo: 'POST', cuerpo: { tipo: 'viaje', viajeId: v.id } });
      await abrirReporte(reporte.folio);
    } catch (err) {
      aviso(err instanceof ErrorApi ? err.message : 'No hay conexión con el servidor. Intenta cuando tengas señal.', 'warning');
    }
  }

  function agregarFoto(v) {
    const entrada = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*,.pdf' });
    entrada.onchange = async () => {
      const archivo = entrada.files[0];
      if (!archivo) return;
      if (archivo.size > MAX_FOTO) return aviso('Esa foto pesa más de 10 MB. Toma otra o elige una más pequeña.', 'warning');
      try {
        const ev = await window.Evidencias.guardar(archivo, 'Guía');
        v.evidencias = [...(v.evidencias || []), ev];
        enviar(v.sincronizado ? { tipo: 'evidencia-viaje', id: v.id, evidencia: ev.id } : { tipo: 'viaje', id: v.id });
        aviso(v.bloqueado ? 'Foto guardada: entra al reporte como anexo posterior' : 'Foto de la guía guardada');
        detalle(v);
      } catch {
        aviso('No se pudo guardar la foto en el teléfono', 'warning');
      }
    };
    entrada.click();
  }

  // ---------------------------------------------------------------- detalle de un viaje
  const lineaProductos = (v) => v.productos.map((p) => `${nombreProducto(p.producto)} ${miles(p.galones)} gal · guía ${p.numeroGuia}`);
  const insignia = (v) => (v.bloqueado ? ['Congelado en un reporte', 'bg-cyan-950 text-cyan-200 border-cyan-700'] : v.estado === 'abierto' ? ['Viaje abierto', 'bg-amber-500/20 text-amber-200 border-amber-500/60'] : ['Terminado', 'bg-slate-800 text-slate-200 border-slate-600']);

  function detalle(v) {
    const w = ventana('Detalle del viaje', ruta(v));
    const suyos = susTanqueos().filter((t) => t.viajeId === v.id);
    const dato = (k, valor) => `<div class="flex justify-between gap-3 py-2 border-b border-slate-800"><span class="text-lg text-slate-400 font-bold">${k}</span><span class="text-lg text-white font-bold text-right">${valor}</span></div>`;
    const [texto, clases] = insignia(v);
    w.cuerpo.innerHTML = `
      <span class="inline-block px-3 py-1 rounded-full text-base font-black border-2 ${clases}">${esc(texto)}</span>
      <div>
        ${dato('Salida', `${esc(fechaCorta(v.fechaSalida))} · ${esc(v.horaSalida)}`)}
        ${dato('Retorno', v.estado === 'cerrado' ? `${esc(fechaCorta(v.fechaRetorno))} · ${esc(v.horaRetorno)}` : 'Aún en viaje')}
        ${dato('Lugar de carga', esc(v.origen))}
        ${dato('Destino final', esc(v.destino))}
        ${dato('Carga', lineaProductos(v).map(esc).join('<br>'))}
        ${dato('Volumen total', `${esc(miles(volumenTotal(v.productos)))} gal`)}
        ${v.compartimentos?.length ? dato('Compartimentos', v.compartimentos.map((c) => `${c.numero}: ${esc(nombreProducto(c.producto))}`).join(' · ')) : ''}
        ${dato('Km de salida', esc(miles(v.kmSalida)))}
        ${v.estado === 'cerrado' ? dato('Km de llegada', esc(miles(v.kmLlegada))) + dato('Km recorridos', esc(miles(kmRecorridos(v)))) : ''}
        ${dato('Tanqueos', suyos.length ? `${esc(miles(galonesTanqueados(tanqueos, v.id)))} gal en ${suyos.length} ${suyos.length === 1 ? 'tanqueo' : 'tanqueos'}` : 'Ninguno')}
        ${dato('Fotos de guía', (v.evidencias || []).length ? (v.evidencias || []).map((e) => esc(e.nombre)).join('<br>') : 'Sin foto')}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button type="button" data-a="copiar" class="${CELESTE}"><i class="fa-solid fa-copy"></i><span>Copiar mensaje</span></button>
        <button type="button" data-a="foto" class="${SECUNDARIO}"><i class="fa-solid fa-camera"></i><span>Agregar foto de guía</span></button>
        ${v.estado === 'abierto' ? `<button type="button" data-a="terminar" class="${PRINCIPAL}"><i class="fa-solid fa-flag-checkered"></i><span>Terminar viaje</span></button>` : `<button type="button" data-a="reporte" class="${SECUNDARIO}"><i class="fa-solid fa-file-lines"></i><span>Reporte del viaje</span></button>`}
        ${v.bloqueado ? '' : `<button type="button" data-a="corregir" class="${SECUNDARIO}"><i class="fa-solid fa-pen"></i><span>Corregir</span></button>
        <button type="button" data-a="baja" class="${BOTON} border-2 border-rose-500/60 text-rose-200"><i class="fa-solid fa-trash-can"></i><span>Dar de baja</span></button>`}
      </div>
      ${v.bloqueado ? '<p class="text-base text-slate-400">Este viaje ya está en un reporte emitido: no se puede corregir. Las fotos que agregues entran como anexo.</p>' : ''}`;
    const accion = { copiar: () => copiar(mensajeViaje(v, tanqueos)), foto: () => agregarFoto(v), terminar: () => { w.cerrar(); terminar(v); }, reporte: () => reporteDeViaje(v), corregir: () => formularioViaje('editar', v), baja: () => darDeBaja('viaje', v) };
    w.cuerpo.querySelectorAll('[data-a]').forEach((b) => (b.onclick = accion[b.dataset.a]));
  }

  // ---------------------------------------------------------------- inicio: viaje abierto y «Tanqueé»
  function pintarInicio() {
    const caja = $('inicio-viaje');
    if (!caja) return;
    if (!servidor()) return (caja.innerHTML = '');
    const v = abierto();
    if (!v) {
      caja.innerHTML = `<button type="button" data-a="tanquear" class="${CELESTE} w-full"><i class="fa-solid fa-gas-pump text-2xl"></i><span>TANQUEÉ</span></button>`;
    } else {
      const tanqueado = galonesTanqueados(tanqueos, v.id);
      caja.innerHTML = `
        <div class="bg-slate-900 border-2 border-amber-500/60 rounded-3xl p-4 sm:p-5 shadow-xl space-y-3">
          <div class="flex items-start gap-3">
            <div class="w-12 h-12 shrink-0 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center text-2xl"><i class="fa-solid fa-route"></i></div>
            <div class="min-w-0 flex-1">
              <p class="text-base uppercase tracking-wider font-black text-amber-300">Viaje abierto</p>
              <p class="text-2xl font-black text-white leading-tight">${esc(ruta(v))}</p>
              <p class="text-lg text-slate-300">Salida: ${esc(fechaCorta(v.fechaSalida))} a las ${esc(v.horaSalida)} · ${esc(miles(v.kmSalida))} km</p>
              <p class="text-lg text-slate-300">${lineaProductos(v).map(esc).join(' / ')}</p>
              ${tanqueado ? `<p class="text-lg text-cyan-300 font-bold">Tanqueado en este viaje: ${esc(miles(tanqueado))} gal</p>` : ''}
            </div>
          </div>
          ${pideRecordatorio(v) ? '<p class="text-xl font-black text-amber-200 bg-amber-500/15 border-2 border-amber-500/50 rounded-2xl p-3">¿Terminaste este viaje? Lleva más de dos días abierto.</p>' : ''}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="button" data-a="tanquear" class="${CELESTE}"><i class="fa-solid fa-gas-pump text-2xl"></i><span>TANQUEÉ</span></button>
            <button type="button" data-a="terminar" class="${PRINCIPAL}"><i class="fa-solid fa-flag-checkered text-2xl"></i><span>TERMINAR VIAJE</span></button>
          </div>
          <button type="button" data-a="detalle" class="min-h-[56px] w-full text-lg font-bold text-cyan-300">Ver o corregir este viaje ›</button>
        </div>`;
    }
    const accion = { tanquear: () => tanquear(), terminar: () => terminar(v), detalle: () => detalle(v) };
    caja.querySelectorAll('[data-a]').forEach((b) => (b.onclick = accion[b.dataset.a]));
  }

  // ---------------------------------------------------------------- sección «Viajes y tanqueos»
  function pintarVista() {
    const vista = $('view-trips');
    if (!vista) return;
    if (!$('vt-lista')) {
      vista.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button type="button" id="vt-nuevo" class="${PRINCIPAL}"><i class="fa-solid fa-route"></i><span>Nuevo viaje</span></button>
          <button type="button" id="vt-pasado" class="${SECUNDARIO}"><i class="fa-solid fa-calendar-day"></i><span>Viaje ya terminado</span></button>
          <button type="button" id="vt-tanqueo" class="${CELESTE}"><i class="fa-solid fa-gas-pump"></i><span>Tanqueé</span></button>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
          <h2 class="text-2xl font-black text-white flex items-center gap-2"><i class="fa-solid fa-route text-emerald-400"></i> Historial de viajes</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="${ETIQUETA}" for="vt-desde">Desde<input type="date" id="vt-desde" class="${CAMPO}"></label>
            <label class="${ETIQUETA}" for="vt-hasta">Hasta<input type="date" id="vt-hasta" class="${CAMPO}"></label>
            <label class="${ETIQUETA}" for="vt-destino">Destino<input type="text" id="vt-destino" placeholder="Todos" autocomplete="off" class="${CAMPO}"></label>
            <label class="${ETIQUETA}" for="vt-producto">Producto<select id="vt-producto" class="${CAMPO}"><option value="">Todos</option>${PRODUCTOS.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></label>
          </div>
          <div id="vt-lista" class="space-y-3"></div>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
          <h2 class="text-2xl font-black text-white flex items-center gap-2"><i class="fa-solid fa-gas-pump text-cyan-400"></i> Historial de tanqueos</h2>
          <div id="vt-tanqueos" class="space-y-3"></div>
        </div>`;
      $('vt-nuevo').onclick = nuevo;
      $('vt-pasado').onclick = () => servidor() && formularioViaje('pasado');
      $('vt-tanqueo').onclick = () => tanquear();
      ['desde', 'hasta', 'destino', 'producto'].forEach((k) => ($(`vt-${k}`)[k === 'destino' ? 'oninput' : 'onchange'] = (e) => {
        filtros[k] = e.target.value;
        pintarListas();
      }));
    }
    pintarListas();
    if (Date.now() - ultimaTraida > 60000) traer();
  }

  function pintarListas() {
    const destino = normalizarLugar(filtros.destino);
    const lista = activos()
      .filter((v) => (!filtros.desde || v.fechaSalida >= filtros.desde) && (!filtros.hasta || v.fechaSalida <= filtros.hasta)
        && (!destino || normalizarLugar(v.destino).includes(destino)) && (!filtros.producto || v.productos.some((p) => p.producto === filtros.producto)))
      .sort((a, b) => `${b.fechaSalida}${b.horaSalida}`.localeCompare(`${a.fechaSalida}${a.horaSalida}`));
    $('vt-lista').innerHTML = lista.length ? lista.map((v) => {
      const [texto, clases] = insignia(v);
      return `
        <button type="button" data-viaje="${esc(v.id)}" class="w-full text-left p-4 rounded-2xl bg-slate-950 border-2 border-slate-800 hover:border-emerald-500 space-y-1">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-lg font-black font-mono text-emerald-300">${esc(fechaCorta(v.fechaSalida))}</span>
            <span class="px-3 py-0.5 rounded-full text-base font-black border-2 ${clases}">${esc(texto)}</span>
          </div>
          <p class="text-xl font-black text-white">${esc(ruta(v))}</p>
          ${lineaProductos(v).map((l) => `<p class="text-lg text-slate-300">${esc(l)}</p>`).join('')}
          <p class="text-lg text-slate-400">${v.estado === 'cerrado' ? `${esc(miles(kmRecorridos(v)))} km recorridos` : 'Aún en viaje'} · Tanqueado: ${esc(miles(galonesTanqueados(tanqueos, v.id)))} gal</p>
          <p class="text-lg font-bold text-cyan-300">Ver detalle ›</p>
        </button>`;
    }).join('') : `<p class="text-lg text-slate-300 bg-slate-950 border border-slate-800 rounded-2xl p-4">${activos().length ? 'Ningún viaje coincide con esos filtros.' : 'Todavía no hay viajes. Toca «Nuevo viaje» para registrar el primero.'}</p>`;
    $('vt-lista').querySelectorAll('[data-viaje]').forEach((b) => (b.onclick = () => detalle(viajes.find((x) => x.id === b.dataset.viaje))));

    const tq = susTanqueos().sort((a, b) => `${b.fecha}${b.hora}`.localeCompare(`${a.fecha}${a.hora}`));
    $('vt-tanqueos').innerHTML = tq.length ? tq.map((t) => {
      const v = viajes.find((x) => x.id === t.viajeId);
      return `
        <div class="p-4 rounded-2xl bg-slate-950 border-2 border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xl font-black text-white">${esc(fechaCorta(t.fecha))} · ${esc(t.hora)} · <span class="text-cyan-300 font-mono">${esc(miles(t.galones))} gal</span></p>
            <p class="text-lg text-slate-400">${v ? `Viaje: ${esc(ruta(v))}` : 'Sin viaje'}${t.lugar ? ` · ${esc(t.lugar)}` : ''}</p>
          </div>
          ${t.bloqueado ? '<span class="text-base font-bold text-cyan-200">Congelado en un reporte</span>' : `<div class="flex gap-2">
            <button type="button" data-corregir="${esc(t.id)}" class="min-h-[56px] px-4 rounded-2xl border-2 border-slate-600 text-lg font-bold text-slate-100 flex items-center gap-2"><i class="fa-solid fa-pen"></i><span>Corregir</span></button>
            <button type="button" data-baja="${esc(t.id)}" class="min-h-[56px] px-4 rounded-2xl border-2 border-rose-500/60 text-lg font-bold text-rose-200 flex items-center gap-2"><i class="fa-solid fa-trash-can"></i><span>Dar de baja</span></button>
          </div>`}
        </div>`;
    }).join('') : '<p class="text-lg text-slate-300 bg-slate-950 border border-slate-800 rounded-2xl p-4">Todavía no hay tanqueos. Toca «Tanqueé» cada vez que pongas combustible.</p>';
    $('vt-tanqueos').querySelectorAll('[data-corregir]').forEach((b) => (b.onclick = () => tanquear(tanqueos.find((x) => x.id === b.dataset.corregir))));
    $('vt-tanqueos').querySelectorAll('[data-baja]').forEach((b) => (b.onclick = () => darDeBaja('tanqueo', tanqueos.find((x) => x.id === b.dataset.baja))));
  }

  // Lo que el reporte del mes va a incluir: viajes terminados y tanqueos que aún no están en otro reporte
  function porReportar(periodo) {
    const delMes = activos().filter((v) => v.estado === 'cerrado' && !v.bloqueado && String(v.fechaSalida).startsWith(periodo));
    const ids = new Set(delMes.map((v) => v.id));
    return { viajes: delMes.length, tanqueos: susTanqueos().filter((t) => !t.bloqueado && (ids.has(t.viajeId) || (!t.viajeId && String(t.fecha).startsWith(periodo)))).length };
  }

  window.Viajes = {
    nuevo, tanquear, pintarInicio, pintarVista, traer, porReportar,
    alEntrar: () => Date.now() - ultimaTraida > 60000 && traer(),
  };
  window.addEventListener('online', traer);
  pintarInicio();
  if (app.currentView === 'trips') pintarVista();
  traer();
}
