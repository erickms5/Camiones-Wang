// Conexión de «Mi Trailer» con el servidor (API Node.js + PostgreSQL).
// - Ingreso con correo y contraseña (el chofer se queda aquí; el dueño y el administrador van a su panel).
// - Todo se guarda primero en el teléfono y se envía con una cola: funciona sin señal.
// - Mantenimientos, facturas (fotos/PDF), fichas de llantas y frenos, km y reportes.
// Si no hay servidor configurado, la app sigue en modo demostración local.

import { configVehiculo, partesDe, ejesDe, trabajosDe, unidadDeParte, OTRO_TRABAJO } from './catalogo.js';

// Partes, ejes y trabajos del vehículo, disponibles para la pantalla principal (index.html)
window.Flota = { configVehiculo, partesDe, ejesDe, trabajosDe, unidadDeParte, OTRO_TRABAJO };

const CLAVE_TOKEN = 'mi_trailer_token';
const CLAVE_COLA = 'mi_trailer_pendientes';
const CLAVE_DETALLES_ENVIADOS = 'mi_trailer_detalles_enviados';
const API_PRODUCCION = 'https://mi-trailer-api.onrender.com'; // servidor publicado en Render

const leer = (k, def) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? def;
  } catch {
    return def;
  }
};
const escribir = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Dirección del servidor. Solo se acepta una lista fija de servidores: un enlace con otra dirección
// no puede desviar el código de acceso, la sesión ni los datos del chofer a un sitio ajeno.
const SERVIDORES_PERMITIDOS = [API_PRODUCCION, 'http://localhost:3000', 'http://127.0.0.1:3000'].filter(Boolean);
const permitido = (valor) => {
  try {
    const origen = new URL(valor).origin;
    return SERVIDORES_PERMITIDOS.includes(origen) ? origen : null;
  } catch {
    return null;
  }
};

