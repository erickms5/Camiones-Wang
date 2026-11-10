// Panel del administrador: crea las empresas con sus dueños, registra y corrige vehículos,
// decide de quién es cada uno y ayuda con contraseñas. No ve mantenimientos, facturas ni reportes.
import { MODELOS, modeloPorId, nombreModelo, galones, ejesDe, partesDe } from './catalogo.js';
import {
  $, api, esc, miles, mensajeDe, aviso, iniciarMenu, dialogo, confirmar, entero, listaGalones, sesionPanel, pintarCuenta, barraTanque, placaHTML, nombreVehiculo,
} from './panel.js';

let empresa = null; // detalle de la empresa abierta
const vacio = (texto) => `<p class="text-slate-400 italic bg-slate-900 rounded-2xl p-5 border border-slate-800">${esc(texto)}</p>`;
const boton = (atributos, texto, color = 'border-cyan-500/40 text-cyan-300') => `<button type="button" ${atributos} class="px-3 py-2 rounded-xl border ${color} font-bold text-sm">${texto}</button>`;
const camposDueno = [
  { nombre: 'nombre', etiqueta: 'Nombre completo del dueño' },
  { nombre: 'email', etiqueta: 'Correo (con este entra)', tipo: 'correo' },
  { nombre: 'clave', etiqueta: 'Contraseña (mínimo 8 caracteres)', tipo: 'clave', ayuda: 'Entrégasela tú. Después puede cambiarla en «Mi cuenta».' },
];

// ---------------------------------------------------------------- empresas
async function pintarEmpresas() {
  empresa = null;
  $('e-detalle').classList.add('hidden');
  $('e-lista-caja').classList.remove('hidden');
  const { cuentas } = await api('/admin/cuentas');
  $('e-lista').innerHTML = cuentas.length ? cuentas.map((c) => `
    <button type="button" data-empresa="${esc(c.id)}" class="text-left bg-slate-900 border border-slate-800 hover:border-emerald-500 rounded-3xl p-5">
      <p class="text-xl font-black text-white">${esc(c.nombre)}</p>
      <p class="text-sm text-slate-400 mt-1">${esc(c.duenos)} ${c.duenos === 1 ? 'dueño' : 'dueños'} · ${esc(c.vehiculos)} ${c.vehiculos === 1 ? 'vehículo' : 'vehículos'} · ${esc(c.choferes)} ${c.choferes === 1 ? 'chofer' : 'choferes'}</p>
      <p class="text-sm font-bold text-cyan-400 mt-2">Abrir ›</p>
    </button>`).join('') : vacio('Todavía no hay empresas. Crea la primera con su dueño.');
  $('e-lista').querySelectorAll('[data-empresa]').forEach((b) => (b.onclick = () => abrirEmpresa(b.dataset.empresa).catch((e) => aviso(mensajeDe(e), 'error'))));
}

$('e-nueva').onclick = async () => {
  const r = await dialogo({
    titulo: 'Nueva empresa',
    texto: 'Se crea la empresa con su primer dueño. Luego registras sus vehículos y, si hace falta, más dueños.',
    campos: [{ nombre: 'empresa', etiqueta: 'Nombre de la empresa' }, ...camposDueno],
    boton: 'Crear empresa',
    alAceptar: (x) => api('/admin/cuentas', { metodo: 'POST', cuerpo: { nombre: x.empresa, dueno: { nombre: x.nombre, email: x.email, clave: x.clave } } }),
  });
  if (r) {
    aviso('Empresa creada');
    await abrirEmpresa(r.cuenta.id);
  }
};

