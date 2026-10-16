import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { diasEntre, hoyStr, soloFecha } from '../lib/fechas'

// Rojo: vencida · Amarillo: vence hoy/mañana · Verde: a tiempo
export function semaforo(fecha, estado) {
  if (estado === 'Completado') {
    return { nivel: 'ok', txt: 'Completada', cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
  }
  if (!fecha) {
    return { nivel: 'sin', txt: 'Sin fecha límite', cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
  }
  const dias = diasEntre(hoyStr(), soloFecha(fecha))
  if (dias < 0) return { nivel: 'rojo', txt: `Vencida (${-dias}d)`, cls: 'bg-red-500/15 text-red-300 border-red-500/40' }
  if (dias <= 1) return { nivel: 'amarillo', txt: dias === 0 ? 'Vence hoy' : 'Vence mañana', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40' }
  return { nivel: 'verde', txt: `A tiempo (${dias}d)`, cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' }
}

const input = 'rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'

export default function Agenda({ user, cotizacionId, nCotizacion, onChange }) {
  const [items, setItems] = useState([])
  const [titulo, setTitulo] = useState('')
  const [fecha, setFecha] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    let q = supabase.from('alertas').select('*')
    if (cotizacionId) q = q.eq('cotizacion_id', cotizacionId)
    const { data, error } = await q
    if (error) {
      setError(`No se pudieron cargar las alertas: ${error.message}`)
      setItems([])
    } else {
      // Orden en el cliente: así no se oculta ninguna fila aunque falte la fecha
      const ordenadas = (data || []).slice().sort((a, b) =>
        soloFecha(a.fecha_limite || '9999-12-31').localeCompare(soloFecha(b.fecha_limite || '9999-12-31'))
      )
      setItems(ordenadas)
      setError('')
    }
    setCargando(false)
  }, [cotizacionId])

  useEffect(() => { cargar() }, [cargar])

  const refrescar = async () => { await cargar(); onChange?.() }

  const agregar = async (e) => {
    e.preventDefault()
    if (!titulo.trim() || !fecha) { setError('Escribe la tarea y la fecha límite.'); return }
    const { error } = await supabase.from('alertas').insert({
      titulo: titulo.trim(),
      fecha_limite: fecha,
      estado: 'Pendiente',
      usuario_email: user.email,
      cotizacion_id: cotizacionId || null,
      n_cotizacion: nCotizacion || null,
    })
    if (error) { setError(`No se pudo guardar la alerta: ${error.message}`); return }
    setTitulo(''); setFecha(''); setError('')
    refrescar()
  }

  const cambiarEstado = async (id, estado) => {
    const { error } = await supabase.from('alertas').update({ estado }).eq('id', id)
    if (error) setError(error.message)
    refrescar()
  }

  const borrar = async (id) => {
    const { error } = await supabase.from('alertas').delete().eq('id', id)
    if (error) setError(error.message)
    refrescar()
  }

  const conteo = items.reduce((a, t) => {
    const s = semaforo(t.fecha_limite, t.estado).nivel
    a[s] = (a[s] || 0) + 1
    return a
  }, {})

  return (
    <div className="p-4">
      <form onSubmit={agregar} className="mb-4 flex flex-wrap gap-2">
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nueva tarea pendiente..."
          className={`min-w-[200px] flex-1 ${input}`} />
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={input} />
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Agregar</button>
      </form>

      {error && <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      {!!items.length && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-red-500/15 px-2 py-1 text-red-300">Vencidas: {conteo.rojo || 0}</span>
          <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-300">Hoy / mañana: {conteo.amarillo || 0}</span>
          <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-300">A tiempo: {conteo.verde || 0}</span>
        </div>
      )}

      {cargando && <p className="text-sm text-slate-400">Cargando alertas…</p>}
      {!cargando && !items.length && !error && <p className="text-sm text-slate-400">No hay alertas.</p>}

      <ul className="space-y-2">
        {items.map((t) => {
          const s = semaforo(t.fecha_limite, t.estado)
          const texto = t.titulo || t.descripcion || '(sin título)'
          return (
            <li key={t.id} className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${s.cls}`}>
              <div className="min-w-[160px] flex-1">
                <p className={`text-sm font-medium text-white ${t.estado === 'Completado' ? 'line-through opacity-60' : ''}`}>{texto}</p>
                <p className="text-xs opacity-80">
                  Límite: {t.fecha_limite ? soloFecha(t.fecha_limite) : '—'} · {s.txt}
                  {t.n_cotizacion ? ` · Cotización ${t.n_cotizacion}` : ''}
                </p>
              </div>
              <select value={t.estado || 'Pendiente'} onChange={(e) => cambiarEstado(t.id, e.target.value)}
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
