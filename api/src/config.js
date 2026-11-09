// Configuración desde variables de entorno (ver .env.example)
const requerida = (k, def) => {
  const v = process.env[k] ?? def;
  if (v === undefined) throw new Error(`Falta la variable de entorno ${k}`);
  return v;
};

export function leerConfig(entorno = process.env) {
  const prod = entorno.NODE_ENV === 'production';
  return {
    prod,
    puerto: Number(entorno.PORT || 3000),
    baseDatos: entorno.DATABASE_URL || '',
    // Orígenes permitidos para el frontend (separados por coma)
    origenes: (entorno.CORS_ORIGENES || 'http://localhost:8790,https://app.camiones-wang.workers.dev').split(',').map((s) => s.trim()),
    // Clave de 32 bytes en base64 para cifrar cédulas; en desarrollo se usa una fija
    claveCedula: prod ? requerida('CEDULA_CLAVE') : entorno.CEDULA_CLAVE || Buffer.alloc(32, 7).toString('base64'),
    pimienta: prod ? requerida('PIMIENTA') : entorno.PIMIENTA || 'desarrollo',
    correo: {
      host: entorno.SMTP_HOST || '',
      puerto: Number(entorno.SMTP_PUERTO || 587),
      usuario: entorno.SMTP_USUARIO || '',
      clave: entorno.SMTP_CLAVE || '',
      remitente: entorno.CORREO_REMITENTE || 'Mi Trailer <no-responder@camiones-wang.ec>',
    },
    carpetaArchivos: entorno.CARPETA_ARCHIVOS || './archivos',
  };
}
