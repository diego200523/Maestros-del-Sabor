const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { sql, poolPromise } = require('../db')
const { requireAuth } = require('../middleware/auth')
const { esCorreoValido, esContrasenaValida, esTextoValido, limpiar } = require('../utils/validators')
const { registrarAuditoria } = require('../audit')

const router = express.Router()

function firmarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, correo: usuario.correo, rol: usuario.rol, nombre: usuario.nombre, tv: usuario.token_version ?? 1 },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
}

// ── POST /api/auth/register ──────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const nombre = limpiar(req.body.nombre)
    const correo = limpiar(req.body.correo)?.toLowerCase()
    const contrasena = req.body.contrasena
    const telefono = limpiar(req.body.telefono)
    const direccion = limpiar(req.body.direccion)

    if (!esTextoValido(nombre, { min: 2, max: 150 })) {
      return res.status(400).json({ error: 'Ingresa un nombre válido (entre 2 y 150 caracteres).' })
    }
    if (!esCorreoValido(correo)) {
      return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' })
    }
    if (!esContrasenaValida(contrasena)) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' })
    }
    if (telefono && !esTextoValido(telefono, { min: 6, max: 30 })) {
      return res.status(400).json({ error: 'El teléfono no es válido.' })
    }
    if (direccion && !esTextoValido(direccion, { min: 5, max: 255 })) {
      return res.status(400).json({ error: 'La dirección no es válida.' })
    }

    const pool = await poolPromise

    const existentes = await pool.request()
      .input('correo', sql.VarChar, correo)
      .query('SELECT id FROM usuarios WHERE correo = @correo')

    if (existentes.recordset.length > 0) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' })
    }

    const hash = await bcrypt.hash(contrasena, 10)

    const result = await pool.request()
      .input('nombre', sql.VarChar, nombre)
      .input('correo', sql.VarChar, correo)
      .input('contrasena', sql.VarChar, hash)
      .input('telefono', sql.VarChar, telefono || null)
      .input('direccion', sql.VarChar, direccion || null)
      .query(`
        INSERT INTO usuarios (nombre, correo, contrasena, telefono, direccion, rol)
        OUTPUT INSERTED.id
        VALUES (@nombre, @correo, @contrasena, @telefono, @direccion, 'cliente')
      `)

    const nuevoId = result.recordset[0].id
    const token = firmarToken({ id: nuevoId, correo, rol: 'cliente', nombre, token_version: 1 })

    registrarAuditoria({ idUsuario: nuevoId, correo, accion: 'registro', ip: req.ip })

    res.status(201).json({
      token,
      user: { id: nuevoId, nombre, correo, telefono, direccion, rol: 'cliente' },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al registrar el usuario.' })
  }
})

// ── POST /api/auth/login ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const correo = limpiar(req.body.correo)?.toLowerCase()
    const contrasena = req.body.contrasena

    if (!correo || !contrasena) {
      return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' })
    }

    const pool = await poolPromise
    const result = await pool.request()
      .input('correo', sql.VarChar, correo)
      .query('SELECT * FROM usuarios WHERE correo = @correo')

    // Mismo mensaje de error tanto si el correo no existe como si la contraseña
    // es incorrecta — así no revelamos si un correo está registrado o no.
    if (result.recordset.length === 0) {
      registrarAuditoria({ correo, accion: 'login_fallido', detalle: 'correo no encontrado', ip: req.ip })
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' })
    }

    const usuario = result.recordset[0]
    const coincide = await bcrypt.compare(contrasena, usuario.contrasena)
    if (!coincide) {
      registrarAuditoria({ idUsuario: usuario.id, correo, accion: 'login_fallido', detalle: 'contraseña incorrecta', ip: req.ip })
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' })
    }

    const token = firmarToken(usuario)
    registrarAuditoria({ idUsuario: usuario.id, correo, accion: 'login_exitoso', ip: req.ip })

    res.json({
      token,
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        telefono: usuario.telefono,
        direccion: usuario.direccion,
        rol: usuario.rol,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al iniciar sesión.' })
  }
})

// ── GET /api/auth/me ──────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const pool = await poolPromise
  const result = await pool.request()
    .input('id', sql.Int, req.user.id)
    .query('SELECT id, nombre, correo, telefono, direccion, rol FROM usuarios WHERE id = @id')

  if (result.recordset.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' })
  res.json(result.recordset[0])
})

