import { supabase } from '../supabaseClient'

// columnas: [{ k: 'campo', t: 'Título', f?: (fila) => valor }]
const valorDe = (c, fila) => (c.f ? c.f(fila) : fila[c.k]) ?? ''

const descargar = (blob, nombre) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const sello = () => {
  const d = new Date()
  const dos = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}`
}

// CSV con BOM (Excel lo abre con tildes bien)
export function descargarCsv(nombre, columnas, filas) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`
  const lineas = [columnas.map((c) => esc(c.t)).join(','), ...filas.map((f) => columnas.map((c) => esc(valorDe(c, f))).join(','))]
  descargar(new Blob(['\ufeff' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${nombre}-${sello()}.csv`)
}

// Excel: tabla HTML con extensión .xls. Excel la abre directamente y conserva los textos tal cual
// (teléfonos con ceros, facturas, etc.). Puede mostrar un aviso de "formato y extensión no coinciden": es normal, pulsa Sí.
export function descargarExcel(nombre, columnas, filas) {
  const h = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const cab = columnas.map((c) => `<th style="background:#1b2150;color:#fff">${h(c.t)}</th>`).join('')
  const cuerpo = filas
    .map((f) => `<tr>${columnas.map((c) => {
      const v = valorDe(c, f)
      return `<td style="mso-number-format:'\\@'">${h(v)}</td>`
    }).join('')}</tr>`)
    .join('')
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${cab}</tr></thead><tbody>${cuerpo}</tbody></table></body></html>`
  descargar(new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' }), `${nombre}-${sello()}.xls`)
}

// Deja constancia en la auditoría de quién exportó qué (no bloquea la descarga si falla)
export async function registrarExportacion(modulo, detalle) {
  try { await supabase.rpc('registrar_evento', { p_accion: 'EXPORTAR', p_modulo: modulo, p_detalle: detalle }) } catch { /* sin auditoría */ }
}
