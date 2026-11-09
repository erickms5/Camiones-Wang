// Conexión de «Mi Trailer» con el servidor (API Node.js + PostgreSQL).
// - Ingreso con código al email (chofer y dueño; el dueño va a su panel).
// - Todo se guarda primero en el teléfono y se envía con una cola: funciona sin señal.
// - Mantenimientos, facturas (fotos/PDF), fichas de llantas y frenos, km y reportes.
// Si no hay servidor configurado, la app sigue en modo demostración local.

const CLAVE_TOKEN = 'mi_trailer_token';
const CLAVE_COLA = 'mi_trailer_pendientes';
const CLAVE_DETALLES_ENVIADOS = 'mi_trailer_detalles_enviados';
const API_PRODUCCION = ''; // se completa al publicar el servidor (ej. https://mi-trailer-api.onrender.com)

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

// Dirección del servidor: ?api=… (se recuerda), o localhost en desarrollo, o la de producción
function direccionApi() {
  const param = new URLSearchParams(location.search).get('api');
  if (param) localStorage.setItem('mi_trailer_api_url', param);
  return localStorage.getItem('mi_trailer_api_url') || (['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:3000' : API_PRODUCCION);
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
export async function iniciarSesionServidor(token) {
  localStorage.setItem(CLAVE_TOKEN, token);
  const { usuario } = await api('/auth/yo');
  if (usuario.rol === 'dueno') {
    escribir('mi_trailer_usuario', usuario);
    location.href = './dueno.html';
    return null;
  }
  const { unidades } = await api('/unidades');
  const cabezal = unidades.find((u) => u.rol === 'cabezal');
  const remolqueAsignado = unidades.find((u) => u.rol === 'remolque');
  if (!cabezal) throw new Error('Todavía no tienes un cabezal asignado. Pide al dueño que te lo asigne.');
  const det = await api(`/unidades/${cabezal.id}`);
  const remolqueId = det.acople?.remolqueId || remolqueAsignado?.id;
  const detRem = remolqueId ? await api(`/unidades/${remolqueId}`) : null;

  // Partes del servidor que corresponden a cada llanta y freno del camión 3D
  const mapa = {};
  const mapear = (detalle, prefijo) => {
    if (!detalle) return;
    detalle.componentes.filter((c) => c.tipo === 'eje').forEach((eje) => {
      detalle.componentes.filter((c) => c.padreId === eje.id && (c.tipo === 'llanta' || c.tipo === 'freno'))
        .forEach((c) => (mapa[`${prefijo}-eje-${eje.posicion}|${c.tipo}|${c.posicion}`] = c.id));
    });
  };
  mapear(det, 'cab');
  mapear(detRem, 'rem');

  return {
    placa: cabezal.placa,
    nombre: usuario.nombre,
    cedula: usuario.cedula || '',
    email: usuario.email,
    rol: usuario.rol,
    trailerModel: [cabezal.marca, cabezal.modelo, cabezal.anio].filter(Boolean).join(' '),
    engine: cabezal.atributos?.motor || 'Motor',
    odometro: det.km || 0,
    servidor: {
      cabezalId: cabezal.id,
      remolqueId: detRem?.unidad.id || null,
      remolquePlaca: detRem?.unidad.placa || null,
      km: det.km || 0,
      componentes: mapa,
    },
    compartimentos: detRem?.componentes.filter((c) => c.tipo === 'compartimento').sort((a, b) => a.orden - b.orden).map((c) => c.capacidadGalones) || null,
  };
}

// ---------------------------------------------------------------- cola de envío
const cola = () => leer(CLAVE_COLA, []);
export function encolar(tarea) {
  const c = cola();
  const clave = JSON.stringify(tarea);
  if (!c.some((t) => JSON.stringify(t) === clave)) c.push(tarea);
  escribir(CLAVE_COLA, c);
  pintarEstado();
}

const parteDeRemolque = (parte) => /Remolque|Tanque/.test(parte);

function datosMantenimiento(m, s) {
  return {
    id: m.id,
    unidadId: parteDeRemolque(m.parte) && s.servidor.remolqueId ? s.servidor.remolqueId : s.servidor.cabezalId,
    fecha: m.fecha, km: m.km, parte: m.parte, trabajo: m.trabajo, provincia: m.provincia, canton: m.canton,
    taller: m.taller, costoTaller: Number(m.costoTaller) || 0, proveedor: m.proveedor,
    costoRepuestos: Number(m.costoRepuestos) || 0, repuestosDetalle: m.repuestosDetalle || undefined, notas: m.notas || undefined,
  };
}

// Evidencias de un mantenimiento (facturas y anexos posteriores)
const evidenciasDe = (m) => [...(m.evidencias || []), ...(m.anexosPosteriores || []).map((a) => a.evidencia).filter(Boolean)];

let enviando = false;
export async function enviarPendientes(app) {
  if (!app?.session?.servidor || !localStorage.getItem(CLAVE_TOKEN) || enviando || !navigator.onLine) return pintarEstado();
  enviando = true;
  pintarEstado('enviando');
  const s = app.session;
  try {
    for (const t of cola()) {
      const m = app.maintenances.find((x) => x.id === t.id);
      try {
        if (t.tipo === 'mantenimiento' && m) {
          await api('/mantenimientos', { metodo: 'POST', cuerpo: datosMantenimiento(m, s) });
          if (m.km > (s.servidor.km || 0)) s.servidor.km = m.km; // el servidor sube el km con el mantenimiento
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
async function traerMantenimientos(app) {
  const { mantenimientos } = await api('/mantenimientos');
  let nuevos = 0;
  mantenimientos.forEach((m) => {
    if (app.maintenances.some((x) => x.id === m.id)) return;
    const costoTaller = Number(m.costoTaller), costoRepuestos = Number(m.costoRepuestos);
    app.maintenances.push({
      id: m.id, fecha: m.fecha, km: m.km, parte: m.parte, trabajo: m.trabajo, provincia: m.provincia, canton: m.canton,
      taller: m.taller || 'No especificado', costoTaller, facturaTallerFile: null, proveedor: m.proveedor || 'No especificado',
      costoRepuestos, repuestosDetalle: m.repuestosDetalle || '', facturaRepuestosFile: null, costo: costoTaller + costoRepuestos,
      notas: m.notas || '', anexosPosteriores: [], evidencias: [], bloqueado: m.bloqueado, reportFolio: null,
    });
    nuevos++;
  });
  if (nuevos) {
    app.maintenances.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    app.saveStorage();
    app.refreshUI();
  }
}

function sesionVencida(app) {
  localStorage.removeItem(CLAVE_TOKEN);
  app.showToast('Tu sesión venció. Vuelve a entrar con tu correo.', 'warning');
  app.session = null;
  app.saveStorage();
  app.switchView('login');
}

// ---------------------------------------------------------------- indicador de estado
function pintarEstado(fase) {
  const b = document.getElementById('btn-sync-status');
  if (!b) return;
  const n = cola().length;
  let color = 'bg-emerald-400', texto = 'Sincronizado';
  if (!navigator.onLine) [color, texto] = ['bg-amber-400', n ? `Sin señal · ${n} por enviar` : 'Sin señal · guardado'];
  else if (fase === 'enviando') [color, texto] = ['bg-cyan-400', 'Enviando…'];
  else if (n) [color, texto] = ['bg-amber-400', `${n} por enviar`];
  b.innerHTML = `<span class="w-2.5 h-2.5 rounded-full ${color} ${fase === 'enviando' ? 'animate-pulse' : ''}"></span><span>${esc(texto)}</span>`;
}

// ---------------------------------------------------------------- pantalla de ingreso por email
function pantallaIngreso(app) {
  const vista = document.getElementById('view-login');
  vista.innerHTML = `
    <div class="bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 sm:p-8 max-w-lg mx-auto shadow-2xl">
      <div class="text-center mb-6">
        <div class="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-3 text-3xl"><i class="fa-solid fa-envelope-open-text"></i></div>
        <h2 class="text-2xl sm:text-3xl font-extrabold text-white" id="ing-titulo">Entrar a Mi Trailer</h2>
        <p class="text-slate-400 text-base mt-1" id="ing-ayuda">Escribe tu correo y te enviaremos un código de 6 números.</p>
      </div>
      <form id="ing-form" class="space-y-5" novalidate>
        <div id="ing-registro" class="hidden space-y-5">
          <div><label class="block text-slate-300 font-bold text-lg mb-1" for="ing-nombre">Tu nombre completo</label>
            <input id="ing-nombre" autocomplete="name" class="w-full bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 rounded-2xl py-3.5 px-4 text-lg text-white font-semibold focus:outline-none"></div>
          <div><label class="block text-slate-300 font-bold text-lg mb-1" for="ing-empresa">Nombre de tu empresa o flota</label>
            <input id="ing-empresa" class="w-full bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 rounded-2xl py-3.5 px-4 text-lg text-white font-semibold focus:outline-none"></div>
        </div>
        <div id="ing-paso-correo"><label class="block text-slate-300 font-bold text-lg mb-1" for="ing-email">Correo electrónico</label>
          <input id="ing-email" type="email" inputmode="email" autocomplete="email" required placeholder="chofer@ejemplo.com" class="w-full bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 rounded-2xl py-3.5 px-4 text-lg text-white font-semibold focus:outline-none"></div>
        <div id="ing-paso-codigo" class="hidden"><label class="block text-slate-300 font-bold text-lg mb-1" for="ing-codigo">Código de 6 números</label>
          <input id="ing-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" class="w-full bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 rounded-2xl py-3.5 px-4 text-3xl text-center tracking-[0.5em] font-mono text-white font-bold focus:outline-none">
          <p class="text-xs text-slate-400 mt-1">Revisa tu correo (también la carpeta de spam). Vence en 10 minutos.</p></div>
        <p id="ing-error" class="hidden text-amber-400 font-bold" role="alert"></p>
        <button type="submit" id="ing-boton" class="touch-target w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-slate-950 font-black text-xl py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3">
          <span id="ing-boton-texto">ENVIARME EL CÓDIGO</span><i class="fa-solid fa-arrow-right"></i></button>
        <button type="button" id="ing-otro" class="hidden w-full text-center text-sm font-semibold text-cyan-400 underline py-2">Usar otro correo o pedir un código nuevo</button>
        <button type="button" id="ing-crear" class="w-full text-center text-sm font-semibold text-cyan-400 underline py-2">¿Eres dueño y aún no tienes cuenta? Créala aquí</button>
      </form>
    </div>`;
  let paso = 'correo';
  let registro = false;
  const $ = (id) => document.getElementById(id);
  const error = (msg) => {
    $('ing-error').textContent = msg || '';
    $('ing-error').classList.toggle('hidden', !msg);
  };
  const irA = (p) => {
    paso = p;
    $('ing-paso-codigo').classList.toggle('hidden', p !== 'codigo');
    $('ing-paso-correo').classList.toggle('hidden', p === 'codigo');
    $('ing-registro').classList.toggle('hidden', !(registro && p === 'correo'));
    $('ing-otro').classList.toggle('hidden', p !== 'codigo');
    $('ing-crear').classList.toggle('hidden', p === 'codigo' || registro);
    $('ing-boton-texto').textContent = p === 'codigo' ? 'ENTRAR' : registro ? 'CREAR CUENTA Y ENVIAR CÓDIGO' : 'ENVIARME EL CÓDIGO';
    $('ing-titulo').textContent = registro && p === 'correo' ? 'Crear cuenta de dueño' : 'Entrar a Mi Trailer';
    (p === 'codigo' ? $('ing-codigo') : $('ing-email')).focus();
  };
  $('ing-crear').onclick = () => {
    registro = true;
    irA('correo');
  };
  $('ing-otro').onclick = () => irA('correo');
  $('ing-form').onsubmit = async (e) => {
    e.preventDefault();
    error('');
    const email = $('ing-email').value.trim().toLowerCase();
    $('ing-boton').disabled = true;
    try {
      if (paso === 'correo') {
        if (registro) await api('/auth/registro', { metodo: 'POST', cuerpo: { email, nombre: $('ing-nombre').value.trim(), nombreCuenta: $('ing-empresa').value.trim() || undefined } });
        else await api('/auth/codigo', { metodo: 'POST', cuerpo: { email } });
        irA('codigo');
      } else {
        const r = await api('/auth/verificar', { metodo: 'POST', cuerpo: { email, codigo: $('ing-codigo').value.trim() } });
        const sesion = await iniciarSesionServidor(r.token);
        if (!sesion) return; // dueño → su panel
        app.session = sesion;
        app.saveStorage();
        app.switchView('dashboard');
        app.refreshUI();
        app.showToast(`¡Bienvenido, ${sesion.nombre}!`, 'success');
        document.getElementById('frame-3d')?.contentWindow?.location.reload();
        await traerMantenimientos(app).catch(() => {});
        enviarPendientes(app);
      }
    } catch (err) {
      error(err instanceof ErrorApi || err.message ? err.message : 'Sin conexión. Intenta de nuevo cuando tengas señal.');
    } finally {
      $('ing-boton').disabled = false;
    }
  };
}

// ---------------------------------------------------------------- conexión con la app de la demo
function conectar(app) {
  pantallaIngreso(app);
  // Cada vez que se muestra el ingreso, empieza desde el correo (no desde el código anterior)
  const cambiarVista = app.switchView.bind(app);
  app.switchView = (vista) => {
    if (vista === 'login') pantallaIngreso(app);
    return cambiarVista(vista);
  };
  document.getElementById('btn-sync-status')?.classList.replace('hidden', 'flex');

  // El dueño no usa esta pantalla: va a su panel
  if (app.session?.rol === 'dueno') location.href = './dueno.html';

  // Salir: cierra la sesión también en el servidor
  app.handleLogout = () => {
    if (!confirm('¿Deseas cerrar la sesión en este teléfono?')) return;
    if (cola().length && !confirm('Hay datos que aún no se enviaron al servidor. Si sales ahora se quedan en este teléfono. ¿Salir igual?')) return;
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
    const antes = app.maintenances[0]?.id;
    await guardarOriginal(e);
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

  // Reportes: se emiten en el servidor (folio y huella oficiales) y se muestran como antes
  const conReporteServidor = (original, cuerpo) => async (...args) => {
    if (!app.session?.servidor) return original(...args);
    if (!navigator.onLine) return app.showToast('Necesitas señal para emitir el reporte oficial', 'warning');
    await enviarPendientes(app);
    if (cola().length) return app.showToast('Aún hay datos por enviar. Intenta de nuevo en un momento.', 'warning');
    try {
      const { reporte } = await api('/reportes', { metodo: 'POST', cuerpo: cuerpo(...args) });
      original(...args);
      document.getElementById('rep-folio').textContent = reporte.folio;
      document.getElementById('rep-hash').textContent = reporte.hash;
      if (reporte.tipo === 'mensual' && app.reports[0]) {
        // El reporte local toma el folio y la huella oficiales del servidor
        const folioLocal = app.reports[0].folio;
        Object.assign(app.reports[0], { folio: reporte.folio, hash: reporte.hash });
        app.maintenances.forEach((m) => {
          if (m.reportFolio === folioLocal) m.reportFolio = reporte.folio;
        });
        app.saveStorage();
      }
    } catch (err) {
      app.showToast(err.message || 'No se pudo emitir el reporte', 'warning');
    }
  };
  const mes = () => new Date().toISOString().slice(0, 7);
  app.prepareMonthlyReportPreview = conReporteServidor(app.prepareMonthlyReportPreview.bind(app), () => ({ tipo: 'mensual', periodo: mes() }));
  app.generateSingleMaintenanceReport = conReporteServidor(app.generateSingleMaintenanceReport.bind(app), (id) => ({ tipo: 'individual', mantenimientoId: id }));

  // Envíos automáticos
  window.addEventListener('online', () => enviarPendientes(app));
  window.addEventListener('offline', () => pintarEstado());
  window.addEventListener('storage', (ev) => ev.key === 'mi_trailer_detalles' && enviarPendientes(app));
  setInterval(() => enviarPendientes(app), 60_000);
  if (app.session?.servidor) {
    traerMantenimientos(app).catch(() => {});
    enviarPendientes(app);
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