// ── PUT /api/auth/me ──────────────────────────────────────────────────
router.put('/me', requireAuth, async (req, res) => {
  try {
    const nombre = limpiar(req.body.nombre)
    const telefono = limpiar(req.body.telefono)
    const direccion = limpiar(req.body.direccion)

    if (!esTextoValido(nombre, { min: 2, max: 150 })) {
      return res.status(400).json({ error: 'Ingresa un nombre válido.' })
    }
    if (telefono && !esTextoValido(telefono, { min: 6, max: 30 })) {
      return res.status(400).json({ error: 'El teléfono no es válido.' })
    }
    if (direccion && !esTextoValido(direccion, { min: 5, max: 255 })) {
      return res.status(400).json({ error: 'La dirección no es válida.' })
    }

    const pool = await poolPromise
    await pool.request()
      .input('nombre', sql.VarChar, nombre)
      .input('telefono', sql.VarChar, telefono || null)
      .input('direccion', sql.VarChar, direccion || null)
      .input('id', sql.Int, req.user.id)
      .query('UPDATE usuarios SET nombre = @nombre, telefono = @telefono, direccion = @direccion WHERE id = @id')

    res.json({ mensaje: 'Datos actualizados correctamente.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al actualizar los datos.' })
  }
})

// ── POST /api/auth/forgot-password ─────────────────────────────────────
// Genera un token de recuperación válido por 1 hora.
// NOTA: este proyecto todavía no tiene un servicio de correo configurado,
// así que por ahora el "link" de recuperación se devuelve directo en la
// respuesta (solo para pruebas).
router.post('/forgot-password', async (req, res) => {
  try {
    const correo = limpiar(req.body.correo)?.toLowerCase()
    if (!esCorreoValido(correo)) return res.status(400).json({ error: 'Ingresa un correo válido.' })

    const pool = await poolPromise
    const result = await pool.request()
      .input('correo', sql.VarChar, correo)
      .query('SELECT id FROM usuarios WHERE correo = @correo')

    // Por seguridad, respondemos igual exista o no el correo (no revelamos si está registrado)
    if (result.recordset.length === 0) {
      return res.json({ mensaje: 'Si el correo existe, se enviará un enlace de recuperación.' })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expira = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    await pool.request()
      .input('correo', sql.VarChar, correo)
      .input('token', sql.VarChar, token)
      .input('expira', sql.DateTime, expira)
      .query('UPDATE usuarios SET reset_token = @token, reset_token_expira = @expira WHERE correo = @correo')

    registrarAuditoria({ idUsuario: result.recordset[0].id, correo, accion: 'solicito_reset_password', ip: req.ip })

    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:8443'}/?reset_token=${token}`

    res.json({
      mensaje: 'Si el correo existe, se enviará un enlace de recuperación.',
      resetLink, // TEMPORAL: quitar este campo cuando se conecte el envío de correos real
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al procesar la solicitud.' })
  }
})

// ── POST /api/auth/reset-password ──────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token } = req.body
    const nuevaContrasena = req.body.nueva_contrasena

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Faltan datos para restablecer la contraseña.' })
    }
    if (!esContrasenaValida(nuevaContrasena)) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' })
    }

    const pool = await poolPromise
    const result = await pool.request()
      .input('token', sql.VarChar, token)
      .query('SELECT id, correo, reset_token_expira FROM usuarios WHERE reset_token = @token')

    if (result.recordset.length === 0) {
      return res.status(400).json({ error: 'El enlace de recuperación no es válido.' })
    }

    const usuario = result.recordset[0]
    if (!usuario.reset_token_expira || new Date(usuario.reset_token_expira) < new Date()) {
      return res.status(400).json({ error: 'El enlace de recuperación expiró. Solicita uno nuevo.' })
    }

    const hash = await bcrypt.hash(nuevaContrasena, 10)

    // Al restablecer la contraseña, también subimos "token_version": esto invalida
    // automáticamente cualquier sesión que haya quedado abierta en otro dispositivo
    // con la contraseña anterior (por ejemplo, si alguien más tenía acceso a la cuenta).
    await pool.request()
      .input('id', sql.Int, usuario.id)
      .input('hash', sql.VarChar, hash)
      .query(`
        UPDATE usuarios
        SET contrasena = @hash, reset_token = NULL, reset_token_expira = NULL,
            token_version = token_version + 1
        WHERE id = @id
      `)

    registrarAuditoria({ idUsuario: usuario.id, correo: usuario.correo, accion: 'reset_password_exitoso', ip: req.ip })

    res.json({ mensaje: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al restablecer la contraseña.' })
  }
})

module.exports = router
