// Envío de los códigos de acceso. Sin SMTP configurado, el código se muestra en la consola (desarrollo).
import nodemailer from 'nodemailer';

export function crearCorreo(cfg, { registro = console } = {}) {
  const transporte = cfg.host
    ? nodemailer.createTransport({ host: cfg.host, port: cfg.puerto, secure: cfg.puerto === 465, auth: { user: cfg.usuario, pass: cfg.clave } })
    : null;
  return {
    async enviarCodigo(email, codigo) {
      const texto = `Tu código para entrar a Mi Trailer es: ${codigo}\n\nVence en 10 minutos. Si no lo pediste, ignora este mensaje.`;
      if (!transporte) {
        registro.info(`[correo de desarrollo] Código para ${email}: ${codigo}`);
        return;
      }
      await transporte.sendMail({ from: cfg.remitente, to: email, subject: `Tu código de acceso: ${codigo}`, text: texto });
    },
  };
}
