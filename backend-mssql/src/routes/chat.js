const express = require('express')
const { sql, poolPromise } = require('../db')
const { requireAuth, requireAdmin } = require('../middleware/auth')
const { notificarAdmins, notificarUsuario } = require('../socket')
const { esTextoValido } = require('../utils/validators')

const router = express.Router()

// ── GET /api/chat/mine ────────────────────────────────────────────────
// Cliente: trae toda su conversación con el administrador
router.get('/mine', requireAuth, async (req, res) => {
  const pool = await poolPromise
  const result = await pool.request()
    .input('idUsuario', sql.Int, req.user.id)
    .query('SELECT * FROM mensajes_chat WHERE id_usuario = @idUsuario ORDER BY creado_en ASC')

  // Marca como leídos los mensajes del admin que el cliente ya está viendo
  await pool.request()
    .input('idUsuario', sql.Int, req.user.id)
    .query("UPDATE mensajes_chat SET leido = 1 WHERE id_usuario = @idUsuario AND remitente = 'admin'")

  res.json(result.recordset)
})

// ── POST /api/chat/mine ───────────────────────────────────────────────
// Cliente: envía un mensaje nuevo al administrador
router.post('/mine', requireAuth, async (req, res) => {
  try {
    const mensaje = req.body.mensaje
    if (!esTextoValido(mensaje, { min: 1, max: 2000 })) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío ni superar los 2000 caracteres.' })
    }

    const pool = await poolPromise
    const result = await pool.request()
      .input('idUsuario', sql.Int, req.user.id)
      .input('mensaje', sql.VarChar, mensaje.trim())
      .query(`
        INSERT INTO mensajes_chat (id_usuario, remitente, mensaje)
        OUTPUT INSERTED.*
        VALUES (@idUsuario, 'cliente', @mensaje)
      `)

    const nuevoMensaje = result.recordset[0]

    // Avisa en tiempo real a los administradores conectados
    notificarAdmins('nuevo_mensaje', {
      id_usuario: req.user.id,
      nombre: req.user.nombre,
      mensaje: nuevoMensaje,
    })

    res.status(201).json(nuevoMensaje)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al enviar el mensaje.' })
  }
})

// ── GET /api/chat ──────────────────────────────────────────────────────
// Solo admin: lista de conversaciones (un cliente por fila, con su último mensaje)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const pool = await poolPromise
  const result = await pool.request().query(`
    SELECT
      u.id AS id_usuario,
      u.nombre,
      u.correo,
      (SELECT TOP 1 mensaje FROM mensajes_chat m WHERE m.id_usuario = u.id ORDER BY m.creado_en DESC) AS ultimo_mensaje,
      (SELECT TOP 1 creado_en FROM mensajes_chat m WHERE m.id_usuario = u.id ORDER BY m.creado_en DESC) AS ultima_fecha,
      (SELECT COUNT(*) FROM mensajes_chat m WHERE m.id_usuario = u.id AND m.remitente = 'cliente' AND m.leido = 0) AS no_leidos
    FROM usuarios u
    WHERE u.rol = 'cliente' AND EXISTS (SELECT 1 FROM mensajes_chat m WHERE m.id_usuario = u.id)
    ORDER BY ultima_fecha DESC
  `)
  res.json(result.recordset)
})

// ── GET /api/chat/:idUsuario ─────────────────────────────────────────────
// Solo admin: ve el hilo completo con un cliente específico
router.get('/:idUsuario', requireAuth, requireAdmin, async (req, res) => {
  const pool = await poolPromise
  const result = await pool.request()
    .input('idUsuario', sql.Int, req.params.idUsuario)
    .query('SELECT * FROM mensajes_chat WHERE id_usuario = @idUsuario ORDER BY creado_en ASC')

  // Marca como leídos los mensajes del cliente que el admin ya está viendo
  await pool.request()
    .input('idUsuario', sql.Int, req.params.idUsuario)
    .query("UPDATE mensajes_chat SET leido = 1 WHERE id_usuario = @idUsuario AND remitente = 'cliente'")

  res.json(result.recordset)
})

// ── POST /api/chat/:idUsuario ────────────────────────────────────────────
// Solo admin: responde a un cliente específico
router.post('/:idUsuario', requireAuth, requireAdmin, async (req, res) => {
  try {
    const mensaje = req.body.mensaje
    if (!esTextoValido(mensaje, { min: 1, max: 2000 })) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío ni superar los 2000 caracteres.' })
    }

    const idUsuario = Number(req.params.idUsuario)
    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(400).json({ error: 'Cliente inválido.' })
    }

    const pool = await poolPromise
    const result = await pool.request()
      .input('idUsuario', sql.Int, idUsuario)
      .input('mensaje', sql.VarChar, mensaje.trim())
      .query(`
        INSERT INTO mensajes_chat (id_usuario, remitente, mensaje)
        OUTPUT INSERTED.*
        VALUES (@idUsuario, 'admin', @mensaje)
      `)

    const nuevoMensaje = result.recordset[0]

    // Avisa en tiempo real al cliente que recibió una respuesta
    notificarUsuario(idUsuario, 'nuevo_mensaje', { mensaje: nuevoMensaje })

    res.status(201).json(nuevoMensaje)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al enviar el mensaje.' })
  }
})

module.exports = router
