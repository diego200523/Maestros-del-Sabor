const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

// Carpeta donde se guardan las imágenes subidas (fuera de src, junto al proyecto)
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'products')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// Usamos memoria (no disco) para poder revisar el CONTENIDO real del archivo
// antes de guardarlo — así no basta con renombrar un archivo malicioso a ".jpg"
// para que el sistema lo acepte como imagen.
const storage = multer.memoryStorage()

function fileFilter(req, file, cb) {
  if (!TIPOS_PERMITIDOS.includes(file.mimetype)) {
    return cb(new Error('Solo se permiten imágenes JPG, PNG, WEBP o GIF.'))
  }
  cb(null, true)
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB máximo por imagen
})

// Revisa los primeros bytes del archivo ("firma" o "magic number") para
// confirmar que de verdad es una imagen del tipo que dice ser, sin importar
// el nombre o la extensión que traiga.
function detectarExtensionReal(buffer) {
  if (!buffer || buffer.length < 12) return null

  const bytes = buffer.subarray(0, 12)

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return '.jpg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return '.png'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return '.gif'
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return '.webp'

  return null
}

// Valida el contenido real del archivo y lo guarda en disco con un nombre
// aleatorio. Lanza un error si el contenido no coincide con ninguna imagen
// conocida (por ejemplo, si alguien intentó subir un .exe renombrado a .jpg).
function guardarImagenValidada(file) {
  const extensionReal = detectarExtensionReal(file.buffer)
  if (!extensionReal) {
    throw new Error('El archivo no es una imagen válida.')
  }

  const nombreUnico = crypto.randomBytes(16).toString('hex')
  const nombreArchivo = `${nombreUnico}${extensionReal}`
  fs.writeFileSync(path.join(UPLOAD_DIR, nombreArchivo), file.buffer)

  return `/uploads/products/${nombreArchivo}`
}

// Borra un archivo de imagen anterior cuando se reemplaza o el producto se elimina.
// Solo borra archivos que vivan dentro de nuestra carpeta de uploads (ignora URLs externas).
function borrarImagenAnterior(imagenUrl) {
  if (!imagenUrl || !imagenUrl.startsWith('/uploads/products/')) return
  const rutaCompleta = path.join(__dirname, '..', '..', imagenUrl)
  fs.unlink(rutaCompleta, () => { /* si no existe o falla, lo ignoramos */ })
}

module.exports = { upload, guardarImagenValidada, borrarImagenAnterior, UPLOAD_DIR }
