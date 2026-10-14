const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// FastAPI devuelve `detail` como texto o como lista de errores de validación.
function errorMessage(detail, status) {
  if (Array.isArray(detail)) return detail.map((d) => d.msg.replace(/^Value error, /, '')).join('. ')
  if (typeof detail === 'string') return detail
  return `Error ${status} en la API`
}

async function request(path, { method = 'GET', params, body } = {}) {
  const url = new URL(API_URL + path)
  for (const [key, value] of Object.entries(params ?? {})) {
    for (const item of [value].flat()) {
      if (item !== undefined && item !== null) url.searchParams.append(key, item)
    }
  }

  let response
  try {
    response = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(`No se puede conectar con la API en ${API_URL}. ¿Está arrancado el backend?`, 0)
  }

  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(errorMessage(data?.detail, response.status), response.status)
  return data
}

export const api = {
  getProjection: (params) => request('/projection', { params }),
  listFlows: (flowTypes) => request('/flows', { params: { flow_type: flowTypes } }),
  createFlow: (flow) => request('/flows', { method: 'POST', body: flow }),
  updateFlow: (id, changes) => request(`/flows/${id}`, { method: 'PATCH', body: changes }),
  deleteFlow: (id) => request(`/flows/${id}`, { method: 'DELETE' }),
}
