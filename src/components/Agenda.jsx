import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const hoy0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

// Rojo: vencida · Amarillo: hoy/mañana · Verde: a tiempo
export function semaforo(fecha, estado) {
  if (estado === 'Completado') return { txt: 'Completada', cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
  const dias = Math.round((new Date(fecha + 'T00:00:00') - hoy0()) / 86400000)
  if (dias < 0) return { txt: `Vencida (${-dias}d)`, cls: 'bg-red-500/15 text-red-300 border-red-500/40' }
  if (dias <= 1) return { txt: dias === 0 ? 'Vence hoy' : 'Vence mañana', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40' }
  return { txt: `A tiempo (${dias}d)`, cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' }
}

export default function Agenda({ user, cotizacionId }) {
  const [items, setItems] = useState([])
  const [titulo, setTitulo] = useState('')
  const [fecha, setFecha] = useState('')

  const cargar = async () => {
    let q = supabase.from('pendientes').select('*').order('fecha_limite')
    if (cotizacionId) q = q.eq('cotizacion_id', cotizacionId)
    const { data } = await q
    setItems(data || [])
  }
  useEffect(() => { cargar() }, [cotizacionId])

  const agregar = async (e) => {
    e.preventDefault()
    if (!titulo || !fecha) return
    await supabase.from('pendientes').insert({
      titulo, fecha_limite: fecha, usuario_email: user.email, cotizacion_id: cotizacionId || null,
    })
    setTitulo(''); setFecha(''); cargar()
  }

  const cambiarEstado = async (id, estado) => { await supabase.from('pendientes').update({ estado }).eq('id', id); cargar() }
  const borrar = async (id) => { await supabase.from('pendientes').delete().eq('id', id); cargar() }

  return (
    <div className="p-4">
      <form onSubmit={agregar} className="mb-4 flex flex-wrap gap-2">
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nueva tarea pendiente..."
          className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Agregar</button>
      </form>

      {!items.length && <p className="text-sm text-slate-400">No hay pendientes.</p>}
      <ul className="space-y-2">
        {items.map((t) => {
          const s = semaforo(t.fecha_limite, t.estado)
          return (
            <li key={t.id} className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${s.cls}`}>
              <div className="min-w-[160px] flex-1">
                <p className={`text-sm font-medium text-white ${t.estado === 'Completado' ? 'line-through opacity-60' : ''}`}>{t.titulo}</p>
                <p className="text-xs opacity-80">Límite: {t.fecha_limite} · {s.txt}</p>
              </div>
              <select value={t.estado} onChange={(e) => cambiarEstado(t.id, e.target.value)}
                className="rounded-md border border-white/10 bg-[#0b1026]/70 px-2 py-1 text-xs text-white">
                <option>Pendiente</option><option>En curso</option><option>Completado</option>
              </select>
              <button onClick={() => borrar(t.id)} className="text-xs text-red-300 hover:text-red-200">Eliminar</button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
