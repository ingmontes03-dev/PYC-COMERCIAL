import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const COLOR = {
  CREAR: 'bg-emerald-500/15 text-emerald-300',
  EDITAR: 'bg-amber-500/15 text-amber-300',
  ELIMINAR: 'bg-red-500/15 text-red-300',
}

export default function Historial({ registroId, refresh }) {
  const [logs, setLogs] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const cargar = async () => {
      setCargando(true)
      let q = supabase.from('historial_auditoria').select('*').order('fecha_hora', { ascending: false }).limit(200)
      if (registroId) q = q.eq('registro_id', registroId)
      const { data } = await q
      setLogs(data || [])
      setCargando(false)
    }
    cargar()
  }, [registroId, refresh])

  if (cargando) return <p className="p-4 text-sm text-slate-400">Cargando historial...</p>
  if (!logs.length) return <p className="p-4 text-sm text-slate-400">Aún no hay cambios registrados.</p>

  return (
    <ul className="divide-y divide-white/5">
      {logs.map((l) => (
        <li key={l.id} className="p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR[l.accion]}`}>{l.accion}</span>
            <span className="font-medium text-white">{l.usuario_email}</span>
            <span className="text-slate-400">· Cotización {l.n_cotizacion || '—'}</span>
            <span className="ml-auto text-xs text-slate-500">{new Date(l.fecha_hora).toLocaleString('es-CO')}</span>
          </div>
          {l.campos_modificados && (
            <div className="mt-2 grid gap-1 text-xs text-slate-300">
              {Object.entries(l.campos_modificados).map(([campo, v]) => (
                <div key={campo} className="rounded bg-white/5 px-2 py-1">
                  <span className="text-violet-300">{campo}</span>:{' '}
                  {v && typeof v === 'object' && 'antes' in v ? (
                    <>
                      <span className="text-red-300 line-through">{String(v.antes ?? '—')}</span>
                      {' → '}
                      <span className="text-emerald-300">{String(v.despues ?? '—')}</span>
                    </>
                  ) : (
                    <span>{String(v ?? '—')}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
