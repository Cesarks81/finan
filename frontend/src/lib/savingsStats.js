/**
 * Evolución del ahorro de un periodo al siguiente (resumen de la gráfica).
 *
 * Con lo ahorrado en cada periodo (ingresos − gastos), p. ej. 60 €, 90 € y 160 € en tres meses:
 * - `average` («Media de ahorro»): media de lo que cambia el ahorro de un periodo al siguiente,
 *   en proporción: 60→90 es +50 %, 90→160 es +77,8 %, y la media, +63,9 %.
 * - `trend` («Tendencia»): si ese cambio se acelera o se frena, en puntos porcentuales por
 *   periodo. Es la pendiente de la recta que mejor se ajusta a todos los cambios: con dos, su
 *   diferencia (de +50 % a +77,8 % son +27,8 puntos); con más, los tiene en cuenta todos (la
 *   media de diferencias consecutivas solo dependería del primero y el último).
 *
 * Un periodo con ahorro 0 no sirve de base (no hay porcentaje desde 0) y se salta; con base
 * negativa se divide por su valor absoluto, para que mejorar siempre dé un cambio positivo.
 * Devuelven `null` si no hay datos suficientes (dos cambios para la tendencia).
 */
export function savingsTrend(apiPoints) {
  const savings = apiPoints.map((p) => Math.round((Number(p.income) - Number(p.expense)) * 100) / 100)
  const changes = []
  for (let i = 1; i < savings.length; i++) {
    const previous = savings[i - 1]
    if (previous !== 0) changes.push((savings[i] - previous) / Math.abs(previous))
  }
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    average: changes.length ? mean(changes) : null,
    trend: changes.length >= 2 ? slope(changes) : null,
  }
}

/** Pendiente por mínimos cuadrados de `values` frente a su posición (0, 1, 2…). */
function slope(values) {
  const n = values.length
  const xMean = (n - 1) / 2
  const yMean = values.reduce((sum, value) => sum + value, 0) / n
  let numerator = 0
  let denominator = 0
  values.forEach((value, x) => {
    numerator += (x - xMean) * (value - yMean)
    denominator += (x - xMean) ** 2
  })
  return numerator / denominator
}
