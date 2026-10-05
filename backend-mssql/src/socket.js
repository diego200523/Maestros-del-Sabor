const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const { sql, poolPromise } = require('./db')

let io = null

// Se llama una sola vez desde server.js, pasándole el servidor HTTP
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL || '*' },
  })

  // Verifica el token JWT (y que la sesión siga vigente) antes de aceptar la conexión
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) return next(new Error('No autorizado'))

      const payload = jwt.verify(token, process.env.JWT_SECRET)

      const pool = await poolPromise
      const result = await pool.request()
        .input('id', sql.Int, payload.id)
        .query('SELECT token_version, rol FROM usuarios WHERE id = @id')

      if (result.recordset.length === 0) return next(new Error('Cuenta no encontrada'))

      const usuarioActual = result.recordset[0]
      if (payload.tv !== undefined && usuarioActual.token_version !== payload.tv) {
        return next(new Error('Sesión inválida'))
      }

      socket.user = { ...payload, rol: usuarioActual.rol }
      next()
    } catch (err) {
      next(new Error('Token inválido'))
    }
  })

  io.on('connection', socket => {
    // Cada cliente se une a su propia "sala" (para recibir solo sus mensajes)
    socket.join(`usuario_${socket.user.id}`)
    // Los administradores además se unen a una sala compartida
    if (socket.user.rol === 'admin') socket.join('admins')
  })

  return io
}

// Notifica a los administradores conectados que hay un mensaje nuevo de un cliente
function notificarAdmins(evento, data) {
  io?.to('admins').emit(evento, data)
}

// Notifica a un cliente específico que el admin le respondió (o hubo un cambio en su pedido)
function notificarUsuario(idUsuario, evento, data) {
  io?.to(`usuario_${idUsuario}`).emit(evento, data)
}

module.exports = { initSocket, notificarAdmins, notificarUsuario }
