require('dotenv').config()
const nodemailer = require('nodemailer')

// Solo se activa si configuraste EMAIL_USER y EMAIL_PASS en tu .env
const emailConfigurado = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS)

let transporter = null
if (emailConfigurado) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Contraseña de aplicación de Gmail (NO tu contraseña normal)
    },
  })
}

// Envía el correo de recuperación de contraseña.
// Si el correo NO está configurado, no hace nada (el backend sigue funcionando,
// solo que no se envía ningún email real).
async function enviarCorreoRecuperacion(destinatario, nombre, resetLink) {
  if (!transporter) {
    console.log('⚠️  Envío de correo no configurado. Link de recuperación (solo para pruebas):')
    console.log('   ' + resetLink)
    return { enviado: false }
  }

  await transporter.sendMail({
    from: `"Maestros del Sabor" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: 'Recupera tu contraseña — Maestros del Sabor',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background:#FFF8F0; border-radius: 16px;">
        <h2 style="color:#4A1030;">Hola${nombre ? ', ' + nombre : ''} 👋</h2>
        <p style="color:#4A1030; font-size: 15px;">
          Recibimos una solicitud para restablecer tu contraseña en <strong>Maestros del Sabor</strong>.
        </p>
        <p style="color:#4A1030; font-size: 15px;">
          Haz clic en el siguiente botón para crear una contraseña nueva. Este enlace es válido por <strong>1 hora</strong>.
        </p>
        <div style="text-align:center; margin: 28px 0;">
          <a href="${resetLink}" style="background: linear-gradient(135deg, #F04E37, #F5A623); color: white; padding: 14px 28px; border-radius: 16px; text-decoration:none; font-weight:bold; display:inline-block;">
            Restablecer contraseña
          </a>
        </div>
        <p style="color:#4A1030; font-size: 13px; opacity:0.7;">
          Si tú no solicitaste esto, puedes ignorar este correo — tu contraseña seguirá siendo la misma.
        </p>
      </div>
    `,
  })

  return { enviado: true }
}

module.exports = { enviarCorreoRecuperacion, emailConfigurado }
