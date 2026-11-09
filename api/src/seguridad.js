// Códigos de acceso, sesiones y cifrado de la cédula.
import crypto from 'node:crypto';

export const sha256 = (texto) => crypto.createHash('sha256').update(texto).digest('hex');

export function crearSeguridad({ claveCedula, pimienta }) {
  const clave = Buffer.from(claveCedula, 'base64');
  if (clave.length !== 32) throw new Error('CEDULA_CLAVE debe ser de 32 bytes en base64');
  const hmac = (texto) => crypto.createHmac('sha256', pimienta).update(texto).digest('hex');

  return {
    // Código de 6 dígitos para entrar por email (solo se guarda su huella)
    nuevoCodigo: () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'),
    hashCodigo: (email, codigo) => hmac(`codigo:${email}:${codigo}`),
    // Token de sesión (el teléfono lo guarda; en la base solo su huella)
    nuevoToken: () => crypto.randomBytes(32).toString('base64url'),
    hashToken: (token) => hmac(`sesion:${token}`),
    // Cédula: cifrada con AES-256-GCM; el HMAC permite detectar repetidas sin descifrar
    cifrarCedula(cedula) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', clave, iv);
      const datos = Buffer.concat([c.update(cedula, 'utf8'), c.final()]);
      return [iv, c.getAuthTag(), datos].map((b) => b.toString('base64')).join('.');
    },
    descifrarCedula(texto) {
      const [iv, tag, datos] = texto.split('.').map((s) => Buffer.from(s, 'base64'));
      const d = crypto.createDecipheriv('aes-256-gcm', clave, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(datos), d.final()]).toString('utf8');
    },
    hashCedula: (cedula) => hmac(`cedula:${cedula}`),
  };
}

export const mascaraCedula = (c) => (c ? `${c.slice(0, 2)}******${c.slice(-2)}` : null);
