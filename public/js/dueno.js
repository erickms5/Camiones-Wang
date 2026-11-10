// Panel del dueño: sus vehículos (km, chofer, tanque), sus choferes, los mantenimientos y los reportes.
// El dueño solo ve los vehículos de los que es dueño; un vehículo puede tener varios dueños.
import { MODELOS, nombreModelo } from './catalogo.js';
import { abrirHoja, abrirReporte, htmlEvidencias, nombrePago, nombreMes } from './reporte.js';
import {
  $, api, esc, dinero, miles, fechaHora, mensajeDe, aviso, iniciarMenu, dialogo, confirmar, entero, sesionPanel, pintarCuenta, barraTanque, placaHTML, nombreVehiculo,
} from './panel.js';

const datos = { vehiculos: [], tanquerosSueltos: [], choferes: [], mantenimientos: [] };
const vacio = (texto) => `<p class="text-slate-400 italic bg-slate-900 rounded-2xl p-5 border border-slate-800">${esc(texto)}</p>`;
const vehiculoDe = (id) => datos.vehiculos.find((v) => v.id === id);
const choferDe = (id) => datos.choferes.find((c) => c.id === id);
const mesActual = () => new Date().toISOString().slice(0, 7);
const total = (m) => Number(m.costoTaller) + Number(m.costoRepuestos);
// Lo que quedó a crédito y sigue sin pagar: [{ concepto, a quién, monto }]
const deudas = (m) => [
  ['taller', m.taller, m.costoTaller, m.pagoTaller, m.tallerPagadoEn],
  ['repuestos', m.proveedor, m.costoRepuestos, m.pagoRepuestos, m.repuestosPagadoEn],
].filter(([, , monto, forma, pagado]) => forma === 'credito' && !pagado && Number(monto) > 0).map(([concepto, aQuien, monto]) => ({ concepto, aQuien, monto: Number(monto) }));
const porPagar = (m) => deudas(m).reduce((s, d) => s + d.monto, 0);

async function contarPagos() {
  const { mantenimientos } = await api('/mantenimientos?porPagar=si');
  $('menu-pagos').textContent = mantenimientos.length;
  $('menu-pagos').classList.toggle('hidden', !mantenimientos.length);
  return mantenimientos;
}

async function cargarBase() {
  const [flota, { choferes }] = await Promise.all([api('/flota'), api('/choferes')]);
  Object.assign(datos, flota, { choferes });
  const opcionesV = `<option value="">Todos mis vehículos</option>${datos.vehiculos.map((v) => `<option value="${esc(v.id)}">${esc(v.placa)} · ${esc(nombreVehiculo(v))}</option>`).join('')}`;
  ['m-vehiculo', 'r-vehiculo'].forEach((id) => {
    const previo = $(id).value;
    $(id).innerHTML = opcionesV;
    $(id).value = previo;
  });
  const previo = $('r-chofer').value;
  $('r-chofer').innerHTML = `<option value="">Todos los choferes</option>${choferes.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}`;
  $('r-chofer').value = previo;
}

// ---------------------------------------------------------------- inicio
function filaMantenimiento(m) {
  const v = vehiculoDe(m.vehiculoId);
  return `<button type="button" data-mant="${esc(m.id)}" class="w-full text-left p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500 flex items-center justify-between gap-3">
    <div class="min-w-0">
      <p class="font-bold text-white truncate">${esc(m.trabajo)}</p>
      <p class="text-xs text-slate-400 truncate">${esc(m.parte)} · ${esc(m.fecha)} · ${esc(miles(m.km))} km</p>
      <p class="text-xs text-cyan-300 truncate">${esc(v?.placa || '')}${choferDe(m.creadoPor) ? ` · ${esc(choferDe(m.creadoPor).nombre)}` : ''}</p>
    </div>
    <div class="text-right shrink-0"><span class="font-mono font-black text-emerald-400">${esc(dinero(total(m)))}</span>
      ${porPagar(m) ? `<span class="block text-[11px] font-black text-amber-300">Por pagar ${esc(dinero(porPagar(m)))}</span>` : ''}</div>
  </button>`;
}
const alTocarMantenimientos = (contenedor) => contenedor.querySelectorAll('[data-mant]').forEach((b) => (b.onclick = () => abrirMantenimiento(b.dataset.mant).catch((e) => aviso(mensajeDe(e), 'error'))));

