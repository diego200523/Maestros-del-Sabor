import { useState, useEffect } from 'react'
import logo from '@/imports/logo_maestros_transparente.png'
import AdminPanel from './AdminPanel'
import { apiFetch, getToken, setToken, clearToken, resolveImageUrl } from "./api";
import { connectSocket, disconnectSocket } from './socket'

type Screen = 'login' | 'register' | 'forgot' | 'reset' | 'home' | 'products' | 'orders' | 'account' | 'contact'
type Role = 'cliente' | 'admin'

interface Product {
  id: number
  name: string
  price: number
  category: 'embutidos' | 'otros'
  stock: boolean
  img: string
  desc: string
}

interface CartItem {
  id: number
  name: string
  price: number
  qty: number
}

interface OrderItem extends CartItem {
  currentStock: number
}

interface Order {
  id: string
  rawId: number
  date: string
  status: 'pendiente' | 'en proceso' | 'entregado' | 'cancelado'
  items: OrderItem[]
  total: number
}

// Convierte un producto tal como lo devuelve el backend al formato que usa la interfaz
function mapProduct(p: any): Product {
  return {
    id: p.id,
    name: p.nombre,
    price: Number(p.precio),
    category: p.categoria,
    stock: p.stock > 0,
    img: p.imagen_url,
    desc: p.descripcion,
  }
}

