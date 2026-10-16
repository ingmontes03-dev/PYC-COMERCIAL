import { supabase } from '../supabaseClient'

// Normaliza cualquier valor para comparar (incluye arrays/objetos como los ítems)
const norm = (v) => {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// Compara dos objetos y devuelve solo los campos que cambiaron
export function diffCampos(antes = {}, despues = {}) {
  const cambios = {}
  Object.keys(despues).forEach((k) => {
    if (['id', 'created_at'].includes(k)) return
    if (norm(antes[k]) !== norm(despues[k])) {
      cambios[k] = { antes: antes[k] ?? null, despues: despues[k] ?? null }
    }
  })
  return cambios
}

export async function registrarAuditoria({ usuario_email, accion, registro_id, n_cotizacion, campos_modificados }) {
  const { error } = await supabase.from('historial_auditoria').insert({
    usuario_email,
    accion,
    registro_id,
    n_cotizacion,
    campos_modificados,
    fecha_hora: new Date().toISOString(),
  })
  if (error) console.error('Error registrando auditoría:', error.message)
}