// ---------------------------------------------------------------- detalle de una empresa
async function abrirEmpresa(id) {
  empresa = await api(`/admin/cuentas/${id}`);
  const e = empresa;
  $('e-lista-caja').classList.add('hidden');
  const caja = $('e-detalle');
  caja.classList.remove('hidden');
  const persona = (p) => `
    <div class="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
      <div class="min-w-0">
        <p class="font-bold text-white">${esc(p.nombre)} ${p.activo ? '' : '<span class="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full align-middle">Inactivo</span>'}</p>
        <p class="text-sm text-slate-400 break-all">${esc(p.email)}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        ${boton(`data-editar-persona="${esc(p.id)}"`, 'Corregir')}
        ${boton(`data-clave="${esc(p.id)}"`, 'Nueva contraseña')}
        ${boton(`data-activo="${esc(p.id)}"`, p.activo ? 'Desactivar' : 'Activar', p.activo ? 'border-rose-500/40 text-rose-300' : 'border-emerald-500/40 text-emerald-300')}
      </div>
    </div>`;
  const vehiculo = (v) => {
    const tracto = v.tipo === 'tracto';
    return `<article class="bg-slate-950 border ${v.activa ? 'border-slate-800' : 'border-rose-900 opacity-70'} rounded-2xl p-4 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          ${placaHTML(v.placa)} ${v.activa ? '' : '<span class="text-xs bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full">Dado de baja</span>'}
          <p class="text-lg font-black text-white mt-1.5 leading-tight">${esc(nombreVehiculo(v))}</p>
          <p class="text-xs text-slate-400">${tracto ? 'Cabezal con tanquero' : 'Camión tanquero'} · ${esc(v.numEjes + (v.tanquero?.numEjes || 0))} ejes · ${esc(v.numLlantas + (v.tanquero?.numLlantas || 0))} llantas${v.motor ? ` · Motor ${esc(v.motor)}` : ' · motor sin registrar'}</p>
        </div>
        <p class="text-right text-sm ${v.km === null ? 'text-amber-300 font-bold' : 'font-mono font-black text-emerald-400'}">${v.km === null ? 'Km pendiente' : `${esc(miles(v.km))} km`}</p>
      </div>
      ${barraTanque(v.compartimentos)}
      <p class="text-sm"><span class="text-slate-400 font-bold">Dueños:</span> ${v.duenos.length ? esc(v.duenos.map((d) => d.nombre).join(', ')) : '<span class="text-amber-300 font-bold">ninguno: nadie lo ve todavía</span>'}</p>
      <p class="text-sm"><span class="text-slate-400 font-bold">Chofer:</span> ${v.chofer ? esc(v.chofer.nombre) : '<span class="text-slate-500">sin asignar (lo elige el dueño)</span>'}</p>
      <div class="flex flex-wrap gap-2 pt-1">
        ${boton(`data-editar="${esc(v.id)}"`, '<i class="fa-solid fa-pen mr-1"></i> Corregir datos')}
        ${boton(`data-duenos="${esc(v.id)}"`, '<i class="fa-solid fa-users mr-1"></i> Dueños')}
        ${boton(`data-km="${esc(v.id)}"`, v.km === null ? 'Poner km' : 'Corregir km')}
        ${boton(`data-baja="${esc(v.id)}"`, v.activa ? 'Dar de baja' : 'Reactivar', v.activa ? 'border-rose-500/40 text-rose-300' : 'border-emerald-500/40 text-emerald-300')}
      </div>
    </article>`;
  };
  caja.innerHTML = `
    <button type="button" id="e-volver" class="text-sm font-bold text-cyan-400 py-2"><i class="fa-solid fa-arrow-left mr-1"></i> Todas las empresas</button>
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-wrap items-center justify-between gap-3">
      <div><p class="text-xs uppercase tracking-wider font-bold text-slate-400">Empresa</p><h2 class="text-2xl font-black text-white">${esc(e.cuenta.nombre)}</h2></div>
      ${boton('id="e-renombrar"', 'Cambiar nombre')}
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="text-lg font-black text-white"><i class="fa-solid fa-user-tie text-cyan-400 mr-1"></i> Dueños</h3>
        ${boton('id="e-dueno"', '<i class="fa-solid fa-plus mr-1"></i> Agregar dueño', 'border-emerald-500/50 text-emerald-300')}
      </div>
      <p class="text-xs text-slate-400">Cada dueño ve solo los vehículos que le marques como suyos. Un vehículo puede tener varios dueños.</p>
      ${e.duenos.map(persona).join('')}
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="text-lg font-black text-white"><i class="fa-solid fa-truck text-emerald-400 mr-1"></i> Vehículos</h3>
        ${boton('id="e-vehiculo"', '<i class="fa-solid fa-plus mr-1"></i> Registrar vehículo', 'border-emerald-500/50 text-emerald-300')}
      </div>
      <div class="grid md:grid-cols-2 gap-3">${e.vehiculos.length ? e.vehiculos.map(vehiculo).join('') : vacio('Aún sin vehículos.')}</div>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
      <h3 class="text-lg font-black text-white"><i class="fa-solid fa-id-card text-amber-400 mr-1"></i> Choferes</h3>
      <p class="text-xs text-slate-400">Los registra cada dueño desde su panel. Aquí puedes ayudar con una contraseña o un dato mal escrito.</p>
      ${e.choferes.length ? e.choferes.map(persona).join('') : '<p class="text-sm text-slate-400 italic">Los dueños aún no registran choferes.</p>'}
    </div>`;

  const recargar = () => abrirEmpresa(e.cuenta.id);
  const personaDe = (pid) => [...e.duenos, ...e.choferes].find((p) => p.id === pid);
  const vehiculoDe = (vid) => e.vehiculos.find((v) => v.id === vid);
  const cada = (selector, fn) => caja.querySelectorAll(selector).forEach((b) => (b.onclick = () => fn(b).catch((err) => aviso(mensajeDe(err), 'error'))));
  $('e-volver').onclick = () => pintarEmpresas().catch((err) => aviso(mensajeDe(err), 'error'));

  $('e-renombrar').onclick = async () => {
    const r = await dialogo({ titulo: 'Nombre de la empresa', campos: [{ nombre: 'nombre', etiqueta: 'Nombre', valor: e.cuenta.nombre }], alAceptar: (x) => api(`/admin/cuentas/${e.cuenta.id}`, { metodo: 'PATCH', cuerpo: x }) });
    if (r) await recargar();
  };
  $('e-dueno').onclick = async () => {
    const r = await dialogo({
      titulo: 'Agregar dueño', texto: 'Después marca en cada vehículo si este dueño también es su dueño.', campos: camposDueno, boton: 'Agregar',
      alAceptar: (x) => api(`/admin/cuentas/${e.cuenta.id}/duenos`, { metodo: 'POST', cuerpo: x }),
    });
    if (r) {
      aviso('Dueño agregado. Ahora indica cuáles vehículos son suyos.');
      await recargar();
    }
  };
  $('e-vehiculo').onclick = () => registrarVehiculo(e, recargar).catch((err) => aviso(mensajeDe(err), 'error'));

  cada('[data-editar-persona]', async (b) => {
    const p = personaDe(b.dataset.editarPersona);
    const r = await dialogo({
      titulo: `Corregir datos de ${p.nombre}`,
      campos: [{ nombre: 'nombre', etiqueta: 'Nombre completo', valor: p.nombre }, { nombre: 'email', etiqueta: 'Correo', tipo: 'correo', valor: p.email }],
      alAceptar: (x) => api(`/admin/usuarios/${p.id}`, { metodo: 'PATCH', cuerpo: x }),
    });
    if (r) await recargar();
  });
  cada('[data-clave]', async (b) => {
    const p = personaDe(b.dataset.clave);
    const r = await dialogo({
      titulo: `Nueva contraseña para ${p.nombre}`,
      texto: 'Se cierran sus sesiones abiertas y entra de nuevo con esta contraseña.',
      campos: [{ nombre: 'clave', etiqueta: `Contraseña nueva (mínimo ${p.rol === 'dueno' ? 8 : 6} caracteres)`, tipo: 'clave' }],
      alAceptar: (x) => api(`/admin/usuarios/${p.id}`, { metodo: 'PATCH', cuerpo: x }),
    });
    if (r) aviso('Contraseña cambiada. Entrégasela a la persona.');
  });
  cada('[data-activo]', async (b) => {
    const p = personaDe(b.dataset.activo);
    if (p.activo && !(await confirmar(`Desactivar a ${p.nombre}`, 'Ya no podrá entrar. Sus datos se conservan y se puede activar de nuevo.', 'Desactivar', true))) return;
    await api(`/admin/usuarios/${p.id}`, { metodo: 'PATCH', cuerpo: { activo: !p.activo } });
    await recargar();
  });

  cada('[data-editar]', async (b) => {
    const v = vehiculoDe(b.dataset.editar);
    const tracto = v.tipo === 'tracto';
    const r = await dialogo({
      titulo: `Corregir ${v.placa}`,
      texto: 'Cambia solo lo que esté mal. Los mantenimientos ya registrados no se tocan.',
      campos: [
        { nombre: 'placa', etiqueta: tracto ? 'Placa del cabezal' : 'Placa', valor: v.placa, mono: true },
        { nombre: 'anio', etiqueta: 'Año', tipo: 'numero', valor: v.anio ?? '', opcional: true },
        { nombre: 'motor', etiqueta: 'Motor', valor: v.motor ?? '', ejemplo: 'Ej: Cummins ISX 500', opcional: true },
        ...(v.compartimentos.length ? [{ nombre: 'compartimentos', etiqueta: 'Galones de cada compartimento, de adelante hacia atrás', valor: v.compartimentos.join(', '), mono: true }] : []),
      ],
      alAceptar: async (x) => {
        const comps = listaGalones(x.compartimentos);
        const cambioComps = v.compartimentos.length && comps.join() !== v.compartimentos.join();
        if (v.compartimentos.length && !comps.length) throw new Error('Escribe los galones de cada compartimento separados por coma');
        const propios = { anio: entero(x.anio) ?? null };
        if (x.placa.toUpperCase().replace(/[\s-]/g, '') !== String(v.placa).replace('-', '')) propios.placa = x.placa;
        if ((x.motor || '') !== (v.motor || '')) propios.motor = x.motor;
        if (cambioComps && !tracto) propios.compartimentos = comps;
        await api(`/admin/unidades/${v.id}`, { metodo: 'PATCH', cuerpo: propios });
        // En un cabezal, los compartimentos son de su tanquero
        if (tracto && v.tanquero && cambioComps) await api(`/admin/unidades/${v.tanquero.id}`, { metodo: 'PATCH', cuerpo: { compartimentos: comps } });
      },
    });
    if (r) {
      aviso('Vehículo corregido');
      await recargar();
    }
  });
  cada('[data-duenos]', async (b) => {
    const v = vehiculoDe(b.dataset.duenos);
    const r = await dialogo({
      titulo: `Dueños de ${v.placa}`,
      texto: 'Marca a todos los dueños de este vehículo. Quien no esté marcado no lo ve ni recibe sus reportes.',
      campos: [{ nombre: 'duenos', etiqueta: 'Dueños de la empresa', tipo: 'casillas', opciones: e.duenos.filter((d) => d.activo).map((d) => [d.id, d.nombre]), valor: v.duenos.map((d) => d.id) }],
      alAceptar: (x) => api(`/admin/unidades/${v.id}/propietarios`, { metodo: 'PUT', cuerpo: x }),
    });
    if (r) await recargar();
  });
  cada('[data-km]', async (b) => {
    const v = vehiculoDe(b.dataset.km);
    const r = await dialogo({
      titulo: `Kilometraje de ${v.placa}`,
      texto: v.km === null ? 'Normalmente lo pone el dueño. Úsalo solo si te lo pidió.' : `Ahora marca ${miles(v.km)} km. La corrección queda guardada con su motivo.`,
      campos: [{ nombre: 'km', etiqueta: 'Kilometraje actual', tipo: 'numero', valor: v.km ?? '', mono: true }, { nombre: 'motivo', etiqueta: 'Motivo', ejemplo: 'Ej: lo pidió el dueño por teléfono' }],
      alAceptar: (x) => api(`/admin/unidades/${v.id}/km`, { metodo: 'POST', cuerpo: { km: entero(x.km), motivo: x.motivo } }),
    });
    if (r) await recargar();
  });
  cada('[data-baja]', async (b) => {
    const v = vehiculoDe(b.dataset.baja);
    if (v.activa && !(await confirmar(`Dar de baja ${v.placa}`, 'El chofer deja de verlo en la app. Su historial de mantenimientos y reportes se conserva, y se puede reactivar.', 'Dar de baja', true))) return;
    await api(`/admin/unidades/${v.id}`, { metodo: 'PATCH', cuerpo: { activa: !v.activa } });
    if (v.tanquero) await api(`/admin/unidades/${v.tanquero.id}`, { metodo: 'PATCH', cuerpo: { activa: !v.activa } });
    await recargar();
  });
}

