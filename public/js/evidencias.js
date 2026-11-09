// Evidencias (fotos y PDF de facturas) guardadas en el teléfono con IndexedDB, con fecha y hora de subida.
// Las fotos se reducen a 1600 px para no llenar la memoria. Se usa desde index.html como window.Evidencias.
const BD = 'mi-trailer-evidencias';
const ALMACEN = 'archivos';

function abrir() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function operar(modo, fn) {
  const db = await abrir();
  return new Promise((res, rej) => {
    const tx = db.transaction(ALMACEN, modo);
    const req = fn(tx.objectStore(ALMACEN));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}

async function reducirImagen(file) {
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * escala);
    c.height = Math.round(bmp.height * escala);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

const urls = new Map();

export const Evidencias = {
  // Guarda el archivo y devuelve sus datos (sin el contenido) para registrarlos en el mantenimiento.
  async guardar(file, categoria) {
    const esImagen = file.type.startsWith('image/');
    const blob = esImagen ? await reducirImagen(file) : file;
    const meta = {
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      nombre: file.name,
      tipo: blob.type || file.type || 'application/octet-stream',
      categoria,
      subidoEn: new Date().toISOString(),
      tamano: blob.size,
    };
    await operar('readwrite', (st) => st.put({ ...meta, blob }));
    return meta;
  },
  async url(id) {
    if (urls.has(id)) return urls.get(id);
    const reg = await operar('readonly', (st) => st.get(id));
    if (!reg) return null;
    const u = URL.createObjectURL(reg.blob);
    urls.set(id, u);
    return u;
  },
  fechaHora(iso) {
    return new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  },
};

window.Evidencias = Evidencias;