async function pintarInicio() {
  await cargarBase();
  const { mantenimientos } = await api('/mantenimientos');
  const delMes = mantenimientos.filter((m) => m.fecha.startsWith(mesActual()));
  const tarjeta = (icono, valor, texto, color) => `<div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
    <i class="fa-solid ${icono} ${color} text-xl"></i><p class="text-2xl sm:text-3xl font-black text-white mt-1">${esc(valor)}</p><p class="text-xs text-slate-400 font-bold">${esc(texto)}</p></div>`;
  $('i-resumen').innerHTML = tarjeta('fa-truck', datos.vehiculos.length, 'Vehículos', 'text-emerald-400')
    + tarjeta('fa-id-card', datos.choferes.filter((c) => c.activo).length, 'Choferes activos', 'text-cyan-400')
    + tarjeta('fa-screwdriver-wrench', delMes.length, 'Trabajos este mes', 'text-amber-400')
    + tarjeta('fa-dollar-sign', dinero(delMes.reduce((s, m) => s + total(m), 0)), 'Gastado este mes', 'text-emerald-400');

  // Lo que falta para que cada vehículo quede listo para trabajar, y lo que hay que pagar
  const pendientes = [];
  const creditos = await contarPagos();
  if (creditos.length) pendientes.push(['fa-hand-holding-dollar', `Tienes ${dinero(creditos.reduce((s, m) => s + porPagar(m), 0))} por pagar de trabajos a crédito.`, 'pagos']);
  if (!datos.vehiculos.length) pendientes.push(['fa-truck', 'Todavía no tienes vehículos registrados.', 'vehiculos']);
  datos.vehiculos.forEach((v) => {
    if (v.km === null) pendientes.push(['fa-gauge-high', `Pon el kilometraje actual de ${v.placa}.`, 'vehiculos']);
    if (!v.chofer) pendientes.push(['fa-user', `${v.placa} no tiene chofer asignado.`, 'vehiculos']);
  });
  if (datos.vehiculos.length && !datos.choferes.length) pendientes.push(['fa-user-plus', 'Registra a tu primer chofer.', 'choferes']);
  $('i-pendientes').innerHTML = pendientes.length
    ? pendientes.map(([icono, texto, seccion]) => `<button type="button" data-ir="${seccion}" class="w-full text-left flex items-center gap-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-100 font-bold">
        <i class="fa-solid ${icono} text-amber-400 w-6 text-center"></i><span class="flex-1">${esc(texto)}</span><i class="fa-solid fa-chevron-right text-amber-400/70"></i></button>`).join('')
    : '<p class="flex items-center gap-2 text-emerald-300 font-bold"><i class="fa-solid fa-circle-check"></i> Todo al día: tus vehículos tienen kilometraje y chofer, y no hay nada por pagar.</p>';
  $('i-pendientes').querySelectorAll('[data-ir]').forEach((b) => (b.onclick = () => ir(b.dataset.ir)));
  $('i-ultimos').innerHTML = mantenimientos.length ? mantenimientos.slice(0, 5).map(filaMantenimiento).join('') : '<p class="text-sm text-slate-400">Tus choferes aún no registran mantenimientos.</p>';
  alTocarMantenimientos($('i-ultimos'));
}

