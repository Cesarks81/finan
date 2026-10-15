import { Briefcase, HandCoins, House, ShoppingBag } from 'lucide-react'

import { formatDate } from '@/lib/format'

export const FLOW_TYPES = {
  GFM: {
    code: 'GFM',
    name: 'Gasto Fijo Mensual',
    label: 'Gasto fijo',
    description: 'Gastos recurrentes cada mes: alquiler, luz, agua, comida, gasolina…',
    placeholder: 'Alquiler',
    income: false,
    icon: House,
  },
  GVM: {
    code: 'GVM',
    name: 'Gasto Variable Mensual',
    label: 'Gasto variable',
    description: 'Compras puntuales o caprichos no planificados.',
    placeholder: 'Auriculares',
    income: false,
    icon: ShoppingBag,
  },
  IFM: {
    code: 'IFM',
    name: 'Ingreso Fijo Mensual',
    label: 'Ingreso fijo',
    description: 'Ingresos estables cada mes, como la nómina.',
    placeholder: 'Nómina',
    income: true,
    icon: Briefcase,
  },
  IVM: {
    code: 'IVM',
    name: 'Ingreso Variable Temporal',
    label: 'Ingreso variable',
    description: 'Ingresos puntuales o temporales: trabajos extra, cobro de una deuda a plazos…',
    placeholder: 'Reparación',
    income: true,
    icon: HandCoins,
  },
}

export const FLOW_ORDER = ['GFM', 'GVM', 'IFM', 'IVM']
export const VARIABLE_TYPES = ['GVM', 'IVM']
export const FIXED_TYPES = ['GFM', 'IFM']

/** Resumen de la periodicidad de un flujo devuelto por la API. */
export function describeSchedule(flow) {
  if (flow.duration_months) return `${flow.duration_months} ${flow.duration_months === 1 ? 'mes' : 'meses'}`
  if (flow.is_recurring) return flow.end_date ? `Mensual hasta ${formatDate(flow.end_date)}` : 'Mensual'
  return 'Puntual'
}
