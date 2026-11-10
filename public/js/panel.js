// Piezas compartidas por los paneles del dueño y del administrador:
// menú lateral, avisos, ventanas de formulario, sesión y cambio de contraseña.
import { api, API, ErrorApi } from './sincronizacion.js';

export { api, ErrorApi };
export const $ = (id) => document.getElementById(id);
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const dinero = (n) => `$${Number(n || 0).toFixed(2)}`;
export const miles = (n) => Number(n || 0).toLocaleString('es-EC');
export const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const mensajeDe = (err) => (err instanceof ErrorApi ? err.message : err instanceof TypeError ? 'No se pudo conectar con el servidor. Revisa tu conexión.' : err?.message || 'Ocurrió un error');

let relojAviso;
export function aviso(texto, tipo = 'ok') {
  const t = $('toast');
  t.textContent = texto;
  t.className = `fixed top-4 right-4 left-4 sm:left-auto sm:max-w-sm z-[70] px-5 py-3 rounded-2xl font-extrabold shadow-2xl ${tipo === 'ok' ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500 text-slate-950'}`;
  clearTimeout(relojAviso);
  relojAviso = setTimeout(() => t.classList.add('hidden'), 4000);
}

// ---------------------------------------------------------------- menú lateral y secciones
// Cada botón del menú lleva data-seccion="x" y muestra <section id="sec-x">. «alAbrir» se llama al entrar a cada una.
export function iniciarMenu(alAbrir = {}) {
  const abrir = (si) => {
    document.body.classList.toggle('menu-abierto', si);
    $('menu-fondo').classList.toggle('hidden', !si);
    $('btn-menu').setAttribute('aria-expanded', String(si));
  };
  $('btn-menu').onclick = () => abrir(true);
  $('menu-cerrar').onclick = () => abrir(false);
  $('menu-fondo').onclick = () => abrir(false);
  const botones = [...document.querySelectorAll('[data-seccion]')];
  const ir = (nombre) => {
    document.querySelectorAll('main > section').forEach((s) => s.classList.toggle('hidden', s.id !== `sec-${nombre}`));
    document.querySelectorAll('#menu-lateral [data-seccion]').forEach((b) => b.classList.toggle('activo', b.dataset.seccion === nombre));
    $('titulo-vista').textContent = document.querySelector(`#menu-lateral [data-seccion="${nombre}"] span`)?.textContent || $('titulo-vista').textContent;
    abrir(false);
    window.scrollTo({ top: 0 });
    Promise.resolve(alAbrir[nombre]?.()).catch((e) => aviso(mensajeDe(e), 'error'));
  };
  botones.forEach((b) => (b.onclick = () => ir(b.dataset.seccion)));
  document.body.classList.add('con-menu');
  return ir;
}

