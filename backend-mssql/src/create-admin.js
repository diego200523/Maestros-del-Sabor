// Este script convierte a un usuario YA REGISTRADO en administrador.
// Úsalo así desde la terminal (dentro de la carpeta backend):
//   npm run create-admin -- correo@ejemplo.com
//
// Primero regístrate normalmente desde la página web con ese correo,
// y luego corre este script para volverte admin.

require('dotenv').config()
const { sql, poolPromise } = require('./db')

async function main() {
  const correo = process.argv[2]
  if (!correo) {
    console.log('❌ Debes indicar el correo. Ejemplo: npm run create-admin -- correo@ejemplo.com')
    process.exit(1)
  }

  const pool = await poolPromise
  const result = await pool.request()
    .input('correo', sql.VarChar, correo)
    .query("UPDATE usuarios SET rol = 'admin' WHERE correo = @correo")

  if (result.rowsAffected[0] === 0) {
    console.log(`❌ No se encontró ningún usuario registrado con el correo: ${correo}`)
    console.log('   Regístrate primero desde la página web con ese correo y vuelve a intentar.')
  } else {
    console.log(`✅ El usuario ${correo} ahora es administrador.`)
  }
  process.exit(0)
}

main()
