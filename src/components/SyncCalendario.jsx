import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { hoyStr, soloFecha } from '../lib/fechas'
import { apiDisponible, conectarGoogle, sincronizarAlerta, tokenVigente } from '../lib/googleCalendar'

// Sincroniza SOLA con Google Calendar todas las alertas tuyas que aún no están en el calendario o que cambiaron:
// las que creas a mano y las que genera el sistema (fecha de entrega, fecha anticipada de entrega, fechas especiales).
// Google exige que autorices una vez con un clic (dura ~1 hora por sesión); después todo es automático.
export default function SyncCalendario({ user, version = 0 }) {
  const [conectado, setConectado] = useState(() => tokenVigente())
  const [ultimo, setUltimo] = useState('')
  const [error, setError] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const corriendo = useRef(false)

  const sincronizar = useCallback(async () => {
    if (!apiDisponible || corriendo.current) return
    if (!tokenVigente()) { setConectado(false); return }
    corriendo.current = true
    setTrabajando(true)
    try {
      // Pendientes desde hoy que no están en el calendario o que cambiaron después de sincronizarse
      const { data, error: e } = await supabase
        .from('alertas').select('*')
        .eq('usuario_id', user.id)
        .gte('fecha_limite', hoyStr())
        .or('gcal_event_id.is.null,gcal_stale.eq.true')
        .limit(200)
      if (e) throw new Error(e.message)
      const lista = (data || []).filter((a) => a.estado !== 'Completado' && soloFecha(a.fecha_limite))
      let n = 0
      for (const a of lista) {
        await sincronizarAlerta(a)
        n += 1
      }
      setError('')
      if (n) setUltimo(`${n} alerta${n === 1 ? '' : 's'} enviada${n === 1 ? '' : 's'} a Google Calendar`)
    } catch (err) {
      setError(err.message)
    } finally {
      corriendo.current = false
      setTrabajando(false)
    }
  }, [user.id])

  // Al abrir, cuando cambian las alertas (se crea / edita una cotización o una alerta) y cada minuto
  useEffect(() => {
    sincronizar()
    const t = setInterval(() => { setConectado(tokenVigente()); sincronizar() }, 60000)
    return () => clearInterval(t)
  }, [sincronizar, version])

  const conectar = async () => {
    try { await conectarGoogle(); setConectado(true); setError(''); sincronizar() }
    catch (err) { setError(err.message) }
  }

  if (!apiDisponible) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-400">
        📅 Para que las alertas (incluidas las fechas de entrega) pasen solas a Google Calendar, configura <b>VITE_GOOGLE_CLIENT_ID</b> en Vercel
        (ver README). Mientras tanto, cada alerta tiene sus botones «Google Calendar» y «.ics».
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm">
      <span className="font-semibold text-sky-200">📅 Google Calendar</span>
      {conectado ? (
        <span className="text-xs text-emerald-300">✓ Conectado: tus alertas y fechas de entrega se envían solas{trabajando ? ' (sincronizando…)' : ''}</span>
      ) : (
        <button onClick={conectar} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500">
          Conectar Google Calendar
        </button>
      )}
      {!conectado && <span className="text-xs text-slate-400">Autoriza una vez por sesión; después la sincronización es automática.</span>}
      {ultimo && <span className="text-xs text-slate-400">{ultimo}</span>}
      {error && <span className="w-full text-xs text-red-300">No se pudo sincronizar: {error}</span>}
    </div>
  )
}