function direccionApi() {
  const param = new URLSearchParams(location.search).get('api');
  if (param && permitido(param)) localStorage.setItem('mi_trailer_api_url', permitido(param));
  const guardada = permitido(localStorage.getItem('mi_trailer_api_url'));
  if (!guardada) localStorage.removeItem('mi_trailer_api_url');
  return guardada || (['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:3000' : API_PRODUCCION);
}

export const API = direccionApi();

export class ErrorApi extends Error {
  constructor(estado, cuerpo) {
    super(cuerpo?.detalles?.[0]?.mensaje || cuerpo?.error || `Error ${estado}`);
    this.estado = estado;
    this.cuerpo = cuerpo;
  }
}

export async function api(ruta, { metodo = 'GET', cuerpo, archivo, tipo } = {}) {
  const token = localStorage.getItem(CLAVE_TOKEN);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (archivo) {
    headers['Content-Type'] = tipo;
    body = archivo;
  } else if (cuerpo !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(cuerpo);
  }
  const r = await fetch(API + ruta, { method: metodo, headers, body });
  const esJson = r.headers.get('content-type')?.includes('application/json');
  const datos = esJson ? await r.json() : await r.blob();
  if (!r.ok) throw new ErrorApi(r.status, esJson ? datos : null);
  return datos;
}

// ---------------------------------------------------------------- sesión
const PANELES = { dueno: './dueno.html', admin: './admin.html' };

export async function iniciarSesionServidor(token) {
  localStorage.setItem(CLAVE_TOKEN, token);
  const { usuario } = await api('/auth/yo');
  if (PANELES[usuario.rol]) {
    escribir('mi_trailer_usuario', usuario);
    location.href = PANELES[usuario.rol];
    return null;
  }
  const { unidades } = await api('/unidades');
  // El vehículo que maneja: un cabezal (con su tanquero enganchado) o un camión con el tanque encima
  const cabezal = unidades.find((u) => u.rol === 'cabezal');
  if (!cabezal) throw new Error('Todavía no tienes un vehículo asignado. Pide al dueño que te lo asigne.');
  const det = await api(`/unidades/${cabezal.id}`);
  const detRem = det.acople?.remolqueId ? await api(`/unidades/${det.acople.remolqueId}`).catch(() => null) : null;
  const camion = cabezal.tipo === 'camion';
  const conTanque = camion ? det : detRem;
  const galonesDe = (d) => d?.componentes.filter((c) => c.tipo === 'compartimento').sort((a, b) => a.orden - b.orden).map((c) => c.capacidadGalones) || [];

  // Partes del servidor que corresponden a cada llanta y freno del camión 3D, y sus fichas ya guardadas
  const mapa = {};
  const fichas = {};
  const mapear = (detalle, prefijo) => {
    if (!detalle) return;
    detalle.componentes.filter((c) => c.tipo === 'eje').forEach((eje) => {
      detalle.componentes.filter((c) => c.padreId === eje.id && (c.tipo === 'llanta' || c.tipo === 'freno')).forEach((c) => {
        const clave = `${prefijo}-eje-${eje.posicion}|${c.tipo}|${c.posicion}`;
        mapa[clave] = c.id;
        if (c.detalles && Object.keys(c.detalles).length) fichas[clave] = c.detalles;
      });
    });
  };
  mapear(det, 'cab');
  mapear(detRem, 'rem');

  // Otro chofer en este teléfono: no se mezclan los datos guardados del anterior.
  // Mismo chofer con otro vehículo: solo se renuevan las fichas de llantas y frenos (son de cada vehículo).
  const borrar = (claves) => claves.forEach((k) => localStorage.removeItem(k));
  if (localStorage.getItem('mi_trailer_ultimo_usuario') !== usuario.id) {
    borrar(['mi_trailer_maint', 'mi_trailer_reports', 'mi_trailer_detalles', CLAVE_DETALLES_ENVIADOS, CLAVE_COLA]);
    if (window.app) Object.assign(window.app, { maintenances: [], reports: [] });
  } else if (localStorage.getItem('mi_trailer_ultimo_vehiculo') !== cabezal.id) borrar(['mi_trailer_detalles', CLAVE_DETALLES_ENVIADOS]);
  localStorage.setItem('mi_trailer_ultimo_usuario', usuario.id);
  localStorage.setItem('mi_trailer_ultimo_vehiculo', cabezal.id);
  // Fichas de llantas y frenos: las del servidor completan las del teléfono (gana la más reciente)
  const locales = leer('mi_trailer_detalles', {});
  const enviados = leer(CLAVE_DETALLES_ENVIADOS, {});
  Object.entries(fichas).forEach(([clave, d]) => {
    if (!locales[clave] || String(d.actualizado || '') > String(locales[clave].actualizado || '')) {
      locales[clave] = d;
      enviados[clave] = d.actualizado;
    }
  });
  escribir('mi_trailer_detalles', locales);
  escribir(CLAVE_DETALLES_ENVIADOS, enviados);

  return {
    placa: cabezal.placa,
    nombre: usuario.nombre,
    cedula: usuario.cedula || '',
    email: usuario.email,
    rol: usuario.rol,
    trailerModel: [cabezal.marca, cabezal.modelo, cabezal.anio].filter(Boolean).join(' '),
    engine: cabezal.atributos?.motor || '',
    odometro: det.km ?? 0, // null = el dueño aún no pone el km
    vehiculo: {
      modeloId: cabezal.atributos?.modeloId || null, tipo: camion ? 'camion' : 'tracto',
      marca: cabezal.marca, modelo: cabezal.modelo, anio: cabezal.anio, motor: cabezal.atributos?.motor || '',
      ejes: cabezal.numEjes, ejesTanquero: detRem?.unidad.numEjes || 0,
      compartimentos: galonesDe(conTanque), conTanquero: !camion && !!detRem,
    },
    servidor: {
      usuarioId: usuario.id,
      cabezalId: cabezal.id,
      remolqueId: detRem?.unidad.id || null,
      km: det.km || 0,
      componentes: mapa,
    },
  };
}

// ---------------------------------------------------------------- cola de envío
// Pregunta de confirmación dentro de la app (las ventanas del navegador no aparecen en todos los teléfonos)
export const preguntar = async (...datos) => (await import('./panel.js')).confirmar(...datos);
const cola = () => leer(CLAVE_COLA, []);
export const pendientes = () => cola().length;
export function encolar(tarea) {
  const c = cola();
  const clave = JSON.stringify(tarea);
  if (!c.some((t) => JSON.stringify(t) === clave)) c.push(tarea);
  escribir(CLAVE_COLA, c);
  pintarEstado();
}

function datosMantenimiento(m, s) {
  return {
    id: m.id,
    // El trabajo se guarda en el tanquero si la parte es suya; si no, en el cabezal o camión
    unidadId: unidadDeParte(m.parte, s.vehiculo) === 'tanquero' && s.servidor.remolqueId ? s.servidor.remolqueId : s.servidor.cabezalId,
    fecha: m.fecha, km: m.km, parte: m.parte, trabajo: m.trabajo, provincia: m.provincia, canton: m.canton,
    taller: m.taller, costoTaller: Number(m.costoTaller) || 0, proveedor: m.proveedor,
    costoRepuestos: Number(m.costoRepuestos) || 0, repuestosDetalle: m.repuestosDetalle || undefined, notas: m.notas || undefined,
    pagoTaller: m.pagoTaller || undefined, pagoRepuestos: m.pagoRepuestos || undefined,
  };
}

// Evidencias de un mantenimiento (facturas y anexos posteriores)
const evidenciasDe = (m) => [...(m.evidencias || []), ...(m.anexosPosteriores || []).map((a) => a.evidencia).filter(Boolean)];

let enviando = false;
export async function enviarPendientes(app, segundaPasada = false) {
  if (!app?.session?.servidor || !localStorage.getItem(CLAVE_TOKEN) || enviando || !navigator.onLine) return pintarEstado();
  enviando = true;
  pintarEstado('enviando');
  const s = app.session;
  try {
    // Dos pasadas: las facturas entran a la cola cuando su mantenimiento ya llegó al servidor
    for (const t of [...cola(), null]) {
      if (t === null) {
        if (!segundaPasada && cola().length) { segundaPasada = true; enviando = false; return await enviarPendientes(app, true); }
        break;
      }
      const m = app.maintenances.find((x) => x.id === t.id);
      try {
        if (t.tipo === 'mantenimiento' && m) {
          await api('/mantenimientos', { metodo: 'POST', cuerpo: datosMantenimiento(m, s) });
          if (s.servidor.km && m.km > s.servidor.km) s.servidor.km = m.km; // el servidor sube el km (si el dueño ya lo puso)
          evidenciasDe(m).forEach((ev) => encolar({ tipo: 'evidencia', id: m.id, evidencia: ev.id }));
        }
        if (t.tipo === 'evidencia' && m) {
          const ev = evidenciasDe(m).find((e) => e.id === t.evidencia);
          if (ev && !ev.enviada) {
            if (!ev.servidorId) {
              const r = await api(`/mantenimientos/${m.id}/evidencias`, { metodo: 'POST', cuerpo: { categoria: ev.categoria, nombreArchivo: ev.nombre, mime: ev.tipo } });
              ev.servidorId = r.evidencia.id;
              app.saveStorage();
            }
            const blob = await window.Evidencias.obtener(ev.id);
            if (blob) {
              try {
                await api(`/evidencias/${ev.servidorId}/archivo`, { metodo: 'PUT', archivo: blob, tipo: ev.tipo });
              } catch (e) {
                if (e.estado !== 409) throw e; // 409 = ya estaba subido
              }
            }
            ev.enviada = true;
            app.saveStorage();
          }
        }
        if (t.tipo === 'odometro') {
          // Tareas antiguas: el servidor ya sube el km con cada mantenimiento
        }
        quitarDeCola(t);
      } catch (e) {
        if (!(e instanceof ErrorApi)) throw e; // sin conexión: se reintenta luego
        if (e.estado === 401) return sesionVencida(app);
        if (e.estado >= 400 && e.estado < 500) {
          // Dato rechazado por el servidor: se guarda aparte para revisarlo y no bloquea la cola
          escribir('mi_trailer_rechazados', [...leer('mi_trailer_rechazados', []), { ...t, error: e.message, en: new Date().toISOString() }]);
          quitarDeCola(t);
          app.showToast(`No se pudo enviar: ${e.message}`, 'warning');
        } else throw e;
      }
    }
    await enviarDetalles(s);
  } catch {
    // sin conexión o servidor caído: queda en la cola
  } finally {
    enviando = false;
    pintarEstado();
  }
}

function quitarDeCola(t) {
  const clave = JSON.stringify(t);
  escribir(CLAVE_COLA, cola().filter((x) => JSON.stringify(x) !== clave));
}

// Fichas de llantas y frenos guardadas desde el camión 3D
async function enviarDetalles(s) {
  const detalles = leer('mi_trailer_detalles', {});
  const enviados = leer(CLAVE_DETALLES_ENVIADOS, {});
  for (const [clave, d] of Object.entries(detalles)) {
    const id = s.servidor.componentes?.[clave];
    if (!id || enviados[clave] === d.actualizado) continue;
    const { actualizado, ...datos } = d;
    await api(`/unidades/componentes/${id}`, { metodo: 'PATCH', cuerpo: { detalles: { ...datos, actualizado } } });
    enviados[clave] = d.actualizado;
    escribir(CLAVE_DETALLES_ENVIADOS, enviados);
  }
}

// Al entrar: traer los mantenimientos que ya están en el servidor (p. ej. desde otro teléfono)
// Trae los mantenimientos del servidor (p. ej. registrados desde otro teléfono) y pone al día los que ya están aquí:
// si entraron a un reporte y si el dueño ya pagó lo que quedó a crédito. «folios» = { idReporte: folio }.
export async function actualizarMantenimientos(app, folios = null) {
  const { mantenimientos } = await api('/mantenimientos');
  let cambios = 0;
  mantenimientos.forEach((m) => {
    const delServidor = {
      bloqueado: m.bloqueado, reporteId: m.reporteId || null,
      pagoTaller: m.pagoTaller || null, pagoRepuestos: m.pagoRepuestos || null, tallerPagadoEn: m.tallerPagadoEn || null, repuestosPagadoEn: m.repuestosPagadoEn || null,
    };
    const local = app.maintenances.find((x) => x.id === m.id);
    if (local) {
      if (Object.entries(delServidor).some(([k, v]) => (local[k] ?? null) !== v)) cambios++;
      Object.assign(local, delServidor);
      return;
    }
    const costoTaller = Number(m.costoTaller), costoRepuestos = Number(m.costoRepuestos);
    app.maintenances.push({
      id: m.id, fecha: m.fecha, km: m.km, parte: m.parte, trabajo: m.trabajo, provincia: m.provincia, canton: m.canton,
      taller: m.taller || 'No especificado', costoTaller, facturaTallerFile: null, proveedor: m.proveedor || 'No especificado',
      costoRepuestos, repuestosDetalle: m.repuestosDetalle || '', facturaRepuestosFile: null, costo: costoTaller + costoRepuestos,
      notas: m.notas || '', anexosPosteriores: [], evidencias: [], reportFolio: null, ...delServidor,
    });
    cambios++;
  });
  app.maintenances.forEach((m) => {
    const folio = m.reporteId ? folios?.[m.reporteId] || m.reportFolio || 'reporte emitido' : null;
    if (m.bloqueado && m.reportFolio !== folio && folio) {
      m.reportFolio = folio;
      cambios++;
    }
  });
  if (cambios) {
    app.maintenances.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    app.saveStorage();
    app.refreshUI();
  }
}
const traerMantenimientos = actualizarMantenimientos;

function sesionVencida(app) {
  localStorage.removeItem(CLAVE_TOKEN);
  app.showToast('Tu sesión venció. Vuelve a entrar con tu correo y contraseña.', 'warning');
  app.session = null;
  app.saveStorage();
  app.switchView('login');
}

// ---------------------------------------------------------------- indicador de estado
function pintarEstado(fase) {
  const b = document.getElementById('btn-sync-status');
  if (!b) return;
  const n = cola().length;
  let color = 'bg-emerald-400', texto = 'Enviado';
  if (!navigator.onLine) [color, texto] = ['bg-amber-400', n ? `Sin señal · ${n} por enviar` : 'Sin señal'];
  else if (fase === 'enviando') [color, texto] = ['bg-cyan-400', 'Enviando…'];
  else if (n) [color, texto] = ['bg-amber-400', `${n} por enviar`];
  b.innerHTML = `<span class="w-2.5 h-2.5 rounded-full ${color} ${fase === 'enviando' ? 'animate-pulse' : ''}"></span><span>${esc(texto)}</span>`;
}

// ---------------------------------------------------------------- pantalla de ingreso (correo y contraseña)
const campo = (id, etiqueta, tipo, extra = '') => `
  <div><label class="block text-slate-300 font-bold text-lg mb-1" for="${id}">${etiqueta}</label>
    <input id="${id}" type="${tipo}" ${extra} class="w-full bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 rounded-2xl py-3.5 px-4 text-lg text-white font-semibold focus:outline-none"></div>`;

async function entrarALaApp(app, sesion, saludo) {
  app.session = sesion;
  app.saveStorage();
  app.selectedPart = 'Motor';
  if (saludo) app.switchView('dashboard');
  app.refreshUI();
  if (saludo) app.showToast(`¡Bienvenido, ${sesion.nombre}!`, 'success');
  const marco = document.getElementById('frame-3d');
  if (marco?.getAttribute('src')) marco.contentWindow?.location.reload();
  await traerMantenimientos(app).catch(() => {});
  enviarPendientes(app);
}

function pantallaIngreso(app) {
  const vista = document.getElementById('view-login');
  vista.innerHTML = `
    <div class="bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 sm:p-8 max-w-lg mx-auto shadow-2xl">
      <div class="text-center mb-6">
        <div class="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-3 text-3xl"><i class="fa-solid fa-truck-moving"></i></div>
        <h2 class="text-2xl sm:text-3xl font-extrabold text-white">Entrar a Mi Trailer</h2>
        <p class="text-slate-400 text-base mt-1">Escribe tu correo y tu contraseña.</p>
      </div>
      <form id="ing-form" class="space-y-5" novalidate>
        ${campo('ing-email', 'Correo electrónico', 'email', 'inputmode="email" autocomplete="username" required')}
        <div>
          <label class="block text-slate-300 font-bold text-lg mb-1" for="ing-clave">Contraseña</label>
          <div class="relative">
            <input id="ing-clave" type="password" autocomplete="current-password" required class="w-full bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 rounded-2xl py-3.5 pl-4 pr-24 text-lg text-white font-semibold focus:outline-none">
            <button type="button" id="ing-ver" class="absolute right-2 top-2 bottom-2 px-3 rounded-xl text-sm font-bold text-cyan-300 bg-slate-800">Mostrar</button>
          </div>
        </div>
        <p id="ing-error" class="hidden text-amber-400 font-bold" role="alert"></p>
        <button type="submit" id="ing-boton" class="touch-target w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-slate-950 font-black text-xl py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3">
          <span>ENTRAR</span><i class="fa-solid fa-arrow-right"></i></button>
      </form>
    </div>`;
  const $ = (id) => document.getElementById(id);
  const error = (msg) => {
    $('ing-error').textContent = msg || '';
    $('ing-error').classList.toggle('hidden', !msg);
  };
  $('ing-ver').onclick = () => {
    const ver = $('ing-clave').type === 'password';
    $('ing-clave').type = ver ? 'text' : 'password';
    $('ing-ver').textContent = ver ? 'Ocultar' : 'Mostrar';
  };
  $('ing-form').onsubmit = async (e) => {
    e.preventDefault();
    error('');
    const email = $('ing-email').value.trim().toLowerCase();
    const clave = $('ing-clave').value;
    if (!email || !clave) return error('Escribe tu correo y tu contraseña.');
    $('ing-boton').disabled = true;
    try {
      const r = await api('/auth/entrar', { metodo: 'POST', cuerpo: { email, clave } });
      const sesion = await iniciarSesionServidor(r.token);
      if (!sesion) return; // dueño o administrador → su panel
      await entrarALaApp(app, sesion, true);
    } catch (err) {
      localStorage.removeItem(CLAVE_TOKEN); // no entró (p. ej. aún sin vehículo asignado): no queda una sesión a medias
      // Error de red (servidor apagado, sin señal o dirección no permitida): mensaje claro en vez de «Failed to fetch»
      error(err instanceof ErrorApi ? err.message : err instanceof TypeError ? 'No se pudo conectar con el servidor. Revisa tu señal o intenta en un momento.' : err.message);
    } finally {
      $('ing-boton').disabled = false;
    }
  };
}

// Cambio de la propia contraseña, dentro de «Mi cuenta»
function cambioDeClave(app) {
  const caja = document.getElementById('prof-clave-box');
  if (!caja) return;
  const entrada = (id, etiqueta, auto) => `<label class="block text-sm font-bold text-slate-300">${etiqueta}
    <input id="${id}" type="password" autocomplete="${auto}" class="mt-1 w-full bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 rounded-xl py-2.5 px-3 text-base text-white focus:outline-none"></label>`;
  caja.innerHTML = `
    <details class="bg-slate-950 rounded-2xl border border-slate-800">
      <summary class="touch-target flex items-center gap-2 px-3 cursor-pointer font-bold text-cyan-300"><i class="fa-solid fa-key"></i> Cambiar mi contraseña</summary>
      <form id="clave-form" class="p-3 pt-0 space-y-3" novalidate>
        ${entrada('clave-actual', 'Contraseña actual', 'current-password')}
        ${entrada('clave-nueva', 'Contraseña nueva (mínimo 6 caracteres)', 'new-password')}
        <p id="clave-error" class="hidden text-amber-400 text-sm font-bold" role="alert"></p>
        <button class="touch-target w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl">Guardar contraseña</button>
      </form>
    </details>`;
  document.getElementById('clave-form').onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById('clave-error');
    err.classList.add('hidden');
    try {
      await api('/auth/clave', { metodo: 'POST', cuerpo: { actual: document.getElementById('clave-actual').value, nueva: document.getElementById('clave-nueva').value } });
      e.target.reset();
      caja.querySelector('details').open = false;
      app.showToast('Contraseña cambiada', 'success');
    } catch (ex) {
      err.textContent = ex instanceof ErrorApi ? ex.message : 'No se pudo conectar con el servidor.';
      err.classList.remove('hidden');
    }
  };
}