// ---------------------------------------------------------------- ventana con formulario
// campos: [{ nombre, etiqueta, tipo: texto|correo|numero|clave|lista|casilla|casillas|nota, valor, opciones: [[valor, texto]], ayuda, opcional }]
// alAceptar(valores) puede fallar: el error se muestra dentro de la ventana y no se pierde lo escrito.
export function dialogo({ titulo, texto = '', campos = [], boton = 'Guardar', peligro = false, alAceptar }) {
  return new Promise((resolver) => {
    const fondo = document.createElement('div');
    fondo.className = 'fixed inset-0 bg-black/80 z-[60] flex items-start sm:items-center justify-center p-3 overflow-y-auto';
    const entrada = 'mt-1 w-full bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 rounded-xl p-3 text-base text-white focus:outline-none';
    const control = (c) => {
      const id = `dlg-${c.nombre}`;
      const ayuda = c.ayuda ? `<span class="block text-xs font-normal text-slate-400 mt-1">${esc(c.ayuda)}</span>` : '';
      if (c.tipo === 'nota') return `<p class="text-sm text-slate-300 bg-slate-950 border border-slate-800 rounded-xl p-3">${esc(c.etiqueta)}</p>`;
      if (c.tipo === 'casilla') {
        return `<label class="flex gap-3 items-start text-sm text-slate-300 bg-slate-950 border border-slate-800 rounded-xl p-3">
          <input id="${id}" name="${esc(c.nombre)}" type="checkbox" ${c.valor ? 'checked' : ''} class="w-6 h-6 mt-0.5 shrink-0 accent-emerald-500"><span>${esc(c.etiqueta)}</span></label>`;
      }
      if (c.tipo === 'casillas') {
        return `<fieldset><legend class="text-sm font-bold text-slate-300 mb-1">${esc(c.etiqueta)}</legend><div class="space-y-1.5">
          ${c.opciones.map(([v, t]) => `<label class="flex gap-3 items-center text-base text-white bg-slate-950 border border-slate-800 rounded-xl p-3">
            <input name="${esc(c.nombre)}" value="${esc(v)}" type="checkbox" ${(c.valor || []).includes(v) ? 'checked' : ''} class="w-6 h-6 shrink-0 accent-emerald-500"><span>${esc(t)}</span></label>`).join('')
          || '<p class="text-sm text-slate-400 italic">No hay opciones todavía.</p>'}</div>${ayuda}</fieldset>`;
      }
      if (c.tipo === 'lista') {
        return `<label class="block text-sm font-bold text-slate-300">${esc(c.etiqueta)}
          <select id="${id}" name="${esc(c.nombre)}" class="${entrada}">${c.opciones.map(([v, t]) => `<option value="${esc(v)}" ${String(c.valor ?? '') === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>${ayuda}</label>`;
      }
      const tipos = { correo: 'type="email" inputmode="email" autocomplete="off"', numero: 'type="text" inputmode="numeric"', clave: 'type="text" autocomplete="off" spellcheck="false"', secreta: 'type="password" autocomplete="off"' };
      return `<label class="block text-sm font-bold text-slate-300">${esc(c.etiqueta)}${c.opcional ? ' <span class="font-normal text-slate-500">(opcional)</span>' : ''}
        <input id="${id}" name="${esc(c.nombre)}" ${tipos[c.tipo] || 'type="text"'} value="${esc(c.valor ?? '')}" placeholder="${esc(c.ejemplo || '')}" class="${entrada} ${c.tipo === 'clave' || c.mono ? 'font-mono' : ''}">${ayuda}</label>`;
    };
    fondo.innerHTML = `
      <form class="bg-slate-900 border-2 border-slate-700 rounded-3xl w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl my-4" novalidate role="dialog" aria-modal="true" aria-labelledby="dlg-titulo">
        <div class="flex items-start justify-between gap-3">
          <h3 id="dlg-titulo" class="text-xl font-black text-white">${esc(titulo)}</h3>
          <button type="button" data-cerrar class="text-slate-400 hover:text-white text-2xl px-2" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
        ${texto ? `<p class="text-sm text-slate-300">${esc(texto)}</p>` : ''}
        ${campos.map(control).join('')}
        <p data-error class="hidden text-amber-400 font-bold" role="alert"></p>
        <div class="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
          <button type="button" data-cerrar class="touch-target px-5 rounded-2xl border border-slate-600 text-slate-200 font-bold">Cancelar</button>
          <button type="submit" class="touch-target px-6 rounded-2xl font-black ${peligro ? 'bg-rose-500 hover:bg-rose-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'}">${esc(boton)}</button>
        </div>
      </form>`;
    document.body.appendChild(fondo);
    const form = fondo.querySelector('form');
    const cerrar = (valor) => {
      fondo.remove();
      resolver(valor);
    };
    fondo.querySelectorAll('[data-cerrar]').forEach((b) => (b.onclick = () => cerrar(null)));
    form.querySelector('input:not([type=checkbox]), select')?.focus();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const valores = {};
      campos.forEach((c) => {
        if (c.tipo === 'nota') return;
        if (c.tipo === 'casillas') valores[c.nombre] = [...form.querySelectorAll(`[name="${c.nombre}"]:checked`)].map((x) => x.value);
        else if (c.tipo === 'casilla') valores[c.nombre] = form.elements[c.nombre].checked;
        else valores[c.nombre] = form.elements[c.nombre].value.trim();
      });
      const error = form.querySelector('[data-error]');
      const enviar = form.querySelector('[type=submit]');
      error.classList.add('hidden');
      enviar.disabled = true;
      try {
        cerrar((await alAceptar?.(valores)) ?? valores);
      } catch (err) {
        error.textContent = mensajeDe(err);
        error.classList.remove('hidden');
        enviar.disabled = false;
      }
    };
  });
}

export const confirmar = (titulo, texto, boton = 'Sí, continuar', peligro = false) => dialogo({ titulo, texto, boton, peligro }).then((v) => v !== null);

// Número escrito por una persona («184.520», «184 520») → entero, o undefined si está vacío
export const entero = (texto) => (String(texto ?? '').trim() === '' ? undefined : Number(String(texto).replace(/[.\s,]/g, '')));
// «3000, 2000, 2000» → [3000, 2000, 2000]
export const listaGalones = (texto) => String(texto ?? '').split(/[,;+\/]/).map((x) => Number(x.replace(/[.\s]/g, ''))).filter((x) => x > 0);

// ---------------------------------------------------------------- sesión del panel
export async function sesionPanel(rol) {
  const irAlInicio = () => {
    location.href = './index.html';
    return new Promise(() => {}); // la página se va: no sigue cargando el panel
  };
  if (!API || !localStorage.getItem('mi_trailer_token')) return irAlInicio();
  try {
    const { usuario } = await api('/auth/yo');
    if (usuario.rol !== rol) return irAlInicio();
    $('menu-nombre').textContent = usuario.nombre;
    $('salir').onclick = async () => {
      await api('/auth/salir', { metodo: 'POST' }).catch(() => {});
      localStorage.removeItem('mi_trailer_token');
      location.href = './index.html';
    };
    return usuario;
  } catch (err) {
    if (err.estado === 401) {
      localStorage.removeItem('mi_trailer_token');
      return irAlInicio();
    }
    throw err;
  }
}

// Sección «Mi cuenta»: datos de quien entró y cambio de su contraseña
export function pintarCuenta(usuario, minimo = 8) {
  $('cuenta').innerHTML = `
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-1">
      <p class="text-xs uppercase tracking-wider font-bold text-slate-400">Sesión iniciada como</p>
      <p class="text-xl font-black text-white">${esc(usuario.nombre)}</p>
      <p class="text-slate-400">${esc(usuario.email)}</p>
    </div>
    <form id="clave-form" class="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3 max-w-lg" novalidate>
      <h3 class="text-lg font-black text-white"><i class="fa-solid fa-key text-cyan-400 mr-1"></i> Cambiar mi contraseña</h3>
      <label class="block text-sm font-bold text-slate-300">Contraseña actual
        <input name="actual" type="password" autocomplete="current-password" class="mt-1 w-full bg-slate-950 border-2 border-slate-700 rounded-xl p-3 text-white"></label>
      <label class="block text-sm font-bold text-slate-300">Contraseña nueva (mínimo ${minimo} caracteres)
        <input name="nueva" type="password" autocomplete="new-password" class="mt-1 w-full bg-slate-950 border-2 border-slate-700 rounded-xl p-3 text-white"></label>
      <p class="text-xs text-slate-400">Al cambiarla se cierran tus otras sesiones abiertas.</p>
      <button class="touch-target w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-2xl">Guardar contraseña</button>
    </form>`;
  $('clave-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.nueva.value.length < minimo) return aviso(`La contraseña nueva debe tener al menos ${minimo} caracteres`, 'error');
    try {
      await api('/auth/clave', { metodo: 'POST', cuerpo: { actual: f.actual.value, nueva: f.nueva.value } });
      f.reset();
      aviso('Contraseña cambiada');
    } catch (err) {
      aviso(mensajeDe(err), 'error');
    }
  };
}

// Tanque dibujado como barra: un tramo por compartimento, proporcional a sus galones (1 = adelante)
export function barraTanque(compartimentos) {
  if (!compartimentos?.length) return '';
  const total = compartimentos.reduce((a, b) => a + b, 0);
  return `<div>
    <div class="flex items-baseline justify-between text-xs font-bold text-slate-400 mb-1"><span>Tanque · adelante → atrás</span><span class="text-cyan-300">${esc(miles(total))} gal</span></div>
    <div class="flex gap-1">${compartimentos.map((g, i) => `<div style="flex:${Number(g)}" class="bg-cyan-500/15 border border-cyan-500/40 rounded-lg py-1.5 text-center min-w-0">
      <span class="block text-[10px] text-slate-400 font-bold">${i + 1}</span><span class="block text-sm font-black font-mono text-cyan-200">${esc(miles(g))}</span></div>`).join('')}</div>
  </div>`;
}

export const placaHTML = (placa) => (placa
  ? `<span class="font-mono font-black bg-white text-slate-900 px-2 py-0.5 rounded">${esc(placa)}</span>`
  : '<span class="font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded text-sm">Placa pendiente</span>');
export const nombreVehiculo = (v) => [v.marca, v.modelo, v.anio].filter(Boolean).join(' ');
