const { sql, poolPromise } = require('./db')

// Registra una acción en el log de auditoría. Nunca debe romper el flujo
// principal de la petición: si falla el registro, solo se avisa en consola.
async function registrarAuditoria({ idUsuario = null, correo = null, accion, detalle = null, ip = null }) {
  try {
    const pool = await poolPromise
    await pool.request()
      .input('idUsuario', sql.Int, idUsuario)
      .input('correo', sql.VarChar, correo)
      .input('accion', sql.VarChar, accion)
      .input('detalle', sql.VarChar, detalle)
      .input('ip', sql.VarChar, ip)
      .query(`
        INSERT INTO audit_log (id_usuario, correo, accion, detalle, ip)
        VALUES (@idUsuario, @correo, @accion, @detalle, @ip)
      `)
  } catch (err) {
    console.error('No se pudo registrar en auditoría:', err.message)
  }
}

module.exports = { registrarAuditoria }
