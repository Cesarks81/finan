// La API vive en `/api` del mismo dominio: en Vercel es la función Python y en local Vite
// la reenvía al backend (ver `proxy` en vite.config.js). VITE_API_URL permite cambiarla.
const API_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
const TOKEN_KEY = 'finan-token'

/** Se emite cuando la API rechaza la sesión (401) para que la app vuelva a pedir la contraseña. */
export const UNAUTHORIZED_EVENT = 'finan:unauthorized'

export class ApiError extends Error {
  /** `retryAfter`: segundos de espera que indica la API (p. ej. en un bloqueo por intentos fallidos). */
  constructor(message, status, retryAfter = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Sin almacenamiento (modo privado): habrá que entrar de nuevo al recargar.
  }
}

// FastAPI devuelve `detail` como texto o como lista de errores de validación.
function errorMessage(detail, status) {
  if (Array.isArray(detail)) return detail.map((d) => d.msg.replace(/^Value error, /, '')).join('. ')
  if (typeof detail === 'string') return detail
  return `Error ${status} en la API`
}

async function request(path, { method = 'GET', params, body } = {}) {
  const url = new URL(API_URL + path, location.origin)
  for (const [key, value] of Object.entries(params ?? {})) {
    for (const item of [value].flat()) {
      if (item !== undefined && item !== null) url.searchParams.append(key, item)
    }
  }

  const token = readToken()
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  } catch {
    throw new ApiError('No se puede conectar con el servidor. Comprueba la conexión (en local, que el backend esté arrancado).', 0)
  }

  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    const retryAfter = Number(response.headers.get('Retry-After')) || null
    throw new ApiError(errorMessage(data?.detail, response.status), response.status, retryAfter)
  }
  return data
}

export const api = {
  authStatus: () => request('/auth/status'),
  async login(password) {
    const { token } = await request('/auth/login', { method: 'POST', body: { password } })
    writeToken(token)
  },
  logout: () => writeToken(null),
  getProjection: (params) => request('/projection', { params }),
  listFlows: (flowTypes) => request('/flows', { params: { flow_type: flowTypes } }),
  createFlow: (flow) => request('/flows', { method: 'POST', body: flow }),
  updateFlow: (id, changes) => request(`/flows/${id}`, { method: 'PATCH', body: changes }),
  deleteFlow: (id) => request(`/flows/${id}`, { method: 'DELETE' }),
  /** Borra todos los flujos de los tipos indicados; devuelve `{ deleted }`. */
  deleteFlows: (flowTypes) => request('/flows', { method: 'DELETE', params: { flow_type: flowTypes } }),
  getSettings: () => request('/settings'),
  updateSettings: (settings) => request('/settings', { method: 'PUT', body: settings }),
  /** Cambia solo los ajustes enviados (p. ej. `{ goal_amount }`). */
  patchSettings: (changes) => request('/settings', { method: 'PATCH', body: changes }),
  /** Copia de seguridad: ajustes y todos los flujos. */
  exportBackup: () => request('/backup'),
  /** Sustituye todos los datos por los de la copia; devuelve `{ flows }` (los importados). */
  importBackup: (backup) => request('/backup', { method: 'PUT', body: backup }),
}
