require('dotenv').config()
const sql = require('mssql')

const useWindowsAuth = (process.env.DB_AUTH || '').toLowerCase() === 'windows'
// En tu SQL Server local, DB_ENCRYPT no hace falta (queda en false).
// En un servicio en la nube como Azure SQL, hay que ponerlo en true —
// ajusta esto vía variable de entorno al momento de publicar, sin tocar código.
const useEncrypt = (process.env.DB_ENCRYPT || 'false').toLowerCase() === 'true'

const config = {
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME,
  options: {
    encrypt: useEncrypt,
    trustServerCertificate: !useEncrypt, // true para conexiones locales; false en la nube (certificado real)
    trustedConnection: useWindowsAuth, // usa la sesión de Windows en vez de usuario/contraseña
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
}

// Si NO usas Windows Authentication, agrega usuario y contraseña de SQL Server
if (!useWindowsAuth) {
  config.user = process.env.DB_USER
  config.password = process.env.DB_PASSWORD
}

// Pool de conexiones compartido por toda la app (se conecta una sola vez)
const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('✅ Conectado a SQL Server')
    return pool
  })
  .catch(err => {
    console.error('❌ Error al conectar a SQL Server:', err.message)
    throw err
  })

module.exports = { sql, poolPromise }