async function registrarVehiculo(e, recargar) {
  // Primero el modelo: de él salen los compartimentos sugeridos y si lleva tanquero aparte
  const paso = await dialogo({
    titulo: 'Registrar vehículo', texto: 'Elige el modelo. El sistema arma solo sus ejes, llantas, frenos y compartimentos.', boton: 'Continuar',
    campos: [{ nombre: 'modeloId', etiqueta: 'Modelo', tipo: 'lista', opciones: MODELOS.map((m) => [m.id, `${nombreModelo(m)} — ${m.descripcion}`]) }],
  });
  if (!paso) return;
  const m = modeloPorId(paso.modeloId);
  const tracto = m.tipo === 'tracto';
  const r = await dialogo({
    titulo: `${nombreModelo(m)}`,
    texto: tracto ? 'Cabezal con su tanquero. Lo que no sepas todavía puede quedar pendiente.' : 'Camión con el tanque sobre el mismo chasis.',
    campos: [
      { nombre: 'placa', etiqueta: tracto ? 'Placa del cabezal' : 'Placa', ejemplo: 'ABC-1234', mono: true },
      { nombre: 'anio', etiqueta: 'Año', tipo: 'numero', valor: m.anio },
      { nombre: 'motor', etiqueta: 'Motor', ejemplo: 'Ej: Cummins ISX 500', opcional: true },
      { nombre: 'kmInicial', etiqueta: 'Kilometraje actual', tipo: 'numero', opcional: true, ayuda: 'Vacío = pendiente; lo pone el dueño.' },
      { nombre: 'compartimentos', etiqueta: 'Galones de cada compartimento, de adelante hacia atrás', valor: m.compartimentos.join(', '), mono: true },
      { nombre: 'duenos', etiqueta: 'Dueños de este vehículo', tipo: 'casillas', opciones: e.duenos.filter((d) => d.activo).map((d) => [d.id, d.nombre]), valor: e.duenos.length === 1 ? [e.duenos[0].id] : [] },
    ],
    boton: 'Registrar',
    alAceptar: (x) => {
      if (!x.duenos.length) throw new Error('Marca al menos un dueño: si no, nadie verá este vehículo');
      return api(`/admin/cuentas/${e.cuenta.id}/vehiculos`, {
        metodo: 'POST',
        cuerpo: {
          modeloId: m.id, placa: x.placa, anio: entero(x.anio), motor: x.motor || undefined, kmInicial: entero(x.kmInicial),
          compartimentos: listaGalones(x.compartimentos), duenos: x.duenos,
        },
      });
    },
  });
  if (r) {
    aviso('Vehículo registrado con sus ejes, llantas, frenos y tanque');
    await recargar();
  }
}

