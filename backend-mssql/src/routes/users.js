const express = require('express')
const { poolPromise } = require('../db')
const { requireAuth, requireAdmin } = require('../middleware/auth')

const router = express.Router()

// ── GET /api/users ────────────────────────────────────────────────────
// Solo admin: lista de todos los clientes registrados
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const pool = await poolPromise
  const result = await pool.request().query(`
    SELECT id, nombre, correo, telefono, direccion, rol, creado_en
    FROM usuarios ORDER BY creado_en DESC
  `)
  res.json(result.recordset)
})

// ── GET /api/users/audit ──────────────────────────────────────────────
// Solo admin: últimas 200 acciones registradas (logins, cambios de producto,
// pedidos, restablecimientos de contraseña, etc.)
router.get('/audit', requireAuth, requireAdmin, async (req, res) => {
  const pool = await poolPromise
  const result = await pool.request().query(`
    SELECT TOP 200 id, id_usuario, correo, accion, detalle, ip, creado_en
    FROM audit_log ORDER BY creado_en DESC
  `)
  res.json(result.recordset)
})

module.exports = router
