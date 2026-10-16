import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { MESES, mesNombre, mesNumero, soloFecha } from '../lib/fechas'
import { ROLES, esMiembro, tiene } from '../lib/permisos'
import CotizacionForm from './CotizacionForm'
import PanelAlertas from './PanelAlertas'
import Agenda from './Agenda'
import Cotizador from './Cotizador'
import BaseDatos from './BaseDatos'
import Historial from './Historial'
import Usuarios from './Usuarios'

const cop = (n) => (Number(n) || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const pct = (n) => (n === null || n === undefined || n === '' ? '—' : `${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 2 })}%`)
const sel = 'rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'

const ESTADO_CLS = {
  Aprobado: 'bg-emerald-500/15 text-emerald-300',
  Negado: 'bg-red-500/15 text-red-300',
  Pendiente: 'bg-amber-500/15 text-amber-300',
}

function Kpi({ titulo, valor, sub }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <p className="text-xs uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-white">{valor}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

export default function Dashboard({ user, perfil }) {
  const [cotizaciones, setCotizaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [filtroMes, setFiltroMes] = useState('Todos')
  const [form, setForm] = useState(null) // null | {} (nueva) | registro (editar)
  const [tab, setTab] = useState('agenda')
  const [versionAlertas, setVersionAlertas] = useState(0)
  const [vencidas, setVencidas] = useState(0)
  const [pendientesDe, setPendientesDe] = useState(null) // cotización cuyos pendientes se ven en el modal
  const [historialDe, setHistorialDe] = useState(null)

  const superAdmin = perfil.rol === 'super_admin'
  const miembro = esMiembro(perfil)
  const verTodas = tiene(perfil, 'ver_todas_cotizaciones')
  const puedeCrear = tiene(perfil, 'cotizaciones_crear')
  const puedeEditar = tiene(perfil, 'cotizaciones_editar')
  const puedeEliminar = tiene(perfil, 'cotizaciones_eliminar')
  const nombre = perfil.nombre || user.email

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error } = await supabase.from('cotizaciones').select('*').order('created_at', { ascending: false }).limit(2000)
    if (error) { setError(`No se pudieron cargar las cotizaciones: ${error.message}`); setCotizaciones([]) }
    else { setError(''); setCotizaciones(data || []) }
    setCargando(false)
  }, [])

  useEffect(() => {
    if (miembro) cargar()
    else setCargando(false)
  }, [cargar, miembro])

  const refrescarAlertas = useCallback(() => setVersionAlertas((v) => v + 1), [])
  const onVencidas = useCallback((n) => setVencidas(n), [])

  const tabs = useMemo(() => {
    const t = []
    if (tiene(perfil, 'agenda')) t.push(['agenda', 'Agenda y Pendientes'])
    if (tiene(perfil, 'cotizador')) t.push(['cotizador', 'Cotizador'])
    if (miembro) t.push(['bd', 'Base de Datos'])
    if (tiene(perfil, 'historial')) t.push(['historial', 'Historial de Auditoría'])
    if (superAdmin) t.push(['usuarios', 'Usuarios y Permisos'])
    return t
  }, [perfil, miembro, superAdmin])

  useEffect(() => {
    if (tabs.length && !tabs.some(([k]) => k === tab)) setTab(tabs[0][0])
  }, [tabs, tab])

  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return cotizaciones.filter((c) =>
      (filtroEstado === 'Todos' || c.estado === filtroEstado) &&
      (filtroMes === 'Todos' || mesNumero(c.mes) === Number(filtroMes)) &&
      (!q || [c.n_cotizacion, c.cliente, c.contacto, c.referencia, c.num_op, c.n_factura, c.usuario_email].some((v) => (v || '').toString().toLowerCase().includes(q)))
    )
  }, [cotizaciones, busqueda, filtroEstado, filtroMes])

  const kpis = useMemo(() => {
    const aprobadas = filtradas.filter((c) => c.estado === 'Aprobado')
    const conRent = filtradas.filter((c) => c.rentabilidad_pct !== null && c.rentabilidad_pct !== undefined && c.rentabilidad_pct !== '')
    return {
      total: filtradas.length,
      valorCotizado: filtradas.reduce((a, c) => a + (Number(c.valor_total) || 0), 0),
      valorAprobado: aprobadas.reduce((a, c) => a + (Number(c.valor_aprobado) || Number(c.valor_total) || 0), 0),
      rentProm: conRent.length ? conRent.reduce((a, c) => a + Number(c.rentabilidad_pct), 0) / conRent.length : null,
      aprobadas: aprobadas.length,
    }
  }, [filtradas])

  const eliminar = async (c) => {
    if (!window.confirm(`¿Eliminar la cotización ${c.n_cotizacion}? Esta acción queda registrada en la auditoría.`)) return
    const { data, error } = await supabase.from('cotizaciones').delete().eq('id', c.id).select('id')
    if (error) { setError(error.message); return }
    if (!data?.length) { setError('No tienes permiso para eliminar esta cotización.'); return }
    cargar()
  }

  const exportarCsv = () => {
    const cols = ['n_cotizacion', 'fecha_envio', 'semana', 'mes', 'cliente', 'contacto', 'referencia', 'cantidad', 'valor_total', 'estado', 'motivo_negacion', 'fecha_op', 'num_op', 'valor_aprobado', 'rentabilidad_pct', 'n_factura', 'fecha_facturacion', 'usuario_email']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const filas = filtradas.map((c) => cols.map((k) => esc(k === 'mes' ? mesNombre(c.mes) : c[k])).join(','))
    const blob = new Blob(['﻿' + [cols.join(','), ...filas].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'cotizaciones.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const clientes = useMemo(() => [...new Set(cotizaciones.map((c) => c.cliente).filter(Boolean))].sort(), [cotizaciones])
  const mostrarVendedor = superAdmin || verTodas

  const th = 'whitespace-nowrap px-3 py-2 text-left font-semibold'
  const td = 'whitespace-nowrap px-3 py-2'

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1026] via-[#141a3d] to-[#2a1458] text-slate-200">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <h1 className="text-xl font-bold text-white">PYC Comercial</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">{ROLES[perfil.rol]?.t || perfil.rol}</span>
          <span className="text-slate-300">{user.email}</span>
          <button onClick={() => supabase.auth.signOut()} className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:bg-white/10">Cerrar Sesión</button>
        </div>
      </header>

      <main className="space-y-5 p-6">
        {!miembro && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-amber-200">
            Tu cuenta aún no tiene un rol asignado. Pide al Super Admin de PYC Comercial que te asigne el rol Vendedor.
          </div>
        )}

        {miembro && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi titulo="Cotizaciones" valor={kpis.total} sub={`${kpis.aprobadas} aprobadas`} />
              <Kpi titulo="Valor cotizado" valor={cop(kpis.valorCotizado)} />
              <Kpi titulo="Valor aprobado" valor={cop(kpis.valorAprobado)} />
              <Kpi titulo="% Rentabilidad promedio" valor={pct(kpis.rentProm)} />
            </div>

            {!verTodas && !superAdmin && (
              <p className="text-xs text-slate-400">Estás viendo solo tus cotizaciones.</p>
            )}

            {tiene(perfil, 'agenda') && <PanelAlertas cotizaciones={cotizaciones} version={versionAlertas} onVencidas={onVencidas} onVerAgenda={() => setTab('agenda')} />}

            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cotización, cliente, OP…" className={`${sel} min-w-[220px] flex-1`} />
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={sel}>
                  {['Todos', 'Pendiente', 'Aprobado', 'Negado'].map((e) => <option key={e}>{e}</option>)}
                </select>
                <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className={sel}>
                  <option value="Todos">Todos los meses</option>
                  {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <button onClick={exportarCsv} className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10">Exportar CSV</button>
                {puedeCrear && (
                  <button onClick={() => setForm({})} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">+ Nueva cotización</button>
                )}
              </div>

              {error && <p className="mx-4 mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1400px] text-sm">
                  <thead className="bg-[#1b2150] text-xs uppercase tracking-wide text-slate-300">
                    <tr>
                      <th className={`${th} sticky left-0 z-20 bg-[#1b2150]`}># Cotización</th>
                      <th className={`${th} sticky left-[120px] z-20 bg-[#1b2150]`}>Cliente</th>
                      {mostrarVendedor && <th className={th}>Vendedor</th>}
                      <th className={th}>Fecha envío</th>
                      <th className={th}>Sem.</th>
                      <th className={th}>Mes</th>
                      <th className={th}>Contacto</th>
                      <th className={th}>Referencia</th>
                      <th className={th}>Valor total</th>
                      <th className={th}>Estado</th>
                      <th className={th}>Motivo negación</th>
                      <th className={th}>Fecha OP</th>
                      <th className={th}># OP</th>
                      <th className={th}>Valor aprobado</th>
                      <th className={th}>% Rentab.</th>
                      <th className={th}>N° Factura</th>
                      <th className={th}>Fecha fact.</th>
                      <th className={`${th} sticky right-0 z-20 bg-[#1b2150]`}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargando && <tr><td colSpan={18} className="p-6 text-center text-slate-400">Cargando…</td></tr>}
                    {!cargando && !filtradas.length && <tr><td colSpan={18} className="p-6 text-center text-slate-400">No hay cotizaciones para mostrar.</td></tr>}
                    {filtradas.map((c) => (
                      <tr key={c.id} className="group border-t border-white/5 hover:bg-white/[0.03]">
                        <td className={`${td} sticky left-0 z-10 w-[120px] min-w-[120px] bg-[#141a3d] font-semibold text-white`}>{c.n_cotizacion}</td>
                        <td className={`${td} sticky left-[120px] z-10 bg-[#141a3d] text-white`}>{c.cliente}</td>
                        {mostrarVendedor && <td className={`${td} text-xs text-slate-400`}>{c.usuario_email || '—'}</td>}
                        <td className={td}>{soloFecha(c.fecha_envio) || '—'}</td>
                        <td className={td}>{c.semana ?? '—'}</td>
                        <td className={td}>{mesNombre(c.mes) || '—'}</td>
                        <td className={td}>{c.contacto || '—'}</td>
                        <td className={`${td} max-w-[240px] truncate`} title={c.referencia || ''}>{c.referencia || '—'}</td>
                        <td className={td}>{cop(c.valor_total)}</td>
                        <td className={td}><span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[c.estado] || ''}`}>{c.estado}</span></td>
                        <td className={td}>{c.motivo_negacion || '—'}</td>
                        <td className={td}>{soloFecha(c.fecha_op) || '—'}</td>
                        <td className={td}>{c.num_op || '—'}</td>
                        <td className={td}>{c.valor_aprobado ? cop(c.valor_aprobado) : '—'}</td>
                        <td className={td}>{pct(c.rentabilidad_pct)}</td>
                        <td className={td}>{c.n_factura || '—'}</td>
                        <td className={td}>{soloFecha(c.fecha_facturacion) || '—'}</td>
                        <td className={`${td} sticky right-0 z-10 bg-[#141a3d]`}>
                          <div className="flex items-center gap-3 text-xs">
                            {puedeEditar && <button onClick={() => setForm(c)} className="text-blue-300 hover:text-blue-200" title="Editar">Editar</button>}
                            {tiene(perfil, 'historial') && <button onClick={() => setHistorialDe(c)} className="text-violet-300 hover:text-violet-200" title="Historial">Historial</button>}
                            {tiene(perfil, 'agenda') && <button onClick={() => setPendientesDe(c)} className="text-amber-300 hover:text-amber-200" title="Pendientes">Pendientes</button>}
                            {puedeEliminar && <button onClick={() => eliminar(c)} className="text-red-300 hover:text-red-200" title="Eliminar">Eliminar</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
              <nav className="flex flex-wrap gap-1 border-b border-white/10 px-2 pt-2">
                {tabs.map(([k, t]) => (
                  <button key={k} onClick={() => setTab(k)}
                    className={`rounded-t-lg px-4 py-2 text-sm ${tab === k ? 'bg-white/10 font-semibold text-white' : 'text-slate-400 hover:text-white'}`}>
                    {t}
                    {k === 'agenda' && vencidas > 0 && <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">{vencidas}</span>}
                  </button>
                ))}
              </nav>
              {tab === 'agenda' && tiene(perfil, 'agenda') && (
                <Agenda user={user} nombre={nombre} clientes={clientes} onChange={refrescarAlertas} />
              )}
              {tab === 'cotizador' && tiene(perfil, 'cotizador') && <Cotizador cotizaciones={cotizaciones} />}
              {tab === 'bd' && <BaseDatos user={user} perfil={perfil} />}
              {tab === 'historial' && tiene(perfil, 'historial') && <Historial />}
              {tab === 'usuarios' && superAdmin && <Usuarios user={user} />}
            </section>
          </>
        )}
      </main>

      {form && (
        <CotizacionForm
          registro={form.id ? form : null}
          user={user}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); cargar() }}
        />
      )}

      {pendientesDe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#141a3d] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <h2 className="font-semibold text-white">Pendientes · Cotización {pendientesDe.n_cotizacion} · {pendientesDe.cliente}</h2>
              <button onClick={() => setPendientesDe(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <Agenda user={user} nombre={nombre} cotizacionId={pendientesDe.id} nCotizacion={pendientesDe.n_cotizacion}
              cliente={pendientesDe.cliente} onChange={refrescarAlertas} />
          </div>
        </div>
      )}

      {historialDe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#141a3d] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <h2 className="font-semibold text-white">Historial · Cotización {historialDe.n_cotizacion}</h2>
              <button onClick={() => setHistorialDe(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <Historial registroId={historialDe.id} />
          </div>
        </div>
      )}
    </div>
  )
}