// ---------------------------------------------------------------- modelos de la flota
function pintarModelos() {
  $('mo-lista').innerHTML = MODELOS.map((m) => {
    const cfg = { modeloId: m.id };
    const ejes = ejesDe(cfg);
    return `<article class="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
      <div><p class="text-xl font-black text-white">${esc(nombreModelo(m))} <span class="text-sm text-slate-400 font-bold">${esc(m.anio)}</span></p>
        <p class="text-sm text-slate-400">${m.tipo === 'tracto' ? 'Cabezal con tanquero (remolque con placa propia)' : 'Camión con el tanque sobre el mismo chasis'}</p></div>
      ${barraTanque(m.compartimentos)}
      <p class="text-sm text-slate-300"><span class="font-bold text-slate-400">Ejes:</span> ${esc(ejes.map((x) => x.id).join(' · '))}</p>
      <p class="text-sm text-slate-300"><span class="font-bold text-slate-400">Llantas:</span> ${esc(ejes.reduce((s, x) => s + (x.delantero ? 2 : 4), 0))} · <span class="font-bold text-slate-400">Capacidad:</span> ${esc(miles(galones(m.compartimentos)))} gal</p>
      <details class="text-sm text-slate-300"><summary class="cursor-pointer font-bold text-cyan-400 py-1">Partes que registra el chofer (${esc(partesDe(cfg).length)})</summary>
        <p class="mt-1 text-slate-400">${esc(partesDe(cfg).map((p) => p.id).join(' · '))}</p></details>
    </article>`;
  }).join('');
}

// ---------------------------------------------------------------- inicio del panel
try {
  const usuario = await sesionPanel('admin');
  pintarCuenta(usuario, 10);
  const ir = iniciarMenu({ empresas: pintarEmpresas, modelos: pintarModelos });
  ir('empresas');
} catch (err) {
  aviso(mensajeDe(err), 'error');
}
