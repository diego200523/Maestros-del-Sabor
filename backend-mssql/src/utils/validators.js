// Validaciones básicas reutilizadas en varias rutas del backend.
// El objetivo es rechazar datos claramente inválidos ANTES de tocar la base de datos.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function esCorreoValido(correo) {
  return typeof correo === 'string' && correo.length <= 150 && EMAIL_REGEX.test(correo.trim())
}

function esContrasenaValida(contrasena) {
  // Mínimo 8 caracteres. Se puede endurecer más adelante (mayúsculas, números, etc.)
  return typeof contrasena === 'string' && contrasena.length >= 8 && contrasena.length <= 100
}

function esTextoValido(valor, { min = 1, max = 255 } = {}) {
  return typeof valor === 'string' && valor.trim().length >= min && valor.trim().length <= max
}

function esNumeroPositivo(valor, { permitirCero = true } = {}) {
  const n = Number(valor)
  if (!Number.isFinite(n)) return false
  return permitirCero ? n >= 0 : n > 0
}

function esEnteroPositivo(valor, { permitirCero = true } = {}) {
  const n = Number(valor)
  if (!Number.isInteger(n)) return false
  return permitirCero ? n >= 0 : n > 0
}

function limpiar(valor) {
  return typeof valor === 'string' ? valor.trim() : valor
}

module.exports = {
  esCorreoValido,
  esContrasenaValida,
  esTextoValido,
  esNumeroPositivo,
  esEnteroPositivo,
  limpiar,
}
