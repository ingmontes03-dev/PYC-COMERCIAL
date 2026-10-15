import { supabase } from '../supabaseClient'

// Compara dos objetos y devuelve solo los campos que cambiaron
export function diffCampos(antes = {}, despues = {}) {
  const cambios = {}
  Object.keys(despues).forEach((k) => {
    if (['id', 'created_at', 'valor_total'].includes(k)) return
    const a = antes[k] ?? null
    const d = despues[k] ?? null
    if (String(a) !== String(d)) cambios[k] = { antes: a, despues: d }
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