// ---------------------------------------------------------------- conexión con la app de la demo
function conectar(app) {
  // Km real: el del servidor o el mayor de los mantenimientos (sin valores inventados si aún no hay km)
  const maxKmOriginal = app.getMaxKm.bind(app);
  app.getMaxKm = () => {
    if (!app.session?.servidor) return maxKmOriginal();
    return app.maintenances.reduce((max, m) => Math.max(max, Number(m.km) || 0), app.session.servidor.km || 0);
  };
  pantallaIngreso(app);
  // Cada vez que se muestra el ingreso, empieza desde el correo (no desde el código anterior)
  const cambiarVista = app.switchView.bind(app);
  app.switchView = (vista) => {
    if (vista === 'login') pantallaIngreso(app);
    return cambiarVista(vista);
  };
  document.getElementById('btn-sync-status')?.classList.replace('hidden', 'flex');

  cambioDeClave(app);
  // Sin sesión del servidor no se muestra nada guardado de la demostración anterior
  if (app.session && !app.session.servidor) {
    app.session = null;
    app.switchView('login');
  }

  // Salir: cierra la sesión también en el servidor
  app.handleLogout = async () => {
    app.toggleMenu(false);
    const texto = cola().length
      ? 'Hay datos que aún no se enviaron al servidor. Si sales ahora se quedan guardados en este teléfono.'
      : 'Para volver a entrar necesitarás tu correo y tu contraseña.';
    if (!(await preguntar('¿Cerrar la sesión?', texto, 'Cerrar sesión', true))) return;
    api('/auth/salir', { metodo: 'POST' }).catch(() => {});
    localStorage.removeItem(CLAVE_TOKEN);
    app.session = null;
    app.saveStorage();
    app.closeProfileModal();
    app.switchView('login');
    app.showToast('Sesión cerrada correctamente', 'info');
  };

  // Guardar mantenimiento → cola de envío (con sus facturas y el km)
  const guardarOriginal = app.handleSaveMaintenance.bind(app);
  app.handleSaveMaintenance = async (e) => {
    // El km solo sube con los mantenimientos y no se puede corregir: se frena un salto imposible antes de guardar
    const km = parseInt(document.getElementById('maint-km')?.value, 10);
    const actual = app.session?.servidor?.km || 0;
    if (app.session?.servidor && actual > 0 && km > actual + 60000) {
      e?.preventDefault?.();
      return app.showToast(`El km ${km.toLocaleString('es-EC')} es mucho mayor al actual (${actual.toLocaleString('es-EC')}). Revisa que esté bien escrito.`, 'warning');
    }
    // Un km menor al actual (trabajo anotado con atraso) se confirma en pantalla
    const mayor = app.getMaxKm();
    if (mayor > 0 && km < mayor && e?.target?.checkValidity?.() !== false) {
      e?.preventDefault?.();
      if (!(await preguntar('Kilometraje menor al actual', `Escribiste ${km.toLocaleString('es-EC')} km y el vehículo ya marca ${mayor.toLocaleString('es-EC')} km. ¿Guardar de todas formas?`, 'Sí, guardar'))) return;
      app.kmMenorConfirmado = true;
    }
    const antes = app.maintenances[0]?.id;
    try {
      await guardarOriginal(e);
    } finally {
      app.kmMenorConfirmado = false;
    }
    const m = app.maintenances[0];
    if (m && m.id !== antes && app.session?.servidor) {
      encolar({ tipo: 'mantenimiento', id: m.id });
      enviarPendientes(app);
    }
  };

  // Anexo posterior → se envía también
  const anexoOriginal = app.handleSavePostEvidence.bind(app);
  app.handleSavePostEvidence = async (e) => {
    const id = app.targetPostMaintId;
    await anexoOriginal(e);
    const m = app.maintenances.find((x) => x.id === id);
    const ultimo = m?.anexosPosteriores?.at(-1)?.evidencia;
    if (ultimo && app.session?.servidor) {
      encolar({ tipo: 'evidencia', id: m.id, evidencia: ultimo.id });
      enviarPendientes(app);
    }
  };

  // Lo que ya se envió al dueño no se borra desde el teléfono (el botón solo servía sin servidor)
  app.deleteMaintenance = async (id) => {
    if (cola().some((t) => t.tipo === 'mantenimiento' && t.id === id)) {
      if (!(await preguntar('¿Borrar este mantenimiento?', 'Todavía no se envió al dueño: se borra de este teléfono.', 'Borrar', true))) return;
      escribir(CLAVE_COLA, cola().filter((t) => t.id !== id));
      pintarEstado();
      app.maintenances = app.maintenances.filter((m) => m.id !== id);
      app.saveStorage();
      app.refreshUI();
      return app.showToast('Mantenimiento eliminado', 'info');
    }
    app.showToast('Este mantenimiento ya se envió al dueño y no se puede borrar. Si hay un error, avísale.', 'warning');
  };

  // Reportes: se emiten y se consultan en el servidor (js/reportes-chofer.js)
  import('./reportes-chofer.js').then((m) => m.conectarReportes(app)).catch(() => {});

  // Envíos automáticos
  window.addEventListener('online', () => enviarPendientes(app));
  window.addEventListener('offline', () => pintarEstado());
  window.addEventListener('storage', (ev) => ev.key === 'mi_trailer_detalles' && enviarPendientes(app));
  setInterval(() => enviarPendientes(app), 60_000);
  const token = localStorage.getItem(CLAVE_TOKEN);
  if (token) {
    // Al abrir la app se actualiza el vehículo y el km (el dueño pudo cambiarlos); sin señal sigue con lo guardado.
    // Si quien tiene la sesión abierta es dueño o administrador, pasa directo a su panel.
    const yaDentro = !!app.session?.servidor;
    iniciarSesionServidor(token)
      .then((sesion) => sesion && entrarALaApp(app, sesion, !yaDentro))
      .catch((err) => {
        if (err instanceof ErrorApi && err.estado === 401) return yaDentro ? sesionVencida(app) : localStorage.removeItem(CLAVE_TOKEN);
        if (!yaDentro) return;
        if (!(err instanceof ErrorApi) && !(err instanceof TypeError)) app.showToast(err.message, 'warning');
        traerMantenimientos(app).catch(() => {});
        enviarPendientes(app);
      });
  }
  pintarEstado();
}

if (API) {
  window.addEventListener('DOMContentLoaded', () => {
    // La demo crea «app» en su propio DOMContentLoaded, que se registró antes que este
    if (window.app) conectar(window.app);
  });
}

window.MiTrailerApi = { API, api, enviarPendientes, encolar };
