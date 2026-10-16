import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { diasEntre, hoyStr, soloFecha } from '../lib/fechas'
import { enlaceGoogleCalendar } from '../lib/googleCalendar'

const DIAS_ADELANTE = 7 // "esta semana" = hoy + los próximos 7 días
const DIAS_SEGUIMIENTO = 7 // una cotización Pendiente con 7+ días desde su envío pide seguimiento
const MAX_FILAS = 5

const ESTILOS = {
  rojo: 'border-red-500/40 bg-red-500/10',
  amarillo: 'border-amber-500/40 bg-amber-500/10',
  verde: 'border-emerald-500/40 bg-emerald-500/10',
  azul: 'border-blue-500/40 bg-blue-500/10',
}
const TITULOS = { rojo: 'text-red-300', amarillo: 'text-amber-300', verde: 'text-emerald-300', azul: 'text-blue-300' }

function Columna({ color, titulo, items, vacio, render }) {
  return (
    <div className={`rounded-xl border p-3 ${ESTILOS[color]}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-xs font-semibold uppercase tracking-wide ${TITULOS[color]}`}>{titulo}</p>
        <span className={`rounded-full bg-black/20 px-2 py-0.5 text-xs font-semibold ${TITULOS[color]}`}>{items.length}</span>
      </div>
      {!items.length && <p className="text-xs text-slate-400">{vacio}</p>}
      <ul className="space-y-2">
        {items.slice(0, MAX_FILAS).map((it) => (
          <li key={it.id} className="text-sm leading-tight">{render(it)}</li>
        ))}
      </ul>
      {items.length > MAX_FILAS && <p className="mt-2 text-xs text-slate-400">+ {items.length - MAX_FILAS} más</p>}
    </div>
  )
}

export default function PanelAlertas({ cotizaciones = [], version = 0, onVencidas, onVerAgenda }) {
  const [alertas, setAlertas] = useState([])
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)

  // Se traen TODAS las alertas y se filtra aquí: así no hay filtros de fecha ni de estado
  // en la consulta que puedan dejar filas ocultas (por ejemplo estado NULL).
  useEffect(() => {
    let activo = true
    setCargando(true)
    supabase.from('alertas').select('*').limit(1000).then(({ data, error }) => {
      if (!activo) return
      if (error) { setError(`No se pudieron cargar las alertas: ${error.message}`); setAlertas([]) }
      else { setError(''); setAlertas(data || []) }
      setCargando(false)
    })
    return () => { activo = false }
  }, [version])

  const hoy = hoyStr()

  const { vencidas, deHoy, semana, despues, sinFecha } = useMemo(() => {
    const abiertas = alertas.filter((a) => a.estado !== 'Completado')
    const conFecha = abiertas
      .filter((a) => a.fecha_limite)
      .map((a) => ({ ...a, dias: diasEntre(hoy, soloFecha(a.fecha_limite)) }))
      .sort((a, b) => a.dias - b.dias)
    return {
      vencidas: conFecha.filter((a) => a.dias < 0),
      deHoy: conFecha.filter((a) => a.dias === 0),
      semana: conFecha.filter((a) => a.dias > 0 && a.dias <= DIAS_ADELANTE),
      despues: conFecha.filter((a) => a.dias > DIAS_ADELANTE).length,
      sinFecha: abiertas.filter((a) => !a.fecha_limite).length,
    }
  }, [alertas, hoy])

  const seguimientos = useMemo(
    () => cotizaciones
      .filter((c) => c.estado === 'Pendiente' && c.fecha_envio)
      .map((c) => ({ ...c, dias: diasEntre(soloFecha(c.fecha_envio), hoy) }))
      .filter((c) => c.dias >= DIAS_SEGUIMIENTO)
      .sort((a, b) => b.dias - a.dias),
    [cotizaciones, hoy]
  )

  useEffect(() => { onVencidas?.(vencidas.length) }, [vencidas.length, onVencidas])

  // Tarjeta de alerta: tarea, cliente y quién la creó
  const alerta = (a, extra) => (
    <>
      <span className="text-white">{a.titulo || a.descripcion || '(sin título)'}</span>
      <a href={enlaceGoogleCalendar(a)} target="_blank" rel="noreferrer" className="ml-1 text-xs text-blue-300 hover:underline"
        title="Agregar a Google Calendar">+ Calendar</a>
      <span className="block text-xs text-slate-300">
        {a.cliente ? <>Cliente: <b>{a.cliente}</b></> : 'Sin cliente'}
        {a.n_cotizacion ? ` · Cot. ${a.n_cotizacion}` : ''}
      </span>
      <span className="block text-xs text-slate-400">Creada por: {a.usuario_nombre || a.usuario_email || '—'}</span>
      {extra}
    </>
  )

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Alertas y pendientes</h2>
        <button onClick={onVerAgenda} className="text-xs text-blue-300 hover:underline">Ver y administrar todas →</button>
      </div>

      {error && <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      {cargando && !alertas.length && <p className="mb-2 text-xs text-slate-400">Cargando alertas…</p>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Columna color="rojo" titulo="Vencidas" items={vencidas} vacio="Nada vencido"
          render={(a) => alerta(a, <span className="block text-xs text-red-300">Venció hace {-a.dias} día(s)</span>)} />
        <Columna color="amarillo" titulo="Vencen hoy" items={deHoy} vacio="Nada para hoy"
          render={(a) => alerta(a)} />
        <Columna color="verde" titulo={`Próximos ${DIAS_ADELANTE} días`} items={semana} vacio="Sin pendientes esta semana"
          render={(a) => alerta(a, <span className="block text-xs text-emerald-300">{soloFecha(a.fecha_limite)} · en {a.dias} día(s)</span>)} />
        <Columna color="azul" titulo="Seguimiento comercial" items={seguimientos} vacio="Sin cotizaciones por seguir"
          render={(c) => (
            <>
              <span className="text-white">Cot. {c.n_cotizacion || '—'}</span>
              <span className="block text-xs text-slate-300">Cliente: <b>{c.cliente || 'sin cliente'}</b></span>
              {c.usuario_email && <span className="block text-xs text-slate-400">Vendedor: {c.usuario_email}</span>}
              <span className="block text-xs text-blue-300">Pendiente hace {c.dias} días</span>
            </>
          )} />
      </div>

      {(despues > 0 || sinFecha > 0) && (
        <p className="mt-3 text-xs text-slate-400">
          {despues > 0 && `${despues} alerta(s) más adelante`}
          {despues > 0 && sinFecha > 0 && ' · '}
          {sinFecha > 0 && `${sinFecha} sin fecha límite`}
          {' '}(se ven completas en la pestaña de Agenda).
        </p>
      )}
    </section>
  )
}
