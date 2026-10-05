import { useState, useEffect, useRef } from 'react'
import logo from '@/imports/logo_maestros_transparente.png'
import { apiFetch, resolveImageUrl } from "./api";
import { connectSocket, disconnectSocket } from './socket'

// ─── Tipos ──────────────────────────────────────────────────────────────────
export type AdminScreen = 'admin-dashboard' | 'admin-orders' | 'admin-products' | 'admin-users' | 'admin-messages' | 'admin-reports' | 'admin-audit'

export interface AdminOrder {
  id: string
  cliente: string
  fecha: string
  direccion: string
  total: number
  status: 'pendiente' | 'en proceso' | 'entregado' | 'cancelado'
  items: { name: string; qty: number; price: number }[]
}

export interface AdminProduct {
  id: number
  name: string
  category: 'embutidos' | 'otros'
  price: number
  stock: number
  img: string
}

export interface AdminUser {
  id: number
  name: string
  email: string
  phone: string
  registered: string
}

// Transforma la respuesta del backend al formato que usa esta pantalla
function mapOrder(o: any): AdminOrder {
  return {
    id: `#MDS-${String(o.id).padStart(4, '0')}`,
    cliente: o.cliente,
    fecha: new Date(o.creado_en).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }),
    direccion: o.direccion_entrega,
    total: Number(o.total),
    status: o.estado,
    items: (o.items || []).map((it: any) => ({ name: it.nombre, qty: it.cantidad, price: Number(it.precio_unitario) })),
    // guardamos el id real numérico aparte para usarlo en las llamadas al backend
    // @ts-ignore
    _rawId: o.id,
  }
}

function mapProduct(p: any): AdminProduct {
  return { id: p.id, name: p.nombre, category: p.categoria, price: Number(p.precio), stock: p.stock, img: p.imagen_url }
}

