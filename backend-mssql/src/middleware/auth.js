const jwt = require('jsonwebtoken')
const { sql, poolPromise } = require('../db')

// Verifica que la petición traiga un token válido (usuario logueado).
// Además de comprobar la firma del JWT, valida que la "versión de sesión"
// del token coincida con la que tiene el usuario en la base de datos —
// esto permite invalidar sesiones activas (por ejemplo, todas las demás
// quedan sin efecto en cuanto alguien restablece su contraseña).
async function requireAuth(req, res, next) {
  const header = req.headers.authorization // formato esperado: "Bearer <token>"
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado. Inicia sesión.' })
  }
  const token = header.split(' ')[1]
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)

    const pool = await poolPromise
    const result = await pool.request()
      .input('id', sql.Int, payload.id)
      .query('SELECT token_version, rol FROM usuarios WHERE id = @id')

    if (result.recordset.length === 0) {
      return res.status(401).json({ error: 'Tu cuenta ya no existe. Vuelve a iniciar sesión.' })
    }

    const usuarioActual = result.recordset[0]

    // Si la contraseña se restableció después de emitirse este token, lo rechazamos
    if (payload.tv !== undefined && usuarioActual.token_version !== payload.tv) {
      return res.status(401).json({ error: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.' })
    }

    // Siempre usamos el rol actual de la base de datos, no el que traía el token,
    // por si el rol del usuario cambió después de que se emitió el token.
    req.user = { ...payload, rol: usuarioActual.rol }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' })
  }
}

// Verifica que además el usuario tenga rol de administrador
function requireAdmin(req, res, next) {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ error: 'No tienes permisos de administrador.' })
  }
  next()
}

module.exports = { requireAuth, requireAdmin }
