// Dirección de tu backend. En desarrollo usa localhost automáticamente.
// En producción, se toma de la variable de entorno VITE_SERVER_URL (la
// configuras en el panel de tu servicio de hosting — ver DEPLOY.md).
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000'
export const API_URL = `${SERVER_URL}/api`

export function getToken() {
  return localStorage.getItem('mds_token')
}

export function setToken(token: string) {
  localStorage.setItem('mds_token', token)
}

export function clearToken() {
  localStorage.removeItem('mds_token')
}

// Convierte la ruta de imagen que devuelve el backend (ej. "/uploads/products/xxx.jpg")
// en una URL completa. Si ya es una URL externa (http...), la deja igual.
export function resolveImageUrl(url?: string | null) {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${SERVER_URL}${url}`
}

// Wrapper de fetch: agrega el token automáticamente y lanza un error legible
// si el backend responde con un problema (para mostrarlo en pantalla).
// Soporta tanto JSON normal como FormData (para subir archivos) — cuando el
// body es un FormData, NO se fija el Content-Type manualmente: el navegador
// arma el boundary de multipart automáticamente.
export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken()
  const esFormData = options.body instanceof FormData

  const headers: Record<string, string> = {
    ...(esFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.error || 'Ocurrió un error. Intenta de nuevo.')
  }
  return data
}
