export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const limpia = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Acepta 10, '10', 'Octubre', 'octubre' o '2026-10-15' y devuelve 1-12 ('' si no se reconoce)
export function mesNumero(v) {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number') return v >= 1 && v <= 12 ? v : ''
  const s = String(v).trim()
  if (/^\d{1,2}$/.test(s)) { const n = Number(s); return n >= 1 && n <= 12 ? n : '' }
  if (/^\d{4}-\d{2}/.test(s)) return Number(s.slice(5, 7)) || ''
  const i = MESES.findIndex((m) => limpia(m) === limpia(s))
  return i >= 0 ? i + 1 : ''
}

// Para mostrar: 10 -> 'Octubre'
export function mesNombre(v) {
  const n = mesNumero(v)
  return n ? MESES[n - 1] : (v ?? '')
}

// Fechas SIEMPRE en hora local (toISOString() las corre un día después de las 7 pm en Colombia)
const dos = (n) => String(n).padStart(2, '0')
export const fmtFecha = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
export const hoyStr = () => fmtFecha(new Date())
export const soloFecha = (v) => (v ? String(v).slice(0, 10) : '')
export const diasEntre = (desde, hasta) =>
  Math.round((new Date(hasta + 'T00:00:00') - new Date(desde + 'T00:00:00')) / 86400000)