// Convierte un pedido del backend al formato que usa la interfaz
function mapOrder(o: any): Order {
  return {
    id: `#MDS-${String(o.id).padStart(4, '0')}`,
    rawId: o.id,
    date: new Date(o.creado_en).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }),
    status: o.estado,
    items: (o.items || []).map((it: any) => ({
      id: it.id_producto, name: it.nombre, price: Number(it.precio_unitario), qty: it.cantidad,
      currentStock: it.stock_actual ?? 0,
    })),
    total: Number(o.total),
  }
}

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-400' },
  'en proceso': { label: 'En proceso', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400' },
  entregado: { label: 'Entregado', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  cancelado: { label: 'Cancelado', bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-400' },
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('login')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [role, setRole] = useState<Role>('cliente')
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [myOrders, setMyOrders] = useState<Order[]>([])
  const [categoryFilter, setCategoryFilter] = useState<'todos' | 'embutidos' | 'otros'>('todos')
  const [productSearch, setProductSearch] = useState('')
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [showCart, setShowCart] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', phone: '', address: '' })
  const [accountForm, setAccountForm] = useState({ name: '', email: '', phone: '', address: '' })
  const [chatMessages, setChatMessages] = useState<{ id: number; remitente: 'cliente' | 'admin'; mensaje: string; fecha: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [accountSaved, setAccountSaved] = useState(false)
  const [addedToast, setAddedToast] = useState('')
  const [authError, setAuthError] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotDevLink, setForgotDevLink] = useState('') // TEMPORAL: mientras no hay envío de correo real
  const [resetToken, setResetToken] = useState('')
  const [resetForm, setResetForm] = useState({ password: '', confirm: '' })
  const [resetDone, setResetDone] = useState(false)

  const nav = (s: Screen) => {
    setScreen(s)
    setMobileMenuOpen(false)
  }

  // Trae el catálogo desde el backend
  const loadProducts = async () => {
    try {
      const data = await apiFetch('/products')
      setProducts(data.map(mapProduct))
    } catch (err) {
      console.error(err)
    }
  }

  // Trae los pedidos del cliente logueado
  const loadMyOrders = async () => {
    try {
      const data = await apiFetch('/orders/mine')
      setMyOrders(data.map(mapOrder))
    } catch (err) {
      console.error(err)
    }
  }

  // Al abrir la página: si hay un token guardado, intenta restaurar la sesión
  useEffect(() => {
    const token = getToken()
    if (!token) { setCheckingSession(false); return }

    apiFetch('/auth/me')
      .then(user => {
        setRole(user.rol)
        setIsLoggedIn(true)
        setAccountForm({ name: user.nombre, email: user.correo, phone: user.telefono || '', address: user.direccion || '' })
        setScreen('home')
        loadProducts()
        if (user.rol === 'cliente') loadMyOrders()
      })
      .catch(() => clearToken())
      .finally(() => setCheckingSession(false))
  }, [])

  const handleForgotPassword = async () => {
    setAuthError('')
    try {
      const data = await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ correo: forgotEmail }),
      })
      setForgotSent(true)
      // TEMPORAL: como todavía no hay envío de correo real, el link se muestra aquí mismo.
      setForgotDevLink(data.resetLink || '')
    } catch (err: any) {
      setAuthError(err.message)
    }
  }

  const handleResetPassword = async () => {
    setAuthError('')
    if (resetForm.password.length < 6) {
      setAuthError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (resetForm.password !== resetForm.confirm) {
      setAuthError('Las contraseñas no coinciden.')
      return
    }
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, nueva_contrasena: resetForm.password }),
      })
      setResetDone(true)
    } catch (err: any) {
      setAuthError(err.message)
    }
  }

  const handleLogin = async () => {
    setAuthError('')
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ correo: loginForm.email, contrasena: loginForm.password }),
      })
      setToken(data.token)
      setRole(data.user.rol)
      setAccountForm({ name: data.user.nombre, email: data.user.correo, phone: data.user.telefono || '', address: data.user.direccion || '' })
      setIsLoggedIn(true)
      await loadProducts()
      if (data.user.rol === 'admin') {
        setShowAdminPanel(true)
      } else {
        await loadMyOrders()
      }
      setScreen('home')
    } catch (err: any) {
      setAuthError(err.message)
    }
  }

  const handleRegister = async () => {
    setAuthError('')
    try {
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          nombre: registerForm.name,
          correo: registerForm.email,
          contrasena: registerForm.password,
          telefono: registerForm.phone,
          direccion: registerForm.address,
        }),
      })
      setToken(data.token)
      setRole('cliente')
      setAccountForm({ name: data.user.nombre, email: data.user.correo, phone: data.user.telefono || '', address: data.user.direccion || '' })
      setIsLoggedIn(true)
      await loadProducts()
      await loadMyOrders()
      setScreen('home')
    } catch (err: any) {
      setAuthError(err.message)
    }
  }

  const handleLogout = () => {
    clearToken()
    disconnectSocket()
    setIsLoggedIn(false)
    setShowAdminPanel(false)
    setRole('cliente')
    setScreen('login')
    setCart([])
    setProducts([])
    setMyOrders([])
  }

  const saveAccount = async () => {
    try {
      await apiFetch('/auth/me', {
        method: 'PUT',
        body: JSON.stringify({ nombre: accountForm.name, telefono: accountForm.phone, direccion: accountForm.address }),
      })
      setAccountSaved(true)
      setTimeout(() => setAccountSaved(false), 3000)
    } catch (err: any) {
      alert(err.message)
    }
  }

  // Envía el carrito como un pedido nuevo al backend
  const confirmOrder = async () => {
    if (!accountForm.address) {
      alert('Antes de confirmar, agrega tu dirección de entrega en "Mi cuenta".')
      nav('account')
      return
    }
    try {
      await apiFetch('/orders', {
        method: 'POST',
        body: JSON.stringify({
          direccion_entrega: accountForm.address,
          items: cart.map(i => ({ id_producto: i.id, cantidad: i.qty, precio_unitario: i.price })),
        }),
      })
      setCart([])
      setShowCart(false)
      await loadProducts() // el stock cambió
      await loadMyOrders()
      nav('orders')
    } catch (err: any) {
      alert(err.message)
    }
  }

  const cancelOrder = async (order: Order) => {
    if (!confirm(`¿Cancelar el pedido ${order.id}? Se devolverá el stock de los productos.`)) return
    try {
      await apiFetch(`/orders/${order.rawId}/cancel`, { method: 'PATCH' })
      await loadMyOrders()
      await loadProducts()
    } catch (err: any) {
      alert(err.message)
    }
  }

  // Vuelve a agregar al carrito los mismos productos de un pedido anterior,
  // respetando el stock disponible ahora mismo (puede haber cambiado desde entonces).
  const reorder = (order: Order) => {
    let algunoSinStock = false
    let algunoAjustado = false

    setCart(prev => {
      let next = [...prev]
      for (const item of order.items) {
        const enCatalogo = products.find(p => p.id === item.id)
        if (!enCatalogo || item.currentStock <= 0) {
          algunoSinStock = true
          continue
        }
        const yaEnCarrito = next.find(c => c.id === item.id)
        const cantidadActual = yaEnCarrito ? yaEnCarrito.qty : 0
        const cantidadDeseada = cantidadActual + item.qty
        const cantidadFinal = Math.min(cantidadDeseada, item.currentStock)
        if (cantidadFinal < cantidadDeseada) algunoAjustado = true

        if (yaEnCarrito) {
          next = next.map(c => c.id === item.id ? { ...c, qty: cantidadFinal, price: enCatalogo.price } : c)
        } else {
          next.push({ id: item.id, name: enCatalogo.name, price: enCatalogo.price, qty: cantidadFinal })
        }
      }
      return next
    })

    if (algunoSinStock) {
      setAddedToast('Algunos productos ya no están disponibles')
    } else if (algunoAjustado) {
      setAddedToast('Agregado (ajustado según el stock disponible)')
    } else {
      setAddedToast('Productos agregados al carrito')
    }
    setTimeout(() => setAddedToast(''), 3000)
    nav('products')
  }

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { id: product.id, name: product.name, price: product.price, qty: 1 }]
    })
    setAddedToast(`${product.name} agregado`)
    setTimeout(() => setAddedToast(''), 2500)
  }

  // Convierte un mensaje del backend al formato de la interfaz
  const mapChatMessage = (m: any) => ({
    id: m.id,
    remitente: m.remitente as 'cliente' | 'admin',
    mensaje: m.mensaje,
    fecha: new Date(m.creado_en).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
  })

  // Trae la conversación del cliente con el administrador
  const loadChat = async () => {
    try {
      const data = await apiFetch('/chat/mine')
      setChatMessages(data.map(mapChatMessage))
    } catch (err) {
      console.error(err)
    }
  }

  // Envía un mensaje nuevo en el chat
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return
    setChatLoading(true)
    try {
      await apiFetch('/chat/mine', { method: 'POST', body: JSON.stringify({ mensaje: chatInput }) })
      setChatInput('')
      await loadChat()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setChatLoading(false)
    }
  }

  // Chat en tiempo real: mientras el cliente está en "Contáctanos", escucha el
  // socket para recibir respuestas del admin al instante. Se mantiene además un
  // polling lento (20s) como respaldo, por si la conexión del socket se cae.
  useEffect(() => {
    if (screen !== 'contact' || !isLoggedIn || role !== 'cliente') return
    loadChat()

    const socket = connectSocket()
    const onNuevoMensaje = () => loadChat()
    socket.on('nuevo_mensaje', onNuevoMensaje)

    const interval = setInterval(loadChat, 20000)
    return () => {
      socket.off('nuevo_mensaje', onNuevoMensaje)
      clearInterval(interval)
    }
  }, [screen, isLoggedIn, role])

  const removeFromCart = (id: number) => setCart(prev => prev.filter(i => i.id !== id))
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)

  const filtered = products.filter(p =>
    (categoryFilter === 'todos' || p.category === categoryFilter) &&
    (productSearch.trim() === '' ||
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.desc || '').toLowerCase().includes(productSearch.toLowerCase()))
  )

  const NavBar = () => (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-md">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <button onClick={() => nav('home')} className="flex-shrink-0 py-1">
          <img
            src={logo}
            alt="Maestros del Sabor"
            className="h-12 w-auto object-contain"
          />
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {([['home', 'Inicio'], ['products', 'Productos'], ['orders', 'Gestionar pedidos'], ['account', 'Mi cuenta'], ['contact', 'Contáctanos']] as [Screen, string][]).map(([s, label]) => (
            <button
              key={s}
              onClick={() => nav(s)}
              className={`px-3 py-2 rounded-xl text-sm font-700 transition-all duration-150 ${screen === s ? 'bg-[#4A1030] text-white' : 'text-[#4A1030] hover:bg-[#4A103010]'}`}
              style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700 }}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Admin panel button */}
          {role === 'admin' && (
            <button
              onClick={() => setShowAdminPanel(true)}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-800 text-white transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #F04E37, #F5A623)' }}
            >
              ⚙️ Panel Admin
            </button>
          )}
          {/* Cart button */}
          <button
            onClick={() => setShowCart(!showCart)}
            className="relative p-2 rounded-xl bg-[#FFF0E8] hover:bg-[#FFE0CC] transition-colors"
          >
            <svg className="w-6 h-6 text-[#F04E37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#F04E37] text-white text-xs font-800 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="hidden md:block px-3 py-2 rounded-xl text-sm font-700 text-[#4A1030] hover:bg-red-50 transition-colors"
            style={{ fontWeight: 700 }}
          >
            Salir
          </button>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl hover:bg-[#4A103010] text-[#4A1030]"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-[#4A103015] px-4 py-3 flex flex-col gap-1">
          {([['home', 'Inicio'], ['products', 'Productos'], ['orders', 'Gestionar pedidos'], ['account', 'Mi cuenta'], ['contact', 'Contáctanos']] as [Screen, string][]).map(([s, label]) => (
            <button
              key={s}
              onClick={() => nav(s)}
              className={`px-4 py-3 rounded-xl text-left text-sm font-700 transition-colors ${screen === s ? 'bg-[#4A1030] text-white' : 'text-[#4A1030] hover:bg-[#4A103010]'}`}
              style={{ fontWeight: 700 }}
            >
              {label}
            </button>
          ))}
          <button onClick={handleLogout} className="px-4 py-3 rounded-xl text-left text-sm font-700 text-red-600 hover:bg-red-50">
            Cerrar sesión
          </button>
        </div>
      )}
    </header>
  )

  // CART DRAWER
  const CartDrawer = () => (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowCart(false)} />
      <div className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white z-50 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[#4A103015]">
          <h2 style={{ fontFamily: 'Fredoka One, cursive', color: '#4A1030', fontSize: '1.4rem' }}>Mi Pedido</h2>
          <button onClick={() => setShowCart(false)} className="p-2 rounded-xl hover:bg-gray-100">
            <svg className="w-5 h-5 text-[#4A1030]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
              <div className="text-6xl mb-4">🛒</div>
              <p className="text-[#4A1030] font-700 text-lg">Tu pedido está vacío</p>
              <p className="text-[#4A103080] text-sm mt-1">Agrega productos desde el catálogo</p>
            </div>
          ) : cart.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-[#FFF8F0] rounded-2xl p-3">
              <div className="flex-1">
                <p className="font-700 text-[#4A1030] text-sm">{item.name}</p>
                <p className="text-[#F04E37] font-800 text-sm">${item.price} c/u</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-800 text-[#4A1030] w-8 text-center">x{item.qty}</span>
                <button onClick={() => removeFromCart(item.id)} className="p-1 rounded-lg hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
        {cart.length > 0 && (
          <div className="p-4 border-t border-[#4A103015]">
            <div className="flex justify-between items-center mb-4">
              <span className="font-700 text-[#4A1030]">Total</span>
              <span style={{ fontFamily: 'Fredoka One, cursive', color: '#F04E37', fontSize: '1.5rem' }}>${cartTotal}</span>
            </div>
            <button
              onClick={confirmOrder}
              className="w-full py-4 rounded-2xl font-800 text-white text-lg transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #F04E37, #F5A623)', fontWeight: 800 }}
            >
              Confirmar pedido
            </button>
          </div>
        )}
      </div>
    </>
  )

  // ─── VERIFICANDO SESIÓN GUARDADA ───────────────────────────────────────────
  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFF8F0' }}>
        <img src={logo} alt="Maestros del Sabor" className="w-40 object-contain animate-pulse" />
      </div>
    )
  }

  // ─── PANEL DE ADMINISTRADOR ─────────────────────────────────────────────────
  if (isLoggedIn && role === 'admin' && showAdminPanel) {
    return <AdminPanel onExitAdmin={() => setShowAdminPanel(false)} />
  }

  // ─── LOGIN ───────────────────────────────────────────────────────────────────
  if (screen === 'login') return (
    <div className="min-h-screen relative flex flex-col items-center justify-center p-4 py-10 overflow-hidden">
      {/* Background food image — charcuterie artesanal */}
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1700486338138-5cc21dae205a?w=1400&h=900&fit=crop&auto=format')" }}
      />
      {/* Dark overlay for legibility */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, rgba(20,4,12,0.62) 0%, rgba(15,3,8,0.80) 40%, rgba(10,2,5,0.92) 100%)' }}
      />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md flex flex-col items-center">

        {/* Logo transparente — flotando directo sobre el fondo, sin caja */}
        <img
          src={logo}
          alt="Maestros del Sabor"
          className="w-72 md:w-80 object-contain"
          style={{
            filter:
              'drop-shadow(1px 0 0 rgba(0,0,0,0.9)) drop-shadow(-1px 0 0 rgba(0,0,0,0.9)) drop-shadow(0 1px 0 rgba(0,0,0,0.9)) drop-shadow(0 -1px 0 rgba(0,0,0,0.9)) drop-shadow(0 4px 16px rgba(240,78,55,0.5))',
          }}
        />

        <p className="text-white/80 font-700 mt-3 mb-8 tracking-wide text-base">
          Bienvenido de vuelta
        </p>

        {/* Form — card below the logo */}
        <div
          className="w-full rounded-3xl p-8 space-y-5"
          style={{ background: 'rgba(255,248,240,0.07)', backdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,0.13)' }}
        >
          <div>
            <label className="block text-sm font-700 text-white/80 mb-2">Correo electrónico</label>
            <input
              type="email"
              value={loginForm.email}
              onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
              placeholder="tu@correo.com"
              className="w-full px-4 py-3.5 rounded-2xl text-white font-600 placeholder:text-white/40 focus:outline-none transition-colors text-base"
              style={{ background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)' }}
            />
          </div>
          <div>
            <label className="block text-sm font-700 text-white/80 mb-2">Contraseña</label>
            <input
              type="password"
              value={loginForm.password}
              onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
              placeholder="••••••••"
              className="w-full px-4 py-3.5 rounded-2xl text-white font-600 placeholder:text-white/40 focus:outline-none transition-colors text-base"
              style={{ background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)' }}
            />
          </div>

          <div className="text-right">
            <button onClick={() => { setAuthError(''); setForgotSent(false); setForgotEmail(loginForm.email); setScreen('forgot') }} className="text-sm font-700 text-[#F5A623] hover:underline">¿Olvidaste tu contraseña?</button>
          </div>

          {authError && (
            <div className="px-4 py-3 rounded-2xl text-sm font-700 text-red-100" style={{ background: 'rgba(220,38,38,0.35)', border: '1px solid rgba(220,38,38,0.5)' }}>
              {authError}
            </div>
          )}

          <button
            onClick={handleLogin}
            className="w-full py-4 rounded-2xl font-800 text-white text-lg transition-all active:scale-95 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #F04E37 0%, #F5A623 100%)', fontWeight: 800 }}
          >
            Iniciar sesión
          </button>

          <p className="text-center text-sm text-white/70 font-600">
            ¿No tienes cuenta?{' '}
            <button onClick={() => setScreen('register')} className="text-[#F5A623] font-800 hover:underline">
              Regístrate
            </button>
          </p>
        </div>
      </div>
    </div>
  )

  // ─── FORGOT PASSWORD ────────────────────────────────────────────────────────
  if (screen === 'forgot') return (
    <div className="min-h-screen relative flex flex-col items-center justify-center p-4 py-10 overflow-hidden">
      <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1700486338138-5cc21dae205a?w=1400&h=900&fit=crop&auto=format')" }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(20,4,12,0.62) 0%, rgba(15,3,8,0.80) 40%, rgba(10,2,5,0.92) 100%)' }} />

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        <img src={logo} alt="Maestros del Sabor" className="w-72 md:w-80 object-contain"
          style={{ filter: 'drop-shadow(1px 0 0 rgba(0,0,0,0.9)) drop-shadow(-1px 0 0 rgba(0,0,0,0.9)) drop-shadow(0 1px 0 rgba(0,0,0,0.9)) drop-shadow(0 -1px 0 rgba(0,0,0,0.9)) drop-shadow(0 4px 16px rgba(240,78,55,0.5))' }} />
        <p className="text-white/80 font-700 mt-3 mb-8 tracking-wide text-base">Recupera tu contraseña</p>

        <div className="w-full rounded-3xl p-8 space-y-5" style={{ background: 'rgba(255,248,240,0.07)', backdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,0.13)' }}>
          {!forgotSent ? (
            <>
              <p className="text-sm text-white/70 font-600">Escribe el correo con el que te registraste y te enviaremos un enlace para restablecer tu contraseña.</p>
              <div>
                <label className="block text-sm font-700 text-white/80 mb-2">Correo electrónico</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="w-full px-4 py-3.5 rounded-2xl text-white font-600 placeholder:text-white/40 focus:outline-none transition-colors text-base"
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)' }}
                />
              </div>

              {authError && (
                <div className="px-4 py-3 rounded-2xl text-sm font-700 text-red-100" style={{ background: 'rgba(220,38,38,0.35)', border: '1px solid rgba(220,38,38,0.5)' }}>
                  {authError}
                </div>
              )}

              <button onClick={handleForgotPassword} className="w-full py-4 rounded-2xl font-800 text-white text-lg transition-all active:scale-95 shadow-lg"
                style={{ background: 'linear-gradient(135deg, #F04E37 0%, #F5A623 100%)', fontWeight: 800 }}>
                Enviar enlace de recuperación
              </button>
            </>
          ) : (
            <>
              <div className="px-4 py-3 rounded-2xl text-sm font-700 text-green-100" style={{ background: 'rgba(34,197,94,0.25)', border: '1px solid rgba(34,197,94,0.4)' }}>
                Si el correo está registrado, se envió un enlace de recuperación.
              </div>

              {/* TEMPORAL: como todavía no hay un servicio de correo real conectado,
                  mostramos aquí mismo el enlace para poder probar el flujo completo. */}
              {forgotDevLink && (
                <div className="px-4 py-3 rounded-2xl text-sm text-white/80 font-600 space-y-2" style={{ background: 'rgba(255,255,255,0.08)', border: '1px dashed rgba(255,255,255,0.25)' }}>
                  <p className="text-xs text-white/50 uppercase tracking-wide font-800">Modo de prueba (sin correo conectado)</p>
                  <button
                    onClick={() => {
                      const url = new URL(forgotDevLink)
                      const token = url.searchParams.get('reset_token') || ''
                      setResetToken(token)
                      setResetDone(false)
                      setAuthError('')
                      setScreen('reset')
                    }}
                    className="text-[#F5A623] font-800 underline break-all text-left"
                  >
                    Ir a restablecer mi contraseña →
                  </button>
                </div>
              )}
            </>
          )}

          <p className="text-center text-sm text-white/70 font-600">
            <button onClick={() => setScreen('login')} className="text-[#F5A623] font-800 hover:underline">← Volver a iniciar sesión</button>
          </p>
        </div>
      </div>
    </div>
  )

  // ─── RESET PASSWORD ─────────────────────────────────────────────────────────
  if (screen === 'reset') return (
    <div className="min-h-screen relative flex flex-col items-center justify-center p-4 py-10 overflow-hidden">
      <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1700486338138-5cc21dae205a?w=1400&h=900&fit=crop&auto=format')" }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(20,4,12,0.62) 0%, rgba(15,3,8,0.80) 40%, rgba(10,2,5,0.92) 100%)' }} />

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        <img src={logo} alt="Maestros del Sabor" className="w-72 md:w-80 object-contain"
          style={{ filter: 'drop-shadow(1px 0 0 rgba(0,0,0,0.9)) drop-shadow(-1px 0 0 rgba(0,0,0,0.9)) drop-shadow(0 1px 0 rgba(0,0,0,0.9)) drop-shadow(0 -1px 0 rgba(0,0,0,0.9)) drop-shadow(0 4px 16px rgba(240,78,55,0.5))' }} />
        <p className="text-white/80 font-700 mt-3 mb-8 tracking-wide text-base">Nueva contraseña</p>

        <div className="w-full rounded-3xl p-8 space-y-5" style={{ background: 'rgba(255,248,240,0.07)', backdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,0.13)' }}>
          {!resetDone ? (
            <>
              <div>
                <label className="block text-sm font-700 text-white/80 mb-2">Nueva contraseña</label>
                <input
                  type="password"
                  value={resetForm.password}
                  onChange={e => setResetForm({ ...resetForm, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-4 py-3.5 rounded-2xl text-white font-600 placeholder:text-white/40 focus:outline-none transition-colors text-base"
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-700 text-white/80 mb-2">Confirmar contraseña</label>
                <input
                  type="password"
                  value={resetForm.confirm}
                  onChange={e => setResetForm({ ...resetForm, confirm: e.target.value })}
                  placeholder="Repite la contraseña"
                  className="w-full px-4 py-3.5 rounded-2xl text-white font-600 placeholder:text-white/40 focus:outline-none transition-colors text-base"
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)' }}
                />
              </div>

              {authError && (
                <div className="px-4 py-3 rounded-2xl text-sm font-700 text-red-100" style={{ background: 'rgba(220,38,38,0.35)', border: '1px solid rgba(220,38,38,0.5)' }}>
                  {authError}
                </div>
              )}

              <button onClick={handleResetPassword} className="w-full py-4 rounded-2xl font-800 text-white text-lg transition-all active:scale-95 shadow-lg"
                style={{ background: 'linear-gradient(135deg, #F04E37 0%, #F5A623 100%)', fontWeight: 800 }}>
                Guardar nueva contraseña
              </button>
            </>
          ) : (
            <>
              <div className="px-4 py-3 rounded-2xl text-sm font-700 text-green-100" style={{ background: 'rgba(34,197,94,0.25)', border: '1px solid rgba(34,197,94,0.4)' }}>
                ✓ Contraseña actualizada correctamente.
              </div>
              <button onClick={() => { setScreen('login'); setResetForm({ password: '', confirm: '' }) }} className="w-full py-4 rounded-2xl font-800 text-white text-lg transition-all active:scale-95 shadow-lg"
                style={{ background: 'linear-gradient(135deg, #F04E37 0%, #F5A623 100%)', fontWeight: 800 }}>
                Ir a iniciar sesión
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )

  // ─── REGISTER ────────────────────────────────────────────────────────────────
  if (screen === 'register') return (
    <div className="min-h-screen flex items-center justify-center p-4 py-10" style={{ background: 'linear-gradient(160deg, #FFF8F0 0%, #FFE8D6 100%)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logo} alt="Maestros del Sabor" className="h-24 w-auto mx-auto object-contain" />
          <p className="text-[#4A1030] font-600 mt-2 opacity-70">Crea tu cuenta y empieza a pedir</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-8 space-y-5">
          {[
            { key: 'name', label: 'Nombre completo', type: 'text', placeholder: 'María González' },
            { key: 'email', label: 'Correo electrónico', type: 'email', placeholder: 'tu@correo.com' },
            { key: 'password', label: 'Contraseña', type: 'password', placeholder: '••••••••' },
            { key: 'phone', label: 'Teléfono', type: 'tel', placeholder: '55 1234 5678' },
            { key: 'address', label: 'Dirección de entrega', type: 'text', placeholder: 'Calle, número, colonia, ciudad' },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-700 text-[#4A1030] mb-2">{label}</label>
              <input
                type={type}
                value={registerForm[key as keyof typeof registerForm]}
                onChange={e => setRegisterForm({ ...registerForm, [key]: e.target.value })}
                placeholder={placeholder}
                className="w-full px-4 py-3.5 rounded-2xl border-2 border-[#4A103020] bg-[#FFF8F0] text-[#4A1030] font-600 placeholder:text-[#4A103040] focus:outline-none focus:border-[#F5A623] transition-colors text-base"
              />
            </div>
          ))}

          {authError && (
            <div className="px-4 py-3 rounded-2xl text-sm font-700 bg-red-50 text-red-600">
              {authError}
            </div>
          )}

          <button
            onClick={handleRegister}
            className="w-full py-4 rounded-2xl font-800 text-white text-lg transition-all active:scale-95 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #F04E37 0%, #F5A623 100%)', fontWeight: 800 }}
          >
            Crear cuenta
          </button>

          <p className="text-center text-sm text-[#4A1030] font-600">
            ¿Ya tienes cuenta?{' '}
            <button onClick={() => setScreen('login')} className="text-[#F04E37] font-800 hover:underline">
              Inicia sesión
            </button>
          </p>
        </div>
      </div>
    </div>
  )

  // ─── AUTHENTICATED SCREENS ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#FFF8F0' }}>
      <NavBar />
      {showCart && <CartDrawer />}

      {/* Toast */}
      {addedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl text-white font-700 shadow-xl flex items-center gap-2 animate-bounce"
          style={{ background: 'linear-gradient(135deg, #4A1030, #6B1A48)' }}>
          <span>✓</span> {addedToast}
        </div>
      )}

      <main className="pt-16">

        {/* ── HOME ── */}
        {screen === 'home' && (
          <div>
            {/* Hero */}
            <section className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #4A1030 0%, #7A1840 50%, #F04E37 100%)' }}>
              <div className="max-w-6xl mx-auto px-4 py-16 md:py-24 flex flex-col md:flex-row items-center gap-10">
                <div className="flex-1 text-center md:text-left">
                  <img
                    src={logo}
                    alt="Maestros del Sabor"
                    className="w-64 md:w-80 object-contain mx-auto md:mx-0"
                    style={{
                      filter:
                        'drop-shadow(1px 0 0 rgba(0,0,0,0.85)) drop-shadow(-1px 0 0 rgba(0,0,0,0.85)) drop-shadow(0 1px 0 rgba(0,0,0,0.85)) drop-shadow(0 -1px 0 rgba(0,0,0,0.85)) drop-shadow(0 3px 6px rgba(0,0,0,0.4))',
                    }}
                  />
                  <p className="text-white/80 text-lg md:text-xl font-600 mt-4 max-w-md">
                    Embutidos marinados artesanales elaborados con pasión y los mejores ingredientes.
                  </p>
                  <button
                    onClick={() => nav('products')}
                    className="mt-6 px-8 py-4 rounded-2xl font-800 text-[#4A1030] text-lg shadow-lg transition-all active:scale-95 hover:shadow-xl"
                    style={{ background: 'linear-gradient(135deg, #FFE600, #F5A623)', fontWeight: 800 }}
                  >
                    Ver catálogo
                  </button>
                </div>
                <div className="flex-1 hidden md:block">
                  <img
                    src="https://images.unsplash.com/photo-1758972573607-509448e9f3e4?w=600&h=400&fit=crop&auto=format"
                    alt="Selección de embutidos y charcutería"
                    className="w-full rounded-3xl shadow-2xl object-cover h-72"
                  />
                </div>
              </div>
              {/* wave */}
              <svg viewBox="0 0 1440 60" className="absolute bottom-0 left-0 right-0 w-full" preserveAspectRatio="none">
                <path d="M0,60 C360,0 1080,60 1440,20 L1440,60 Z" fill="#FFF8F0" />
              </svg>
            </section>

            {/* Quick access */}
            <section className="max-w-6xl mx-auto px-4 py-14">
              <h2 className="text-center font-800 text-2xl md:text-3xl text-[#4A1030] mb-10"
                style={{ fontFamily: 'Fredoka One, cursive' }}>
                ¿Qué deseas hacer hoy?
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { screen: 'products' as Screen, icon: '🥩', label: 'Productos', color: '#F04E37', bg: '#FFF0EE' },
                  { screen: 'orders' as Screen, icon: '📦', label: 'Mis pedidos', color: '#4A1030', bg: '#F5EEFF' },
                  { screen: 'account' as Screen, icon: '👤', label: 'Mi cuenta', color: '#F5A623', bg: '#FFF8E0' },
                  { screen: 'contact' as Screen, icon: '💬', label: 'Contáctanos', color: '#4A1030', bg: '#E8F5EE' },
                ].map(({ screen: s, icon, label, color, bg }) => (
                  <button
                    key={s}
                    onClick={() => nav(s)}
                    className="flex flex-col items-center gap-3 p-6 rounded-3xl transition-all active:scale-95 hover:-translate-y-1 shadow-md hover:shadow-xl"
                    style={{ background: bg }}
                  >
                    <span className="text-4xl">{icon}</span>
                    <span className="font-800 text-base" style={{ color, fontWeight: 800 }}>{label}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Featured products */}
            <section className="max-w-6xl mx-auto px-4 pb-16">
              <h2 className="font-800 text-2xl md:text-3xl text-[#4A1030] mb-6"
                style={{ fontFamily: 'Fredoka One, cursive' }}>
                Productos destacados
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                {products.filter(p => p.stock).slice(0, 3).map(p => (
                  <div key={p.id} className="bg-white rounded-3xl shadow-md overflow-hidden hover:shadow-xl transition-shadow">
                    <img src={resolveImageUrl(p.img)} alt={p.name} className="w-full h-44 object-cover" />
                    <div className="p-4">
                      <h3 className="font-800 text-[#4A1030] text-base">{p.name}</h3>
                      <p className="text-[#4A1030]/60 text-sm mt-1 line-clamp-2">{p.desc}</p>
                      <div className="flex items-center justify-between mt-3">
                        <span style={{ fontFamily: 'Fredoka One, cursive', color: '#F04E37', fontSize: '1.3rem' }}>${p.price}</span>
                        <button onClick={() => addToCart(p)} className="px-4 py-2 rounded-xl text-sm font-800 text-white transition-all active:scale-95"
                          style={{ background: 'linear-gradient(135deg, #F04E37, #F5A623)', fontWeight: 800 }}>
                          Agregar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-center mt-8">
                <button onClick={() => nav('products')} className="px-8 py-3 rounded-2xl font-800 border-2 border-[#4A1030] text-[#4A1030] hover:bg-[#4A1030] hover:text-white transition-all"
                  style={{ fontWeight: 800 }}>
                  Ver todos los productos
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ── PRODUCTS ── */}
        {screen === 'products' && (
          <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <h1 className="text-3xl font-800 text-[#4A1030]" style={{ fontFamily: 'Fredoka One, cursive' }}>
                Catálogo de Productos
              </h1>
              {/* Filters */}
              <div className="flex gap-2 flex-wrap">
                {([['todos', 'Todos'], ['embutidos', 'Embutidos marinados'], ['otros', 'Otros productos']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setCategoryFilter(val)}
                    className="px-4 py-2 rounded-xl text-sm font-700 transition-all whitespace-nowrap"
                    style={{
                      fontWeight: 700,
                      background: categoryFilter === val ? '#4A1030' : '#FFF0E8',
                      color: categoryFilter === val ? 'white' : '#4A1030',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Buscador */}
            <div className="relative mb-8 max-w-md">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A1030]/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
              <input
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Buscar productos..."
                className="w-full pl-11 pr-10 py-3 rounded-2xl border-2 border-[#4A103020] bg-white text-[#4A1030] font-600 placeholder:text-[#4A103040] focus:outline-none focus:border-[#F5A623] transition-colors"
              />
              {productSearch && (
                <button
                  onClick={() => setProductSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#4A1030]/40 hover:text-[#4A1030] font-800"
                >
                  ✕
                </button>
              )}
            </div>

            {filtered.length === 0 && (
              <p className="text-center text-[#4A1030]/50 font-600 py-16">
                No encontramos productos que coincidan con "{productSearch}".
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map(p => (
                <div key={p.id} className="bg-white rounded-3xl shadow-md overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1">
                  <div className="relative">
                    <img src={resolveImageUrl(p.img)} alt={p.name} className="w-full h-52 object-cover" />
                    <span className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-800 ${p.stock ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.stock ? '✓ En stock' : '✗ Agotado'}
                    </span>
                    <span className="absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-700 bg-white/90 text-[#4A1030]">
                      {p.category === 'embutidos' ? 'Embutido marinado' : 'Otro producto'}
                    </span>
                  </div>
                  <div className="p-5">
                    <h3 className="font-800 text-[#4A1030] text-lg mb-1">{p.name}</h3>
                    <p className="text-[#4A1030]/60 text-sm mb-4 leading-relaxed">{p.desc}</p>
                    <div className="flex items-center justify-between">
                      <span style={{ fontFamily: 'Fredoka One, cursive', color: '#F04E37', fontSize: '1.6rem' }}>
                        ${p.price}
                        <span className="text-sm text-[#4A1030]/40 ml-1" style={{ fontFamily: 'Nunito, sans-serif' }}>MXN</span>
                      </span>
                      <button
                        onClick={() => p.stock && addToCart(p)}
                        disabled={!p.stock}
                        className="px-5 py-3 rounded-2xl font-800 text-white text-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: p.stock ? 'linear-gradient(135deg, #F04E37, #F5A623)' : '#ccc', fontWeight: 800 }}
                      >
                        {p.stock ? '+ Agregar al pedido' : 'Agotado'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ORDERS ── */}
        {screen === 'orders' && (
          <div className="max-w-4xl mx-auto px-4 py-10">
            <h1 className="text-3xl font-800 text-[#4A1030] mb-8" style={{ fontFamily: 'Fredoka One, cursive' }}>
              Mis pedidos
            </h1>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { label: 'Pendientes', count: myOrders.filter(o => o.status === 'pendiente').length, color: '#F5A623' },
                { label: 'En proceso', count: myOrders.filter(o => o.status === 'en proceso').length, color: '#F04E37' },
                { label: 'Entregados', count: myOrders.filter(o => o.status === 'entregado').length, color: '#4A1030' },
              ].map(({ label, count, color }) => (
                <div key={label} className="bg-white rounded-3xl p-5 text-center shadow-md">
                  <p style={{ fontFamily: 'Fredoka One, cursive', color, fontSize: '2rem' }}>{count}</p>
                  <p className="text-sm font-700 text-[#4A1030]/70">{label}</p>
                </div>
              ))}
            </div>

            {/* Orders list */}
            {myOrders.length === 0 && (
              <p className="text-center text-[#4A1030]/50 font-600 py-10">Todavía no tienes pedidos. ¡Ve al catálogo y arma el primero!</p>
            )}
            <div className="space-y-4">
              {myOrders.map(order => {
                const cfg = STATUS_CONFIG[order.status]
                const isOpen = expandedOrder === order.id
                return (
                  <div key={order.id} className="bg-white rounded-3xl shadow-md overflow-hidden">
                    <button
                      onClick={() => setExpandedOrder(isOpen ? null : order.id)}
                      className="w-full p-5 flex items-center justify-between hover:bg-[#FFF8F0] transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-800 text-[#4A1030] text-left">{order.id}</p>
                          <p className="text-sm text-[#4A1030]/60">{order.date}</p>
                        </div>
                        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-800 ${cfg.bg} ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span style={{ fontFamily: 'Fredoka One, cursive', color: '#F04E37', fontSize: '1.2rem' }}>${order.total}</span>
                        <svg className={`w-5 h-5 text-[#4A1030]/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-[#4A103010] p-5">
                        <h4 className="font-800 text-[#4A1030] mb-3">Detalle del pedido</h4>
                        <div className="space-y-2">
                          {order.items.map(item => (
                            <div key={item.id} className="flex justify-between items-center py-2 border-b border-[#4A103008] last:border-0">
                              <span className="text-sm font-700 text-[#4A1030]">{item.name}</span>
                              <span className="text-sm font-600 text-[#4A1030]/60">x{item.qty} — ${item.price * item.qty}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-[#4A103015]">
                          <span className="font-800 text-[#4A1030]">Total</span>
                          <span style={{ fontFamily: 'Fredoka One, cursive', color: '#F04E37', fontSize: '1.4rem' }}>${order.total}</span>
                        </div>
                        {order.status === 'pendiente' && (
                          <button
                            onClick={() => cancelOrder(order)}
                            className="w-full mt-4 py-3 rounded-2xl font-800 border-2 border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                          >
                            Cancelar pedido
                          </button>
                        )}
                        {order.status !== 'pendiente' && (
                          <button
                            onClick={() => reorder(order)}
                            className="w-full mt-4 py-3 rounded-2xl font-800 text-white transition-all active:scale-95"
                            style={{ background: 'linear-gradient(135deg, #F04E37, #F5A623)' }}
                          >
                            🔁 Pedir de nuevo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {cart.length > 0 && (
              <div className="mt-8 p-6 bg-white rounded-3xl shadow-md">
                <h3 className="font-800 text-[#4A1030] mb-2">Pedido en curso</h3>
                <p className="text-sm text-[#4A1030]/60 mb-4">Tienes {cartCount} producto(s) en tu carrito por ${cartTotal}</p>
                <button onClick={() => setShowCart(true)} className="px-6 py-3 rounded-2xl font-800 text-white transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #F04E37, #F5A623)', fontWeight: 800 }}>
                  Ver carrito
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── ACCOUNT ── */}
        {screen === 'account' && (
          <div className="max-w-2xl mx-auto px-4 py-10">
            <h1 className="text-3xl font-800 text-[#4A1030] mb-8" style={{ fontFamily: 'Fredoka One, cursive' }}>
              Mi cuenta
            </h1>

            <div className="bg-white rounded-3xl shadow-md p-8 space-y-5">
              {/* Avatar */}
              <div className="flex items-center gap-4 pb-5 border-b border-[#4A103015]">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-800 text-white"
                  style={{ background: 'linear-gradient(135deg, #F04E37, #F5A623)' }}>
                  {accountForm.name.charAt(0)}
                </div>
                <div>
                  <p className="font-800 text-xl text-[#4A1030]">{accountForm.name}</p>
                  <p className="text-sm text-[#4A1030]/60 font-600">{accountForm.email}</p>
                </div>
              </div>

              {[
                { key: 'name', label: 'Nombre completo', type: 'text', disabled: false },
                { key: 'email', label: 'Correo electrónico', type: 'email', disabled: true },
                { key: 'phone', label: 'Teléfono', type: 'tel', disabled: false },
                { key: 'address', label: 'Dirección de entrega', type: 'text', disabled: false },
              ].map(({ key, label, type, disabled }) => (
                <div key={key}>
                  <label className="block text-sm font-700 text-[#4A1030] mb-2">{label}</label>
                  <input
                    type={type}
                    value={accountForm[key as keyof typeof accountForm]}
                    disabled={disabled}
                    onChange={e => setAccountForm({ ...accountForm, [key]: e.target.value })}
                    className="w-full px-4 py-3.5 rounded-2xl border-2 border-[#4A103020] bg-[#FFF8F0] text-[#4A1030] font-600 focus:outline-none focus:border-[#F5A623] transition-colors text-base disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              ))}

              {accountSaved && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-green-50 text-green-700 font-700">
                  <span>✓</span> Datos guardados correctamente
                </div>
              )}

              <button
                onClick={saveAccount}
                className="w-full py-4 rounded-2xl font-800 text-white text-lg transition-all active:scale-95 shadow-lg"
                style={{ background: 'linear-gradient(135deg, #F04E37, #F5A623)', fontWeight: 800 }}
              >
                Guardar cambios
              </button>

              <button onClick={handleLogout} className="w-full py-3 rounded-2xl font-800 border-2 border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                style={{ fontWeight: 800 }}>
                Cerrar sesión
              </button>
            </div>
          </div>
        )}

        {/* ── CONTACT ── */}
        {screen === 'contact' && (
          <div className="max-w-5xl mx-auto px-4 py-10">
            <h1 className="text-3xl font-800 text-[#4A1030] mb-8" style={{ fontFamily: 'Fredoka One, cursive' }}>
              Contáctanos
            </h1>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Chat en vivo con el administrador */}
              <div className="bg-white rounded-3xl shadow-md p-6 flex flex-col" style={{ height: '520px' }}>
                <h2 className="font-800 text-xl text-[#4A1030] mb-4 flex-shrink-0">Chatea con nosotros</h2>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
                  {chatMessages.length === 0 && (
                    <p className="text-center text-[#4A1030]/50 font-600 text-sm py-10">
                      Escríbenos tu duda o pedido especial. ¡Te respondemos por aquí!
                    </p>
                  )}
                  {chatMessages.map(m => (
                    <div key={m.id} className={`flex ${m.remitente === 'cliente' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm font-600 ${m.remitente === 'cliente' ? 'text-white' : 'text-[#4A1030] bg-[#FFF8F0]'}`}
                        style={m.remitente === 'cliente' ? { background: 'linear-gradient(135deg, #F04E37, #F5A623)' } : {}}
                      >
                        <p>{m.mensaje}</p>
                        <p className={`text-[10px] mt-1 ${m.remitente === 'cliente' ? 'text-white/70' : 'text-[#4A1030]/40'}`}>{m.fecha}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendChatMessage() }}
                    placeholder="Escribe tu mensaje..."
                    className="flex-1 px-4 py-3 rounded-2xl border-2 border-[#4A103020] bg-[#FFF8F0] text-[#4A1030] font-600 placeholder:text-[#4A103040] focus:outline-none focus:border-[#F5A623] transition-colors text-sm"
                  />
                  <button
                    onClick={sendChatMessage}
                    disabled={chatLoading || !chatInput.trim()}
                    className="px-5 py-3 rounded-2xl font-800 text-white transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #F04E37, #F5A623)' }}
                  >
                    Enviar
                  </button>
                </div>
              </div>

              {/* Contact info */}
              <div className="space-y-5">
                <div className="bg-white rounded-3xl shadow-md p-6">
                  <img src={logo} alt="Maestros del Sabor" className="w-1/2 object-contain mb-4" />
                  <p className="text-[#4A1030]/70 font-600 leading-relaxed">
                    Elaboramos embutidos marinados artesanales con los mejores ingredientes. ¡Llámanos o escríbenos!
                  </p>
                </div>

                {[
                  { icon: '📞', label: 'Teléfono', value: '55 1234 5678', sub: 'Lun–Sáb 9am – 7pm' },
                  { icon: '📱', label: 'WhatsApp', value: '55 1234 5678', sub: 'Respuesta inmediata' },
                  { icon: '📸', label: 'Instagram', value: '@maestrosdelsabor', sub: 'Síguenos para novedades' },
                  { icon: '📍', label: 'Ubicación', value: 'Ciudad de México', sub: 'Entregas a toda la ciudad' },
                ].map(({ icon, label, value, sub }) => (
                  <div key={label} className="bg-white rounded-3xl shadow-md p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #FFF0EE, #FFEDD5)' }}>
                      {icon}
                    </div>
                    <div>
                      <p className="text-xs font-700 text-[#4A1030]/50 uppercase tracking-wide">{label}</p>
                      <p className="font-800 text-[#4A1030]">{value}</p>
                      <p className="text-xs text-[#4A1030]/50 font-600">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 py-10 text-center" style={{ borderTop: '1px solid #4A103015' }}>
          <img src={logo} alt="Maestros del Sabor" className="h-16 w-auto mx-auto object-contain mb-3" />
          <p className="text-sm text-[#4A1030]/50 font-600">© 2024 Maestros del Sabor · Todos los derechos reservados</p>
        </footer>
      </main>
    </div>
  )
}
