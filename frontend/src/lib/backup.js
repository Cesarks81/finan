/**
 * Copia de seguridad en archivo: la que da `GET /api/backup` (ajustes, flujos, inversiones y
 * revisiones) con las opciones de la gráfica de este dispositivo (`chart`, que la API no guarda),
 * como JSON legible. Importarla (`PUT /api/backup`) sustituye todos los datos.
 */

/** Las opciones de la gráfica (las de `FinanceDataProvider`) como van en la copia. */
export function chartBackup(chart) {
  return {
    split_lines: chart.splitLines,
    calendar: chart.calendar,
    real_terms: chart.realTerms,
    inflation: chart.inflation,
  }
}

/**
 * Aplica en este dispositivo las opciones de la gráfica de una copia (su `chart`, ya aceptado por
 * la API: las que falten toman el valor por defecto, como en ella).
 */
export function applyChartBackup(backup, chart) {
  chart.setSplitLines(backup.split_lines ?? false)
  chart.setCalendar(backup.calendar ?? false)
  chart.setRealTerms(backup.real_terms ?? false)
  chart.setInflation(backup.inflation ?? 2)
}

/**
 * Las opciones de la gráfica de una copia en palabras: «euros de hoy (inflación del 3 %) y vista
 * de calendario», o «ninguna» si no tiene ninguna activada.
 */
export function chartBackupText(backup) {
  const inflation = String(backup.inflation ?? 2).replace('.', ',')
  const options = [
    backup.real_terms && `euros de hoy (inflación del ${inflation} %)`,
    backup.split_lines && 'ingresos y gastos por separado',
    backup.calendar && 'vista de calendario',
  ].filter(Boolean)
  return options.length ? new Intl.ListFormat('es', { type: 'conjunction' }).format(options) : 'ninguna'
}

/** Archivo de la copia («finan-copia-2026-10-16.json»), con las opciones de la gráfica. */
export function backupFile(backup, chart) {
  const name = `finan-copia-${backup.exported_on}.json`
  // `chart` ya viene (null) de la API: se sustituye en su sitio, tras los ajustes.
  const data = { ...backup, chart: chartBackup(chart) }
  return new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' })
}

/**
 * Guarda el archivo. En móvil abre la hoja de compartir del sistema (en el iPhone, «Guardar en
 * Archivos», AirDrop, Mail…), si admite archivos; si no, o en PC, lo descarga. Hay que llamarla
 * sin esperas desde el toque (el navegador solo deja compartir justo después de él). Devuelve
 * false si se cancela la hoja de compartir.
 */
export async function saveFile(file) {
  const touch = window.matchMedia('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return true
    } catch (err) {
      if (err.name === 'AbortError') return false
      // Si no deja compartir, se descarga.
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

/** Lee un archivo elegido por el usuario: la copia, o un error si no es una copia de finan. */
export async function readBackup(file) {
  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    data = null
  }
  if (data?.app !== 'finan' || !Array.isArray(data.flows) || typeof data.settings !== 'object' || !data.settings) {
    throw new Error('Este archivo no es una copia de seguridad de finan.')
  }
  // Las copias anteriores no traen las opciones de la gráfica: al importarlas no se tocan.
  if (typeof data.chart !== 'object') data.chart = null
  return data
}
