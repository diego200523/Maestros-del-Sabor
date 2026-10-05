require('dotenv').config()
const path = require('path')
const http = require('http')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')

const authRoutes = require('./routes/auth')
const productRoutes = require('./routes/products')
const orderRoutes = require('./routes/orders')
const userRoutes = require('./routes/users')
const chatRoutes = require('./routes/chat')

const { initSocket } = require('./socket')

const app = express()

// Necesario para que express-rate-limit identifique bien la IP real del
// visitante (útil si en el futuro esto corre detrás de un proxy/hosting)
app.set('trust proxy', 1)

// ── Seguridad general ────────────────────────────────────────────────
// Cabeceras HTTP seguras. crossOriginResourcePolicy en false para que el
// frontend (en otro puerto) pueda cargar las imágenes servidas desde /uploads.
app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
app.use(express.json({ limit: '1mb' })) // evita payloads JSON gigantes

// ── Límites de peticiones (evitan fuerza bruta, spam y abuso) ───────
// Login y registro: intentos moderados, es tráfico normal de una tienda
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos y vuelve a intentar.' },
})

// Recuperar/restablecer contraseña: mucho más estricto, es la puerta
// más sensible para intentar tomar el control de una cuenta ajena
const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de recuperación. Intenta de nuevo en una hora.' },
})

// Chat: evita que alguien inunde una conversación con miles de mensajes
const chatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Estás enviando mensajes demasiado rápido. Espera un momento.' },
})

app.use('/api/auth/login', authLimiter)
app.use('/api/auth/register', authLimiter)
app.use('/api/auth/forgot-password', passwordLimiter)
app.use('/api/auth/reset-password', passwordLimiter)
app.use('/api/chat', chatLimiter)

// ── Archivos subidos (imágenes de productos) ────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

// Ruta de prueba
app.get('/api/health', (req, res) => res.json({ ok: true, mensaje: 'Servidor de Maestros del Sabor funcionando' }))

app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/users', userRoutes)
app.use('/api/chat', chatRoutes)

// Manejo centralizado de errores (por ejemplo, errores de multer al subir imágenes)
app.use((err, req, res, next) => {
  if (err) {
    console.error(err)
    return res.status(400).json({ error: err.message || 'Ocurrió un error al procesar la solicitud.' })
  }
  next()
})

const server = http.createServer(app)
initSocket(server)

const PORT = process.env.PORT || 4000
server.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`)
})