// ---------------------------------------------------------------- vehículos
async function pintarVehiculos() {
  await cargarBase();
  const activos = datos.choferes.filter((c) => c.activo);
  $('v-lista').innerHTML = datos.vehiculos.length ? datos.vehiculos.map((v) => {
    const tracto = v.tipo === 'tracto';
    return `<article class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          ${placaHTML(v.placa)}
          <p class="text-lg font-black text-white mt-1.5 leading-tight">${esc(nombreVehiculo(v))}</p>
          <p class="text-xs text-slate-400">${tracto ? 'Cabezal con tanquero' : 'Camión tanquero'} · ${esc(v.numEjes + (v.tanquero?.numEjes || 0))} ejes · ${esc(v.numLlantas + (v.tanquero?.numLlantas || 0))} llantas${v.motor ? ` · Motor ${esc(v.motor)}` : ''}</p>
        </div>
        <i class="fa-solid ${tracto ? 'fa-truck-moving' : 'fa-truck'} text-3xl text-slate-700"></i>
      </div>
      ${barraTanque(v.compartimentos)}
      <div class="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-2xl p-3">
        <div><p class="text-xs uppercase font-bold text-slate-400">Kilometraje</p>
          <p class="${v.km === null ? 'text-amber-300 font-bold' : 'text-2xl font-black font-mono text-emerald-400'}">${v.km === null ? 'Pendiente' : `${esc(miles(v.km))} km`}</p></div>
        <button type="button" data-km="${esc(v.id)}" class="touch-target px-4 rounded-xl border border-cyan-500/40 text-cyan-300 font-bold">${v.km === null ? 'Poner km' : 'Corregir'}</button>
      </div>
      <label class="block text-sm font-bold text-slate-300">Chofer
        <select data-chofer="${esc(v.id)}" class="mt-1 w-full bg-slate-950 border-2 ${v.chofer ? 'border-slate-700' : 'border-amber-500/50'} rounded-xl p-3 text-base text-white">
          <option value="">Sin chofer</option>
          ${activos.map((c) => `<option value="${esc(c.id)}" ${v.chofer?.id === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
        </select></label>
      <div class="flex items-center justify-between gap-2 text-xs text-slate-400">
        <span>${v.duenos.length > 1 ? `Dueños: ${esc(v.duenos.map((d) => d.nombre).join(', '))}` : ''}</span>
        <button type="button" data-ver="${esc(v.id)}" class="text-sm font-bold text-cyan-400 py-2">Ver mantenimientos ›</button>
      </div>
    </article>`;
  }).join('') : vacio('Todavía no tienes vehículos. Agrega uno o pide al administrador que los registre.');

  $('v-lista').querySelectorAll('[data-km]').forEach((b) => (b.onclick = () => ponerKm(vehiculoDe(b.dataset.km))));
  $('v-lista').querySelectorAll('[data-ver]').forEach((b) => (b.onclick = () => {
    $('m-vehiculo').value = b.dataset.ver;
    $('m-mes').value = '';
    ir('mantenimientos');
  }));
  $('v-lista').querySelectorAll('[data-chofer]').forEach((sel) => (sel.onchange = async () => {
    const v = vehiculoDe(sel.dataset.chofer);
    const chofer = choferDe(sel.value);
    // Un chofer maneja un vehículo a la vez: se avisa si esto lo quita de otro
    const otro = chofer && datos.vehiculos.find((x) => x.chofer?.id === chofer.id && x.id !== v.id);
    if (otro && !(await confirmar('Cambiar de vehículo', `${chofer.nombre} maneja ahora ${otro.placa}. Si lo pasas a ${v.placa}, ${otro.placa} queda sin chofer.`, 'Sí, cambiarlo'))) return pintarVehiculos();
    try {
      await api(`/unidades/${v.id}/asignar`, { metodo: 'POST', cuerpo: { choferId: sel.value || null } });
      aviso(chofer ? `${chofer.nombre} ahora maneja ${v.placa}` : `${v.placa} quedó sin chofer`);
    } catch (err) {
      aviso(mensajeDe(err), 'error');
    }
    await pintarVehiculos();
  }));
}

async function ponerKm(v) {
  const primera = v.km === null;
  const r = await dialogo({
    titulo: primera ? `Kilometraje de ${v.placa}` : `Corregir kilometraje de ${v.placa}`,
    texto: primera
      ? 'Mira el tablero y escribe el número completo. Desde ahí, el kilometraje sube solo con cada mantenimiento que registre el chofer.'
      : `Ahora marca ${miles(v.km)} km. La corrección queda guardada con su motivo.`,
    campos: [
      { nombre: 'km', etiqueta: 'Kilometraje actual', tipo: 'numero', valor: v.km ?? '', mono: true },
      ...(primera ? [] : [{ nombre: 'motivo', etiqueta: '¿Por qué lo corriges?', ejemplo: 'Ej: estaba mal escrito' }]),
    ],
    alAceptar: (x) => api(`/unidades/${v.id}/km`, { metodo: 'POST', cuerpo: { km: entero(x.km), motivo: primera ? 'Kilometraje inicial' : x.motivo } }),
  });
  if (r) {
    aviso('Kilometraje guardado');
    await pintarVehiculos();
  }
}

$('v-nuevo').onclick = async () => {
  const r = await dialogo({
    titulo: 'Agregar vehículo',
    texto: 'Elige el modelo: el sistema arma solo sus ejes, llantas, frenos y los compartimentos del tanque.',
    campos: [
      { nombre: 'modeloId', etiqueta: 'Modelo', tipo: 'lista', opciones: MODELOS.map((m) => [m.id, `${nombreModelo(m)} — ${m.descripcion}`]) },
      { nombre: 'placa', etiqueta: 'Placa', ejemplo: 'ABC-1234', mono: true },
      { nombre: 'anio', etiqueta: 'Año', tipo: 'numero', opcional: true },
      { nombre: 'kmInicial', etiqueta: 'Kilometraje actual', tipo: 'numero', opcional: true, ayuda: 'Si aún no lo sabes, déjalo vacío y ponlo después.' },
    ],
    boton: 'Agregar',
    alAceptar: (x) => api('/vehiculos', {
      metodo: 'POST',
      cuerpo: { modeloId: x.modeloId, placa: x.placa, anio: entero(x.anio), kmInicial: entero(x.kmInicial) },
    }),
  });
  if (r) {
    aviso('Vehículo agregado con sus ejes, llantas, frenos y tanque');
    await pintarVehiculos();
  }
};

// ---------------------------------------------------------------- choferes
async function pintarChoferes() {
  await cargarBase();
  $('c-lista').innerHTML = datos.choferes.length ? datos.choferes.map((c) => `
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="text-lg font-bold text-white">${esc(c.nombre)} ${c.activo ? '' : '<span class="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full align-middle">Inactivo</span>'}</p>
        <p class="text-sm text-slate-400 break-all">${esc(c.email)} · Cédula ${esc(c.cedula || '—')}</p>
        <p class="text-xs ${c.unidades.length ? 'text-cyan-300' : 'text-amber-300'}">${c.unidades.length ? `Maneja ${esc(c.unidades.join(', '))}` : 'Sin vehículo asignado'}</p>
      </div>
      <div class="flex gap-2">
        <button type="button" data-clave="${esc(c.id)}" class="touch-target px-4 rounded-xl border border-cyan-500/40 text-cyan-300 font-bold">Nueva contraseña</button>
        <button type="button" data-activo="${esc(c.id)}" class="touch-target px-4 rounded-xl border ${c.activo ? 'border-rose-500/40 text-rose-300' : 'border-emerald-500/40 text-emerald-300'} font-bold">${c.activo ? 'Desactivar' : 'Activar'}</button>
      </div>
    </div>`).join('') : vacio('Aún no registras choferes.');
  $('c-lista').querySelectorAll('[data-activo]').forEach((b) => (b.onclick = async () => {
    const c = choferDe(b.dataset.activo);
    if (c.activo && !(await confirmar(`Desactivar a ${c.nombre}`, 'Ya no podrá entrar a la app. Sus mantenimientos y reportes se conservan y puedes activarlo de nuevo cuando quieras.', 'Desactivar', true))) return;
    await api(`/choferes/${c.id}`, { metodo: 'PATCH', cuerpo: { activo: !c.activo } }).catch((e) => aviso(mensajeDe(e), 'error'));
    await pintarChoferes();
  }));
  // Si el chofer olvidó su contraseña, el dueño le pone una nueva
  $('c-lista').querySelectorAll('[data-clave]').forEach((b) => (b.onclick = async () => {
    const c = choferDe(b.dataset.clave);
    const r = await dialogo({
      titulo: `Nueva contraseña para ${c.nombre}`,
      texto: 'Se cierran sus sesiones abiertas y entra de nuevo con esta contraseña. Entrégasela tú.',
      campos: [{ nombre: 'clave', etiqueta: 'Contraseña nueva (mínimo 6 caracteres)', tipo: 'clave' }],
      alAceptar: (x) => api(`/choferes/${c.id}`, { metodo: 'PATCH', cuerpo: { clave: x.clave } }),
    });
    if (r) aviso('Contraseña cambiada. Entrégasela al chofer.');
  }));
}

$('c-nuevo').onclick = async () => {
  const r = await dialogo({
    titulo: 'Registrar chofer',
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre completo' },
      { nombre: 'email', etiqueta: 'Correo (con este entra a la app)', tipo: 'correo' },
      { nombre: 'cedula', etiqueta: 'Cédula', tipo: 'numero', mono: true },
      { nombre: 'telefono', etiqueta: 'Celular', ejemplo: '099 123 4567', opcional: true },
      { nombre: 'clave', etiqueta: 'Contraseña para el chofer (mínimo 6 caracteres)', tipo: 'clave', ayuda: 'Entrégasela tú. Después él puede cambiarla.' },
      { nombre: 'consentimiento', tipo: 'casilla', etiqueta: 'El chofer autoriza guardar su cédula y teléfono para el registro de mantenimientos (Ley Orgánica de Protección de Datos Personales).' },
    ],
    boton: 'Registrar',
    alAceptar: (x) => api('/choferes', { metodo: 'POST', cuerpo: { ...x, telefono: x.telefono || undefined } }),
  });
  if (r) {
    aviso('Chofer registrado. Ahora asígnale su vehículo.');
    await pintarChoferes();
  }
};

// ---------------------------------------------------------------- mantenimientos
async function pintarMantenimientos() {
  if (!datos.vehiculos.length) await cargarBase();
  const q = new URLSearchParams();
  if ($('m-vehiculo').value) q.set('vehiculo', $('m-vehiculo').value);
  if ($('m-mes').value) {
    const [a, m] = $('m-mes').value.split('-').map(Number);
    q.set('desde', `${$('m-mes').value}-01`);
    q.set('hasta', new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10));
  }
  const { mantenimientos } = await api(`/mantenimientos?${q}`);
  $('m-total').textContent = dinero(mantenimientos.reduce((s, m) => s + total(m), 0));
  $('m-lista').innerHTML = mantenimientos.length ? mantenimientos.map(filaMantenimiento).join('') : vacio('No hay mantenimientos con ese filtro.');
  alTocarMantenimientos($('m-lista'));
}
$('m-vehiculo').onchange = $('m-mes').onchange = () => pintarMantenimientos().catch((e) => aviso(mensajeDe(e), 'error'));

// ---------------------------------------------------------------- por pagar (créditos)
async function pintarPagos() {
  if (!datos.vehiculos.length) await cargarBase();
  const lista = await contarPagos();
  $('p-total').textContent = dinero(lista.reduce((s, m) => s + porPagar(m), 0));
  $('p-lista').innerHTML = lista.length ? lista.map((m) => {
    const v = vehiculoDe(m.vehiculoId);
    return `<article class="bg-slate-900 border border-amber-500/30 rounded-2xl p-4 space-y-3">
      <button type="button" data-mant="${esc(m.id)}" class="block w-full text-left">
        <p class="font-bold text-white">${esc(m.trabajo)} <span class="text-sm text-slate-400 font-normal">· ${esc(m.parte)}</span></p>
        <p class="text-xs text-slate-400">${esc(m.fecha)} · ${esc(v?.placa || '')}${choferDe(m.creadoPor) ? ` · ${esc(choferDe(m.creadoPor).nombre)}` : ''} · <span class="text-cyan-400 font-bold">ver detalle y facturas ›</span></p>
      </button>
      ${deudas(m).map((d) => `<div class="flex flex-wrap items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-xl p-3">
        <div class="min-w-0"><p class="text-xs uppercase font-bold text-slate-400">${d.concepto === 'taller' ? 'Taller (mano de obra)' : 'Repuestos'}</p>
          <p class="font-bold text-white truncate">${esc(d.aQuien || 'Sin nombre')}</p></div>
        <div class="flex items-center gap-3"><span class="text-xl font-black font-mono text-amber-400">${esc(dinero(d.monto))}</span>
          <button type="button" data-pagar="${esc(m.id)}" data-concepto="${d.concepto}" class="touch-target px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black">Ya lo pagué</button></div>
      </div>`).join('')}
    </article>`;
  }).join('') : vacio('No hay nada por pagar: ningún trabajo quedó a crédito.');
  alTocarMantenimientos($('p-lista'));
  $('p-lista').querySelectorAll('[data-pagar]').forEach((b) => (b.onclick = async () => {
    const m = lista.find((x) => x.id === b.dataset.pagar);
    const d = deudas(m).find((x) => x.concepto === b.dataset.concepto);
    const r = await dialogo({
      titulo: `Marcar como pagado: ${dinero(d.monto)}`,
      texto: `${d.concepto === 'taller' ? 'Mano de obra' : 'Repuestos'} de «${m.trabajo}»${d.aQuien ? `, a ${d.aQuien}` : ''}. Queda registrado con la fecha de hoy.`,
      campos: [{ nombre: 'forma', etiqueta: '¿Cómo lo pagaste?', tipo: 'lista', opciones: [['transferencia', 'Transferencia'], ['efectivo', 'Efectivo'], ['cheque', 'Cheque']] }],
      boton: 'Marcar como pagado',
      alAceptar: (x) => api(`/mantenimientos/${m.id}/pagos`, { metodo: 'POST', cuerpo: { concepto: d.concepto, forma: x.forma } }),
    });
    if (r) {
      aviso('Pago registrado');
      await pintarPagos();
    }
  }));
}

// ---------------------------------------------------------------- detalle de un mantenimiento
const estadoPago = (forma, pagadoEn, pagadoCon) => {
  if (!forma) return '';
  if (forma !== 'credito') return `<div class="text-xs text-slate-600">Pagado con ${esc(nombrePago(forma).toLowerCase())}</div>`;
  return pagadoEn
    ? `<div class="text-xs text-emerald-700 font-bold">Crédito pagado el ${esc(new Date(pagadoEn).toLocaleDateString('es-EC'))} (${esc(nombrePago(pagadoCon).toLowerCase())})</div>`
    : '<div class="text-xs text-amber-700 font-black">A CRÉDITO · POR PAGAR</div>';
};

async function abrirMantenimiento(id) {
  const { mantenimiento: m, evidencias } = await api(`/mantenimientos/${encodeURIComponent(id)}`);
  const v = vehiculoDe(m.vehiculoId);
  const dato = (k, valor) => `<div><span class="font-bold text-slate-500 block text-xs">${k}</span><span class="text-sm font-bold">${esc(valor || '—')}</span></div>`;
  abrirHoja('Mantenimiento', `
    <div class="border-b-2 border-slate-800 pb-3"><h4 class="text-2xl font-black">${esc(m.trabajo)}</h4><p class="text-sm text-slate-600 font-bold">${esc(m.parte)}</p></div>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-100 p-3 rounded-xl">
      ${dato('VEHÍCULO', v ? `${v.placa} · ${nombreVehiculo(v)}` : '')}${dato('CHOFER', choferDe(m.creadoPor)?.nombre)}${dato('FECHA', m.fecha)}
      ${dato('KILOMETRAJE', `${miles(m.km)} km`)}${dato('LUGAR', [m.canton, m.provincia].filter(Boolean).join(', '))}${dato('REPORTE', m.bloqueado ? 'Incluido en un reporte' : 'Aún sin reporte')}
    </div>
    <div class="grid sm:grid-cols-3 gap-3 text-sm">
      <div class="border border-slate-300 rounded-xl p-3"><span class="font-bold text-slate-500 block text-xs">TALLER (mano de obra)</span>${esc(m.taller || '—')}<div class="font-mono font-black text-lg">${esc(dinero(m.costoTaller))}</div>${Number(m.costoTaller) > 0 ? estadoPago(m.pagoTaller, m.tallerPagadoEn, m.tallerPagadoCon) : ''}</div>
      <div class="border border-slate-300 rounded-xl p-3"><span class="font-bold text-slate-500 block text-xs">REPUESTOS</span>${esc(m.proveedor || '—')}<div class="font-mono font-black text-lg">${esc(dinero(m.costoRepuestos))}</div>${Number(m.costoRepuestos) > 0 ? estadoPago(m.pagoRepuestos, m.repuestosPagadoEn, m.repuestosPagadoCon) : ''}${m.repuestosDetalle ? `<div class="text-xs text-slate-600">${esc(m.repuestosDetalle)}</div>` : ''}</div>
      <div class="border-2 border-slate-800 rounded-xl p-3"><span class="font-bold text-slate-500 block text-xs">TOTAL</span><div class="font-mono font-black text-2xl">${esc(dinero(total(m)))}</div></div>
    </div>
    ${m.notas ? `<p class="text-sm italic text-slate-700">«${esc(m.notas)}»</p>` : ''}
    <div class="space-y-2"><h5 class="text-xs font-black uppercase text-slate-700">Facturas y fotos</h5>${htmlEvidencias(evidencias, `${m.trabajo} · ${m.fecha}`)}</div>`);
}

// ---------------------------------------------------------------- reportes
async function pintarReportes() {
  if (!datos.vehiculos.length) await cargarBase();
  const q = new URLSearchParams();
  if ($('r-vehiculo').value) q.set('vehiculo', $('r-vehiculo').value);
  if ($('r-chofer').value) q.set('chofer', $('r-chofer').value);
  const { reportes } = await api(`/reportes?${q}`);
  $('r-lista').innerHTML = reportes.length
    ? reportes.map((r) => `
      <button type="button" data-folio="${esc(r.folio)}" class="w-full text-left bg-slate-900 border border-slate-800 hover:border-emerald-500 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="font-mono text-xs bg-slate-800 text-cyan-300 px-2 py-0.5 rounded">${esc(r.folio)}</span>
          <span class="text-xs text-slate-400 ml-2">${esc(r.tipo === 'mensual' ? `Mensual · ${nombreMes(r.periodo)}` : 'De un solo trabajo')}</span>
          <p class="text-lg font-bold text-white mt-1">${esc(r.chofer || 'Chofer')}${r.placa ? ` <span class="text-sm text-cyan-300 font-mono">· ${esc(r.placa)}</span>` : ''}</p>
          <p class="text-xs text-slate-400">Emitido: ${esc(fechaHora(r.generadoEn))}</p>
        </div>
        <div class="text-right"><p class="text-2xl font-black font-mono text-emerald-400">${esc(dinero(r.total))}</p><p class="text-xs text-cyan-400">Ver detalle ›</p></div>
      </button>`).join('')
    : vacio('Todavía no hay reportes emitidos para tus vehículos.');
  $('r-lista').querySelectorAll('[data-folio]').forEach((b) => (b.onclick = () => abrirReporte(b.dataset.folio).catch((e) => aviso(mensajeDe(e), 'error'))));
}
$('r-vehiculo').onchange = $('r-chofer').onchange = () => pintarReportes().catch((e) => aviso(mensajeDe(e), 'error'));

// ---------------------------------------------------------------- inicio del panel
let ir = () => {};
try {
  const usuario = await sesionPanel('dueno');
  pintarCuenta(usuario);
  $('m-mes').value = mesActual();
  ir = iniciarMenu({ inicio: pintarInicio, vehiculos: pintarVehiculos, choferes: pintarChoferes, pagos: pintarPagos, mantenimientos: pintarMantenimientos, reportes: pintarReportes });
  ir('inicio');
} catch (err) {
  aviso(mensajeDe(err), 'error');
}
