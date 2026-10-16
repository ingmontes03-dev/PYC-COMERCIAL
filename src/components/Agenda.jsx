import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { diasEntre, hoyStr, soloFecha } from '../lib/fechas'
import { apiDisponible, crearEventoGoogle, descargarIcs, enlaceGoogleCalendar } from '../lib/googleCalendar'

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
const boton = 'rounded-md border border-white/15 px-2 py-1 text-xs text-slate-100 hover:bg-white/10'

export default function Agenda({ user, nombre, cotizacionId, nCotizacion, cliente, clientes = [], onChange }) {
  const [items, setItems] = useState([])
  const [titulo, setTitulo] = useState('')
  const [fecha, setFecha] = useState('')
  const [empresa, setEmpresa] = useState(cliente || '')
  const [aGoogle, setAGoogle] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
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

  const sincronizar = async (alerta) => {
    const id = await crearEventoGoogle(alerta)
    await supabase.from('alertas').update({ gcal_event_id: id }).eq('id', alerta.id)
  }

  const agregar = async (e) => {
    e.preventDefault()
    setAviso('')
    if (!titulo.trim() || !fecha) { setError('Escribe la tarea y la fecha límite.'); return }

    const { data, error } = await supabase
      .from('alertas')
      .insert({
        titulo: titulo.trim(),
        fecha_limite: fecha,
        estado: 'Pendiente',
        cliente: (cliente || empresa).trim() || null,
        usuario_email: user.email,
        usuario_nombre: nombre || user.email,
        cotizacion_id: cotizacionId || null,
        n_cotizacion: nCotizacion || null,
      })
      .select()
      .single()
    if (error) { setError(`No se pudo guardar la alerta: ${error.message}`); return }

    setTitulo(''); setFecha(''); setError('')

    if (aGoogle) {
      if (apiDisponible) {
        try { await sincronizar(data); setAviso('Alerta guardada y sincronizada con Google Calendar.') }
        catch (err) { setError(`La alerta se guardó, pero no se pudo sincronizar con Google Calendar: ${err.message}`) }
      } else {
        window.open(enlaceGoogleCalendar(data), '_blank', 'noopener')
        setAviso('Alerta guardada. Se abrió Google Calendar para que confirmes el evento.')
      }
    }
    refrescar()
  }

  const sincronizarFila = async (t) => {
    try { await sincronizar(t); setError(''); setAviso('Evento creado en Google Calendar.'); refrescar() }
    catch (err) { setError(`No se pudo sincronizar con Google Calendar: ${err.message}`) }
  }

  const cambiarEstado = async (id, estado) => {
    const { data, error } = await supabase.from('alertas').update({ estado }).eq('id', id).select('id')
    if (error) setError(error.message)
    else if (!data?.length) setError('Solo quien creó la alerta (o el super admin) puede modificarla.')
    refrescar()
  }

  const borrar = async (id) => {
    const { data, error } = await supabase.from('alertas').delete().eq('id', id).select('id')
    if (error) setError(error.message)
    else if (!data?.length) setError('Solo quien creó la alerta (o el super admin) puede eliminarla.')
    refrescar()
  }

  const conteo = items.reduce((a, t) => {
    const s = semaforo(t.fecha_limite, t.estado).nivel
    a[s] = (a[s] || 0) + 1
    return a
  }, {})

  return (
    <div className="p-4">
      <form onSubmit={agregar} className="mb-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nueva tarea o seguimiento..."
            className={`min-w-[200px] flex-1 ${input}`} />
          {!cliente && (
            <>
              <input list="clientes-agenda" value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Empresa / cliente"
                className={`w-52 ${input}`} />
              <datalist id="clientes-agenda">{clientes.map((c) => <option key={c} value={c} />)}</datalist>
            </>
          )}
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={input} />
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Agregar</button>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={aGoogle} onChange={(e) => setAGoogle(e.target.checked)} />
          {apiDisponible ? 'Sincronizar automáticamente con Google Calendar' : 'Abrir Google Calendar al guardar para agregar el evento'}
        </label>
      </form>

      {error && <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      {aviso && <p className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{aviso}</p>}

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
              <div className="min-w-[200px] flex-1">
                <p className={`text-sm font-medium text-white ${t.estado === 'Completado' ? 'line-through opacity-60' : ''}`}>{texto}</p>
                <p className="text-xs opacity-90">
                  Límite: {t.fecha_limite ? soloFecha(t.fecha_limite) : '—'} · {s.txt}
                  {t.n_cotizacion ? ` · Cotización ${t.n_cotizacion}` : ''}
                </p>
                <p className="text-xs opacity-80">
                  Cliente: <b>{t.cliente || '—'}</b> · Creada por: <b>{t.usuario_nombre || t.usuario_email || '—'}</b>
                </p>
              </div>

              {t.fecha_limite && (
                <div className="flex flex-wrap items-center gap-1">
                  {t.gcal_event_id ? (
                    <span className="rounded-md bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300">✓ En Google Calendar</span>
                  ) : apiDisponible ? (
                    <button type="button" onClick={() => sincronizarFila(t)} className={boton}>Sincronizar Google Calendar</button>
                  ) : (
                    <a href={enlaceGoogleCalendar(t)} target="_blank" rel="noreferrer" className={boton}>Google Calendar</a>
                  )}
                  <button type="button" onClick={() => descargarIcs(t)} className={boton} title="Descargar archivo .ics (Google, Outlook, Apple)">.ics</button>
                </div>
              )}

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
