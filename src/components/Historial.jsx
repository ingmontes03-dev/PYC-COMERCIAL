import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { mesNombre } from '../lib/fechas'

const COLOR = {
  CREAR: 'bg-emerald-500/15 text-emerald-300',
  EDITAR: 'bg-amber-500/15 text-amber-300',
  ELIMINAR: 'bg-red-500/15 text-red-300',
}
const select = 'rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'

const fmt = (campo, v) => {
  if (v === null || v === undefined || v === '') return '—'
  if (campo === 'mes') return mesNombre(v)
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.length > 140 ? `${s.slice(0, 140)}…` : s
}

// Registro de auditoría (tabla auditoria_logs). Con registroId muestra solo el historial de esa cotización.
export default function Historial({ registroId, refresh }) {
  const [logs, setLogs] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [accion, setAccion] = useState('Todas')
  const [modulo, setModulo] = useState('Todos')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    let activo = true
    const cargar = async () => {
      setCargando(true)
      let q = supabase.from('auditoria_logs').select('*').order('fecha_hora', { ascending: false }).limit(500)
      if (registroId) q = q.eq('registro_id', registroId)
      const { data, error } = await q
      if (!activo) return
      if (error) { setError(`No se pudo cargar la auditoría: ${error.message}`); setLogs([]) }
      else { setError(''); setLogs(data || []) }
      setCargando(false)
    }
    cargar()
    return () => { activo = false }
  }, [registroId, refresh])

  const modulos = useMemo(() => [...new Set(logs.map((l) => l.modulo).filter(Boolean))].sort(), [logs])

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return logs.filter((l) =>
      (accion === 'Todas' || l.accion === accion) &&
      (modulo === 'Todos' || l.modulo === modulo) &&
      (!q || [l.usuario_email, l.usuario_nombre, l.detalle, l.modulo].some((v) => (v || '').toLowerCase().includes(q)))
    )
  }, [logs, accion, modulo, busqueda])

  return (
    <div>
      {!registroId && (
        <div className="flex flex-wrap items-center gap-3 p-4 pb-0">
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar usuario o detalle…" className={`${select} min-w-[220px] flex-1`} />
          <select value={accion} onChange={(e) => setAccion(e.target.value)} className={select}>
            {['Todas', 'CREAR', 'EDITAR', 'ELIMINAR'].map((a) => <option key={a}>{a}</option>)}
          </select>
          <select value={modulo} onChange={(e) => setModulo(e.target.value)} className={select}>
            <option>Todos</option>
            {modulos.map((m) => <option key={m}>{m}</option>)}
          </select>
          <span className="text-xs text-slate-400">{filtrados.length} de {logs.length} movimientos</span>
        </div>
      )}

      {error && <p className="m-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      {cargando && <p className="p-4 text-sm text-slate-400">Cargando historial...</p>}
      {!cargando && !error && !filtrados.length && <p className="p-4 text-sm text-slate-400">Aún no hay movimientos registrados.</p>}

      <ul className="divide-y divide-white/5">
        {filtrados.map((l) => {
          const campos = l.cambios && typeof l.cambios === 'object' ? Object.entries(l.cambios) : []
          return (
            <li key={l.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR[l.accion] || 'bg-white/10 text-slate-300'}`}>{l.accion}</span>
                <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300">{l.modulo || '—'}</span>
                <span className="font-medium text-white">{l.usuario_nombre || l.usuario_email || 'sistema'}</span>
                {l.usuario_nombre && l.usuario_email && <span className="text-xs text-slate-500">{l.usuario_email}</span>}
                <span className="ml-auto text-xs text-slate-400">{new Date(l.fecha_hora).toLocaleString('es-CO')}</span>
              </div>
              {l.detalle && <p className="mt-1 text-sm text-slate-300">{l.detalle}</p>}

              {!!campos.length && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-blue-300">Ver detalle ({campos.length} campo{campos.length === 1 ? '' : 's'})</summary>
                  <div className="mt-2 grid gap-1 text-xs text-slate-300">
                    {campos.map(([campo, v]) => (
                      <div key={campo} className="rounded bg-white/5 px-2 py-1">
                        <span className="text-violet-300">{campo}</span>:{' '}
                        {l.accion === 'EDITAR' && v && typeof v === 'object' && 'antes' in v ? (
                          <>
                            <span className="text-red-300 line-through">{fmt(campo, v.antes)}</span>
                            {' → '}
                            <span className="text-emerald-300">{fmt(campo, v.despues)}</span>
                          </>
                        ) : (
                          <span>{fmt(campo, v)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
