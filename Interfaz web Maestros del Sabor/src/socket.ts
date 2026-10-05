import { io, Socket } from 'socket.io-client'
import { SERVER_URL, getToken } from "./api";

let socket: Socket | null = null

// Conecta (o reutiliza) el socket autenticado con el token actual.
// Se llama al entrar a una pantalla de chat; se desconecta al cerrar sesión.
export function connectSocket(): Socket {
  if (socket && socket.connected) return socket

  socket = io(SERVER_URL, {
    auth: { token: getToken() },
    transports: ['websocket', 'polling'],
  })

  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}

export function getSocket(): Socket | null {
  return socket
}