function mapUser(u: any): AdminUser {
  return {
    id: u.id,
    name: u.nombre,
    email: u.correo,
    phone: u.telefono || '—',
    registered: new Date(u.creado_en).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }),
  }
}

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-400' },
  'en proceso': { label: 'En proceso', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400' },
  entregado: { label: 'Entregado', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  cancelado: { label: 'Cancelado', bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-400' },
}

const NAV_ITEMS: [AdminScreen, string, string][] = [
  ['admin-dashboard', 'Dashboard', '📊'],
  ['admin-orders', 'Pedidos', '📦'],
  ['admin-products', 'Productos', '🌭'],
  ['admin-users', 'Usuarios', '👥'],
  ['admin-messages', 'Mensajes', '✉️'],
  ['admin-reports', 'Reportes', '📈'],
  ['admin-audit', 'Seguridad', '🛡️'],
]

// ─── Componente principal ───────────────────────────────────────────────────
interface Props {
  onExitAdmin: () => void
}

export default function AdminPanel({ onExitAdmin }: Props) {
  const [screen, setScreen] = useState<AdminScreen>('admin-dashboard')
  const [orders, setOrders] = useState<(AdminOrder & { _rawId: number })[]>([])
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [report, setReport] = useState<{
    resumen: { ventasMes: number; pedidosMes: number; ticketPromedio: number }
    ventasDiarias: { fecha: string; total: number; pedidos: number }[]
    topProductos: { nombre: string; cantidad: number; ingresos: number }[]
  } | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [auditLog, setAuditLog] = useState<{ id: number; correo: string | null; accion: string; detalle: string | null; ip: string | null; fecha: string }[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [conversations, setConversations] = useState<{ id_usuario: number; nombre: string; correo: string; ultimo_mensaje: string; ultima_fecha: string; no_leidos: number }[]>([])
  const [activeChatUser, setActiveChatUser] = useState<number | null>(null)
  const [chatThread, setChatThread] = useState<{ id: number; remitente: 'cliente' | 'admin'; mensaje: string; fecha: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const [orderFilter, setOrderFilter] = useState<'todos' | AdminOrder['status']>('todos')
  const [orderSearch, setOrderSearch] = useState('')
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [productForm, setProductForm] = useState({ name: '', category: 'embutidos' as 'embutidos' | 'otros', price: '', stock: '', img: '' })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadAll = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const [ordersData, productsData, usersData, conversationsData] = await Promise.all([
        apiFetch('/orders'),
        apiFetch('/products'),
        apiFetch('/users'),
        apiFetch('/chat'),
      ])
      setOrders(ordersData.map(mapOrder))
      setProducts(productsData.map(mapProduct))
      setUsers(usersData.map(mapUser))
      setConversations(conversationsData.map((c: any) => ({
        id_usuario: c.id_usuario, nombre: c.nombre, correo: c.correo,
        ultimo_mensaje: c.ultimo_mensaje, no_leidos: c.no_leidos,
        ultima_fecha: c.ultima_fecha ? new Date(c.ultima_fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '',
      })))
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo cargar la información del panel.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // Trae el hilo de mensajes con un cliente específico
  const openChat = async (idUsuario: number) => {
    setActiveChatUser(idUsuario)
    try {
      const data = await apiFetch(`/chat/${idUsuario}`)
      setChatThread(data.map((m: any) => ({
        id: m.id, remitente: m.remitente, mensaje: m.mensaje,
        fecha: new Date(m.creado_en).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      })))
      setConversations(prev => prev.map(c => c.id_usuario === idUsuario ? { ...c, no_leidos: 0 } : c))
    } catch (err) {
      console.error(err)
    }
  }

  // Refresca el hilo abierto (se usa con polling mientras está abierto)
  const refreshChat = async () => {
    if (activeChatUser == null) return
    try {
      const data = await apiFetch(`/chat/${activeChatUser}`)
      setChatThread(data.map((m: any) => ({
        id: m.id, remitente: m.remitente, mensaje: m.mensaje,
        fecha: new Date(m.creado_en).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      })))
    } catch { /* silencioso */ }
  }

  // Conecta el socket una vez al entrar al panel, y lo desconecta al salir de él.
  useEffect(() => {
    const socket = connectSocket()
    return () => disconnectSocket()
  }, [])

  // Chat en tiempo real: escucha mensajes nuevos de cualquier cliente.
  // Si el hilo que llega es el que está abierto, lo refresca; siempre refresca
  // la lista de conversaciones para actualizar el conteo de no leídos.
  useEffect(() => {
    const socket = connectSocket()
    const onNuevoMensaje = (data: any) => {
      apiFetch('/chat').then(convData => {
        setConversations(convData.map((c: any) => ({
          id_usuario: c.id_usuario, nombre: c.nombre, correo: c.correo,
          ultimo_mensaje: c.ultimo_mensaje, no_leidos: c.no_leidos,
          ultima_fecha: c.ultima_fecha ? new Date(c.ultima_fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '',
        })))
      }).catch(() => {})

      if (data?.id_usuario === activeChatUser) refreshChat()
    }
    socket.on('nuevo_mensaje', onNuevoMensaje)
    return () => { socket.off('nuevo_mensaje', onNuevoMensaje) }
  }, [activeChatUser])

  // Respaldo lento por si el socket se desconecta mientras hay un chat abierto
  useEffect(() => {
    if (activeChatUser == null || screen !== 'admin-messages') return
    const interval = setInterval(refreshChat, 20000)
    return () => clearInterval(interval)
  }, [activeChatUser, screen])

  useEffect(() => {
    if (screen !== 'admin-reports' || report) return
    setReportLoading(true)
    apiFetch('/orders/reports')
      .then(setReport)
      .catch(err => console.error(err))
      .finally(() => setReportLoading(false))
  }, [screen])

  useEffect(() => {
    if (screen !== 'admin-audit') return
    setAuditLoading(true)
    apiFetch('/users/audit')
      .then(data => setAuditLog(data.map((a: any) => ({
        id: a.id, correo: a.correo, accion: a.accion, detalle: a.detalle, ip: a.ip,
        fecha: new Date(a.creado_en).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      }))))
      .catch(err => console.error(err))
      .finally(() => setAuditLoading(false))
  }, [screen])

  const sendAdminReply = async () => {
    if (!chatInput.trim() || activeChatUser == null) return
    setChatSending(true)
    try {
      await apiFetch(`/chat/${activeChatUser}`, { method: 'POST', body: JSON.stringify({ mensaje: chatInput }) })
      setChatInput('')
      await refreshChat()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setChatSending(false)
    }
  }

  const updateOrderStatus = async (order: AdminOrder & { _rawId: number }, status: AdminOrder['status']) => {
    try {
      await apiFetch(`/orders/${order._rawId}/status`, { method: 'PATCH', body: JSON.stringify({ estado: status }) })
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status } : o))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const updateStock = async (id: number, stock: number) => {
    const nuevoStock = Math.max(0, stock)
    try {
      await apiFetch(`/products/${id}/stock`, { method: 'PATCH', body: JSON.stringify({ stock: nuevoStock }) })
      setProducts(prev => prev.map(p => p.id === id ? { ...p, stock: nuevoStock } : p))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const deleteProduct = async (id: number) => {
    if (!confirm('¿Seguro que quieres eliminar este producto?')) return
    try {
      await apiFetch(`/products/${id}`, { method: 'DELETE' })
      setProducts(prev => prev.filter(p => p.id !== id))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const openNewProduct = () => {
    setEditingProduct(null)
    setProductForm({ name: '', category: 'embutidos', price: '', stock: '', img: '' })
    setImageFile(null)
    setImagePreview('')
    setShowProductForm(true)
  }

  const openEditProduct = (p: AdminProduct) => {
    setEditingProduct(p)
    setProductForm({ name: p.name, category: p.category, price: String(p.price), stock: String(p.stock), img: p.img })
    setImageFile(null)
    setImagePreview(resolveImageUrl(p.img))
    setShowProductForm(true)
  }

  const handleImageSelect = (file: File | null) => {
    setImageFile(file)
    if (file) {
      const reader = new FileReader()
      reader.onload = () => setImagePreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const saveProduct = async () => {
    if (!productForm.name || !productForm.price) return

    const formData = new FormData()
    formData.append('nombre', productForm.name)
    formData.append('descripcion', '')
    formData.append('categoria', productForm.category)
    formData.append('precio', productForm.price)
    formData.append('stock', String(Number(productForm.stock) || 0))
    if (imageFile) formData.append('imagen', imageFile)

    try {
      if (editingProduct) {
        await apiFetch(`/products/${editingProduct.id}`, { method: 'PUT', body: formData })
      } else {
        await apiFetch('/products', { method: 'POST', body: formData })
      }
      setShowProductForm(false)
      setImageFile(null)
      setImagePreview('')
      await loadAll()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const filteredOrders = orders.filter(o =>
    (orderFilter === 'todos' || o.status === orderFilter) &&
    (o.cliente.toLowerCase().includes(orderSearch.toLowerCase()) || o.id.toLowerCase().includes(orderSearch.toLowerCase()))
  )

  const todayOrders = orders.length
  const pendingOrders = orders.filter(o => o.status === 'pendiente').length
  const lowStock = products.filter(p => p.stock <= 5).length
  const totalSales = orders.reduce((s, o) => s + o.total, 0)

  const nav = (s: AdminScreen) => { setScreen(s); setSidebarOpen(false) }

  const Sidebar = () => (
    <aside className={`fixed md:sticky top-0 left-0 h-screen w-64 bg-[#4A1030] text-white flex flex-col z-40 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
      <div className="flex items-center gap-2 px-5 py-6 border-b border-white/10">
        <img src={logo} alt="Maestros del Sabor" className="h-10 w-auto object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
        <span className="font-800 text-sm tracking-wide" style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 800 }}>PANEL ADMIN</span>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1">
        {NAV_ITEMS.map(([s, label, icon]) => (
          <button
            key={s}
            onClick={() => nav(s)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left font-700 transition-colors ${screen === s ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
          >
            <span className="text-lg">{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10">
        <button
          onClick={onExitAdmin}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left font-700 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <span className="text-lg">🏠</span>
          Ver tienda
        </button>
      </div>
    </aside>
  )

  const StatCard = ({ label, value, icon, accent }: { label: string; value: string | number; icon: string; accent: string }) => (
    <div className="bg-white rounded-3xl shadow-md p-6 flex items-center gap-4">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: accent }}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-700 text-[#4A1030]/50 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-800 text-[#4A1030]" style={{ fontFamily: 'Fredoka One, cursive' }}>{value}</p>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFF8F0' }}>
        <img src={logo} alt="Maestros del Sabor" className="w-32 object-contain animate-pulse" />
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: '#FFF8F0' }}>
        <p className="text-[#4A1030] font-700">{errorMsg}</p>
        <button onClick={loadAll} className="px-5 py-2.5 rounded-xl font-800 text-white" style={{ background: '#4A1030' }}>
          Reintentar
        </button>
        <button onClick={onExitAdmin} className="text-sm font-700 text-[#4A1030]/60 underline">Volver a la tienda</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#FFF8F0' }}>
      <Sidebar />
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="flex-1 min-w-0">
        {/* Top bar (mobile) */}
        <div className="md:hidden sticky top-0 z-20 bg-white shadow-sm flex items-center justify-between px-4 h-14">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-xl text-[#4A1030]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-800 text-[#4A1030]">Panel Admin</span>
          <div className="w-10" />
        </div>

        <main className="p-4 md:p-8 max-w-6xl mx-auto">

          {/* ── DASHBOARD ── */}
          {screen === 'admin-dashboard' && (
            <div>
              <h1 className="text-3xl font-800 text-[#4A1030] mb-1" style={{ fontFamily: 'Fredoka One, cursive' }}>Dashboard</h1>
              <p className="text-[#4A1030]/60 font-600 mb-8">Resumen general del negocio</p>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
                <StatCard label="Pedidos totales" value={todayOrders} icon="📦" accent="linear-gradient(135deg, #FFE0D5, #FFD3B0)" />
                <StatCard label="Pendientes" value={pendingOrders} icon="⏳" accent="linear-gradient(135deg, #FFF3D5, #FFE8B0)" />
                <StatCard label="Stock bajo" value={lowStock} icon="⚠️" accent="linear-gradient(135deg, #FFE0E0, #FFC9C9)" />
                <StatCard label="Ventas totales" value={`$${totalSales}`} icon="💰" accent="linear-gradient(135deg, #DFF5E1, #C8ECCB)" />
              </div>

              <div className="bg-white rounded-3xl shadow-md p-6">
                <h2 className="font-800 text-lg text-[#4A1030] mb-4">Pedidos recientes</h2>
                <div className="space-y-3">
                  {orders.slice(0, 4).map(o => (
                    <div key={o.id} className="flex items-center justify-between gap-3 py-3 border-b border-[#4A103010] last:border-0">
                      <div className="min-w-0">
                        <p className="font-800 text-[#4A1030] text-sm truncate">{o.cliente}</p>
                        <p className="text-xs text-[#4A1030]/50">{o.id} · {o.fecha}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-800 flex-shrink-0 ${STATUS_CONFIG[o.status].bg} ${STATUS_CONFIG[o.status].text}`}>
                        {STATUS_CONFIG[o.status].label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── PEDIDOS ── */}
          {screen === 'admin-orders' && (
            <div>
              <h1 className="text-3xl font-800 text-[#4A1030] mb-1" style={{ fontFamily: 'Fredoka One, cursive' }}>Gestionar pedidos</h1>
              <p className="text-[#4A1030]/60 font-600 mb-6">Consulta y actualiza el estado de las entregas</p>

              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <input
                  value={orderSearch}
                  onChange={e => setOrderSearch(e.target.value)}
                  placeholder="Buscar por cliente o folio..."
                  className="flex-1 px-4 py-3 rounded-2xl border-2 border-[#4A103020] bg-white text-[#4A1030] font-600 placeholder:text-[#4A103040] focus:outline-none focus:border-[#F5A623] transition-colors"
                />
                <select
                  value={orderFilter}
                  onChange={e => setOrderFilter(e.target.value as any)}
                  className="px-4 py-3 rounded-2xl border-2 border-[#4A103020] bg-white text-[#4A1030] font-700 focus:outline-none focus:border-[#F5A623]"
                >
                  <option value="todos">Todos los estados</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="en proceso">En proceso</option>
                  <option value="entregado">Entregado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>

              <div className="space-y-3">
                {filteredOrders.length === 0 && (
                  <p className="text-center text-[#4A1030]/50 font-600 py-10">No se encontraron pedidos.</p>
                )}
                {filteredOrders.map(o => (
                  <div key={o.id} className="bg-white rounded-3xl shadow-md overflow-hidden">
                    <button
                      onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}
                      className="w-full flex flex-wrap items-center justify-between gap-3 p-5 text-left"
                    >
                      <div className="min-w-0">
                        <p className="font-800 text-[#4A1030]">{o.id}</p>
                        <p className="text-sm text-[#4A1030]/60 font-600">{o.cliente} · {o.fecha}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-800 flex items-center gap-1.5 ${STATUS_CONFIG[o.status].bg} ${STATUS_CONFIG[o.status].text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[o.status].dot}`} />
                          {STATUS_CONFIG[o.status].label}
                        </span>
                        <span style={{ fontFamily: 'Fredoka One, cursive', color: '#F04E37' }}>${o.total}</span>
                      </div>
                    </button>

                    {expandedOrder === o.id && (
                      <div className="px-5 pb-5 border-t border-[#4A103010] pt-4">
                        <p className="text-sm font-700 text-[#4A1030] mb-1">📍 Dirección de entrega</p>
                        <p className="text-sm text-[#4A1030]/70 font-600 mb-4">{o.direccion}</p>

                        <p className="text-sm font-700 text-[#4A1030] mb-2">Productos</p>
                        <div className="space-y-1 mb-4">
                          {o.items.map((it, i) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span className="text-[#4A1030]/80 font-600">{it.name} x{it.qty}</span>
                              <span className="text-[#4A1030] font-700">${it.price * it.qty}</span>
                            </div>
                          ))}
                        </div>

                        <p className="text-sm font-700 text-[#4A1030] mb-2">Actualizar estado</p>
                        <div className="flex flex-wrap gap-2">
                          {(['pendiente', 'en proceso', 'entregado', 'cancelado'] as const).map(st => (
                            <button
                              key={st}
                              onClick={() => updateOrderStatus(o, st)}
                              className={`px-3 py-2 rounded-xl text-xs font-800 transition-colors ${o.status === st ? 'text-white' : `${STATUS_CONFIG[st].bg} ${STATUS_CONFIG[st].text} hover:opacity-80`}`}
                              style={o.status === st ? { background: 'linear-gradient(135deg, #F04E37, #F5A623)' } : {}}
                            >
                              {STATUS_CONFIG[st].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── PRODUCTOS ── */}
          {screen === 'admin-products' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                  <h1 className="text-3xl font-800 text-[#4A1030] mb-1" style={{ fontFamily: 'Fredoka One, cursive' }}>Gestionar productos</h1>
                  <p className="text-[#4A1030]/60 font-600">Edita precios, stock y catálogo</p>
                </div>
                <button
                  onClick={openNewProduct}
                  className="px-5 py-3 rounded-2xl font-800 text-white transition-all active:scale-95 shadow-md"
                  style={{ background: 'linear-gradient(135deg, #F04E37, #F5A623)' }}
                >
                  + Agregar producto
                </button>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {products.map(p => (
                  <div key={p.id} className="bg-white rounded-3xl shadow-md overflow-hidden">
                    <div className="relative h-36">
                      <img src={resolveImageUrl(p.img)} alt={p.name} className="w-full h-full object-cover" />
                      {p.stock === 0 && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="text-white font-800 text-sm">SIN STOCK</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <p className="text-xs font-700 text-[#4A1030]/50 uppercase">{p.category}</p>
                      <p className="font-800 text-[#4A1030] mb-1">{p.name}</p>
                      <p style={{ fontFamily: 'Fredoka One, cursive', color: '#F04E37' }} className="mb-3">${p.price}</p>

                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-700 text-[#4A1030]/60">Stock:</span>
                        <button onClick={() => updateStock(p.id, p.stock - 1)} className="w-7 h-7 rounded-lg bg-[#FFF0E8] text-[#F04E37] font-800 hover:bg-[#FFE0CC]">−</button>
                        <span className="font-800 text-[#4A1030] w-8 text-center">{p.stock}</span>
                        <button onClick={() => updateStock(p.id, p.stock + 1)} className="w-7 h-7 rounded-lg bg-[#FFF0E8] text-[#F04E37] font-800 hover:bg-[#FFE0CC]">+</button>
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => openEditProduct(p)} className="flex-1 py-2 rounded-xl text-sm font-700 bg-[#4A1030] text-white hover:opacity-90 transition-opacity">
                          Editar
                        </button>
                        <button onClick={() => deleteProduct(p.id)} className="px-3 py-2 rounded-xl text-sm font-700 border-2 border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── USUARIOS ── */}
          {screen === 'admin-users' && (
            <div>
              <h1 className="text-3xl font-800 text-[#4A1030] mb-1" style={{ fontFamily: 'Fredoka One, cursive' }}>Usuarios registrados</h1>
              <p className="text-[#4A1030]/60 font-600 mb-6">Clientes con cuenta en la tienda</p>

              <div className="bg-white rounded-3xl shadow-md overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="bg-[#FFF8F0] text-left">
                      <th className="px-5 py-3 font-800 text-[#4A1030]">Nombre</th>
                      <th className="px-5 py-3 font-800 text-[#4A1030]">Correo</th>
                      <th className="px-5 py-3 font-800 text-[#4A1030]">Teléfono</th>
                      <th className="px-5 py-3 font-800 text-[#4A1030]">Registrado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className="border-t border-[#4A103010]">
                        <td className="px-5 py-4 font-700 text-[#4A1030]">{u.name}</td>
                        <td className="px-5 py-4 text-[#4A1030]/70 font-600">{u.email}</td>
                        <td className="px-5 py-4 text-[#4A1030]/70 font-600">{u.phone}</td>
                        <td className="px-5 py-4 text-[#4A1030]/70 font-600">{u.registered}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── MENSAJES ── */}
          {screen === 'admin-messages' && (
            <div>
              <h1 className="text-3xl font-800 text-[#4A1030] mb-1" style={{ fontFamily: 'Fredoka One, cursive' }}>Mensajes</h1>
              <p className="text-[#4A1030]/60 font-600 mb-6">Conversa directamente con tus clientes</p>

              <div className="grid md:grid-cols-[280px_1fr] gap-5 items-start">
                {/* Lista de conversaciones */}
                <div className="bg-white rounded-3xl shadow-md overflow-hidden">
                  {conversations.length === 0 && (
                    <p className="text-center text-[#4A1030]/50 font-600 py-10 px-4">Todavía no hay conversaciones.</p>
                  )}
                  <div className="max-h-[520px] overflow-y-auto divide-y divide-[#4A103010]">
                    {conversations.map(c => (
                      <button
                        key={c.id_usuario}
                        onClick={() => openChat(c.id_usuario)}
                        className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${activeChatUser === c.id_usuario ? 'bg-[#FFF0E8]' : 'hover:bg-[#FFF8F0]'}`}
                      >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-800 text-white flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg, #F04E37, #F5A623)' }}>
                          {c.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-800 text-[#4A1030] text-sm truncate">{c.nombre}</p>
                            {c.ultima_fecha && <span className="text-[10px] text-[#4A1030]/40 flex-shrink-0">{c.ultima_fecha}</span>}
                          </div>
                          <p className="text-xs text-[#4A1030]/50 font-600 truncate">{c.ultimo_mensaje || 'Sin mensajes'}</p>
                        </div>
                        {c.no_leidos > 0 && (
                          <span className="w-5 h-5 rounded-full text-[10px] font-800 text-white flex items-center justify-center flex-shrink-0"
                            style={{ background: '#F04E37' }}>
                            {c.no_leidos}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hilo de conversación */}
                <div className="bg-white rounded-3xl shadow-md flex flex-col h-[560px]">
                  {activeChatUser == null ? (
                    <div className="flex-1 flex items-center justify-center text-[#4A1030]/40 font-600 text-sm px-6 text-center">
                      Selecciona una conversación para ver los mensajes
                    </div>
                  ) : (
                    <>
                      <div className="px-5 py-4 border-b border-[#4A103010]">
                        <p className="font-800 text-[#4A1030]">
                          {conversations.find(c => c.id_usuario === activeChatUser)?.nombre}
                        </p>
                        <p className="text-xs text-[#4A1030]/50 font-600">
                          {conversations.find(c => c.id_usuario === activeChatUser)?.correo}
                        </p>
                      </div>

                      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                        {chatThread.length === 0 && (
                          <p className="text-center text-[#4A1030]/40 font-600 text-sm py-6">Todavía no hay mensajes en esta conversación.</p>
                        )}
                        {chatThread.map(m => (
                          <div key={m.id} className={`flex ${m.remitente === 'admin' ? 'justify-end' : 'justify-start'}`}>
                            <div
                              className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm font-600 ${m.remitente === 'admin' ? 'text-white rounded-br-sm' : 'bg-[#FFF8F0] text-[#4A1030] rounded-bl-sm'}`}
                              style={m.remitente === 'admin' ? { background: 'linear-gradient(135deg, #F04E37, #F5A623)' } : {}}
                            >
                              <p>{m.mensaje}</p>
                              <p className={`text-[10px] mt-1 ${m.remitente === 'admin' ? 'text-white/70' : 'text-[#4A1030]/40'}`}>{m.fecha}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="p-4 border-t border-[#4A103010] flex gap-2">
                        <input
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !chatSending) sendAdminReply() }}
                          placeholder="Escribe una respuesta..."
                          className="flex-1 px-4 py-3 rounded-2xl border-2 border-[#4A103020] bg-[#FFF8F0] text-[#4A1030] font-600 placeholder:text-[#4A103040] focus:outline-none focus:border-[#F5A623] transition-colors text-sm"
                        />
                        <button
                          onClick={sendAdminReply}
                          disabled={chatSending || !chatInput.trim()}
                          className="px-5 py-3 rounded-2xl font-800 text-white transition-all active:scale-95 disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg, #F04E37, #F5A623)' }}
                        >
                          Enviar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── REPORTES ── */}
          {screen === 'admin-reports' && (
            <div>
              <h1 className="text-3xl font-800 text-[#4A1030] mb-1" style={{ fontFamily: 'Fredoka One, cursive' }}>Reportes de ventas</h1>
              <p className="text-[#4A1030]/60 font-600 mb-8">Cómo va el negocio este mes</p>

              {reportLoading && (
                <p className="text-center text-[#4A1030]/50 font-600 py-16">Cargando reporte...</p>
              )}

              {!reportLoading && report && (
                <>
                  {/* Tarjetas resumen */}
                  <div className="grid sm:grid-cols-3 gap-5 mb-8">
                    <StatCard label="Ventas del mes" value={`$${report.resumen.ventasMes.toFixed(2)}`} icon="💰" accent="linear-gradient(135deg, #DFF5E1, #C8ECCB)" />
                    <StatCard label="Pedidos del mes" value={report.resumen.pedidosMes} icon="📦" accent="linear-gradient(135deg, #FFE0D5, #FFD3B0)" />
                    <StatCard label="Ticket promedio" value={`$${report.resumen.ticketPromedio.toFixed(2)}`} icon="🧾" accent="linear-gradient(135deg, #FFF3D5, #FFE8B0)" />
                  </div>

                  {/* Gráfica de ventas diarias (últimos 14 días) */}
                  <div className="bg-white rounded-3xl shadow-md p-6 mb-8">
                    <h2 className="font-800 text-lg text-[#4A1030] mb-5">Ventas de los últimos 14 días</h2>
                    {report.ventasDiarias.length === 0 ? (
                      <p className="text-center text-[#4A1030]/40 font-600 py-8 text-sm">Todavía no hay ventas registradas en este periodo.</p>
                    ) : (
                      <div className="flex items-end gap-2 h-48">
                        {(() => {
                          const max = Math.max(...report.ventasDiarias.map(v => v.total), 1)
                          return report.ventasDiarias.map(v => {
                            const alturaPct = Math.max((v.total / max) * 100, 3)
                            const fecha = new Date(v.fecha)
                            return (
                              <div key={v.fecha} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                                <div className="text-[10px] font-800 text-[#4A1030] mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                  ${v.total.toFixed(0)}
                                </div>
                                <div
                                  className="w-full rounded-t-lg transition-all"
                                  style={{ height: `${alturaPct}%`, background: 'linear-gradient(180deg, #F5A623, #F04E37)', minHeight: 4 }}
                                />
                                <span className="text-[10px] text-[#4A1030]/50 font-700 mt-1">
                                  {fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' })}
                                </span>
                              </div>
                            )
                          })
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Top productos */}
                  <div className="bg-white rounded-3xl shadow-md p-6">
                    <h2 className="font-800 text-lg text-[#4A1030] mb-5">Productos más vendidos (últimos 30 días)</h2>
                    {report.topProductos.length === 0 ? (
                      <p className="text-center text-[#4A1030]/40 font-600 py-8 text-sm">Todavía no hay ventas registradas en este periodo.</p>
                    ) : (
                      <div className="space-y-4">
                        {report.topProductos.map((p, i) => {
                          const maxCantidad = Math.max(...report.topProductos.map(x => x.cantidad), 1)
                          return (
                            <div key={p.nombre}>
                              <div className="flex justify-between items-center mb-1.5">
                                <span className="font-700 text-[#4A1030] text-sm">
                                  <span className="text-[#4A1030]/40 mr-2">#{i + 1}</span>{p.nombre}
                                </span>
                                <span className="text-xs text-[#4A1030]/60 font-700">{p.cantidad} vendidos · ${p.ingresos.toFixed(2)}</span>
                              </div>
                              <div className="w-full bg-[#FFF0E8] rounded-full h-2.5">
                                <div
                                  className="h-2.5 rounded-full"
                                  style={{ width: `${(p.cantidad / maxCantidad) * 100}%`, background: 'linear-gradient(90deg, #F04E37, #F5A623)' }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── SEGURIDAD / AUDITORÍA ── */}
          {screen === 'admin-audit' && (
            <div>
              <h1 className="text-3xl font-800 text-[#4A1030] mb-1" style={{ fontFamily: 'Fredoka One, cursive' }}>Seguridad</h1>
              <p className="text-[#4A1030]/60 font-600 mb-6">Registro de actividad: inicios de sesión, cambios de productos y pedidos</p>

              {auditLoading && (
                <p className="text-center text-[#4A1030]/50 font-600 py-16">Cargando registro...</p>
              )}

              {!auditLoading && (
                <div className="bg-white rounded-3xl shadow-md overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="bg-[#FFF8F0] text-left">
                        <th className="px-5 py-3 font-800 text-[#4A1030]">Fecha</th>
                        <th className="px-5 py-3 font-800 text-[#4A1030]">Acción</th>
                        <th className="px-5 py-3 font-800 text-[#4A1030]">Correo</th>
                        <th className="px-5 py-3 font-800 text-[#4A1030]">Detalle</th>
                        <th className="px-5 py-3 font-800 text-[#4A1030]">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLog.length === 0 && (
                        <tr><td colSpan={5} className="px-5 py-10 text-center text-[#4A1030]/40 font-600">Todavía no hay actividad registrada.</td></tr>
                      )}
                      {auditLog.map(a => {
                        const esAlerta = a.accion === 'login_fallido'
                        return (
                          <tr key={a.id} className="border-t border-[#4A103010]">
                            <td className="px-5 py-3 text-[#4A1030]/70 font-600 whitespace-nowrap">{a.fecha}</td>
                            <td className="px-5 py-3">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-800 ${esAlerta ? 'bg-red-100 text-red-600' : 'bg-[#FFF0E8] text-[#4A1030]'}`}>
                                {a.accion.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-[#4A1030]/70 font-600">{a.correo || '—'}</td>
                            <td className="px-5 py-3 text-[#4A1030]/70 font-600">{a.detalle || '—'}</td>
                            <td className="px-5 py-3 text-[#4A1030]/40 font-600">{a.ip || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── MODAL: Agregar/editar producto ── */}
      {showProductForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-800 text-xl text-[#4A1030]" style={{ fontFamily: 'Fredoka One, cursive' }}>
              {editingProduct ? 'Editar producto' : 'Nuevo producto'}
            </h2>

            <div>
              <label className="block text-sm font-700 text-[#4A1030] mb-2">Nombre</label>
              <input
                value={productForm.name}
                onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                className="w-full px-4 py-3 rounded-2xl border-2 border-[#4A103020] bg-[#FFF8F0] text-[#4A1030] font-600 focus:outline-none focus:border-[#F5A623]"
                placeholder="Chorizo Marinado Especial"
              />
            </div>

            <div>
              <label className="block text-sm font-700 text-[#4A1030] mb-2">Categoría</label>
              <select
                value={productForm.category}
                onChange={e => setProductForm({ ...productForm, category: e.target.value as any })}
                className="w-full px-4 py-3 rounded-2xl border-2 border-[#4A103020] bg-[#FFF8F0] text-[#4A1030] font-700 focus:outline-none focus:border-[#F5A623]"
              >
                <option value="embutidos">Embutidos marinados</option>
                <option value="otros">Otros productos</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-700 text-[#4A1030] mb-2">Precio ($)</label>
                <input
                  type="number"
                  value={productForm.price}
                  onChange={e => setProductForm({ ...productForm, price: e.target.value })}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-[#4A103020] bg-[#FFF8F0] text-[#4A1030] font-600 focus:outline-none focus:border-[#F5A623]"
                  placeholder="85"
                />
              </div>
              <div>
                <label className="block text-sm font-700 text-[#4A1030] mb-2">Stock</label>
                <input
                  type="number"
                  value={productForm.stock}
                  onChange={e => setProductForm({ ...productForm, stock: e.target.value })}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-[#4A103020] bg-[#FFF8F0] text-[#4A1030] font-600 focus:outline-none focus:border-[#F5A623]"
                  placeholder="20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-700 text-[#4A1030] mb-2">Foto del producto</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={e => handleImageSelect(e.target.files?.[0] || null)}
                className="hidden"
              />
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="Vista previa" className="w-full h-40 object-cover rounded-2xl border-2 border-[#4A103020]" />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 py-2 rounded-xl text-sm font-700 bg-[#4A1030] text-white hover:opacity-90 transition-opacity"
                    >
                      Cambiar foto
                    </button>
                    <button
                      type="button"
                      onClick={() => { setImageFile(null); setImagePreview('') }}
                      className="px-3 py-2 rounded-xl text-sm font-700 border-2 border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8 rounded-2xl border-2 border-dashed border-[#4A103030] text-[#4A1030]/60 font-700 hover:border-[#F5A623] hover:text-[#4A1030] transition-colors flex flex-col items-center gap-1"
                >
                  <span className="text-2xl">📷</span>
                  Subir foto (JPG, PNG o WEBP, máx. 5MB)
                </button>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowProductForm(false)} className="flex-1 py-3 rounded-2xl font-800 border-2 border-[#4A103020] text-[#4A1030] hover:bg-[#4A103008] transition-colors">
                Cancelar
              </button>
              <button
                onClick={saveProduct}
                className="flex-1 py-3 rounded-2xl font-800 text-white transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, #F04E37, #F5A623)' }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
