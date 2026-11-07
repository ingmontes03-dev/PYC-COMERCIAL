import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { MESES, mesNombre, mesNumero, soloFecha } from '../lib/fechas'
import { ROLES, esMiembro, tiene } from '../lib/permisos'
import { descargarCsv, descargarExcel, registrarExportacion } from '../lib/exportar'
import CotizacionForm from './CotizacionForm'
import PanelAlertas from './PanelAlertas'
import Agenda from './Agenda'
import Cotizador from './Cotizador'
import BaseDatos from './BaseDatos'
import Historial from './Historial'
import VozAlertas from './VozAlertas'
import SyncCalendario from './SyncCalendario'
import Usuarios from './Usuarios'

const cop = (n) => (Number(n) || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const pct = (n) => (n === null || n === undefined || n === '' ? '—' : `${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 2 })}%`)
const ICONO_TAB = { agenda: '📅', cotizador: '🧮', bd: '🗂️', historial: '🕘', usuarios: '👥' }
const TAB_CORTO = { agenda: 'Agenda', cotizador: 'Cotizador', bd: 'Clientes', historial: 'Historial', usuarios: 'Usuarios' }
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
  const [filtroAgenda, setFiltroAgenda] = useState({ f: 'activas', n: 0 })
  const seccionTabs = useRef(null)

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

  // "Ver y administrar todas": abre la pestaña Agenda con el filtro elegido y baja hasta ella
  const verAgenda = useCallback((f = 'activas') => {
    setTab('agenda')
    setFiltroAgenda((p) => ({ f, n: p.n + 1 }))
    setTimeout(() => seccionTabs.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }, [])

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
    refrescarAlertas() // sus alertas de entrega también se eliminan
  }

  const COLUMNAS_EXPORT = [
    { k: 'n_cotizacion', t: 'N° Cotización' },
    { k: 'fecha_envio', t: 'Fecha envío', f: (c) => soloFecha(c.fecha_envio) },
    { k: 'semana', t: 'Semana' },
    { k: 'mes', t: 'Mes', f: (c) => mesNombre(c.mes) },
    { k: 'cliente', t: 'Cliente' },
    { k: 'contacto', t: 'Contacto' },
    { k: 'referencia', t: 'Referencia' },
    { k: 'cantidad', t: 'Cantidad' },
    { k: 'valor_total', t: 'Valor total' },
    { k: 'estado', t: 'Estado' },
    { k: 'motivo_negacion', t: 'Motivo negación' },
    { k: 'fecha_op', t: 'Fecha OP', f: (c) => soloFecha(c.fecha_op) },
    { k: 'num_op', t: '# OP' },
    { k: 'valor_aprobado', t: 'Valor aprobado' },
    { k: 'rentabilidad_pct', t: '% Rentabilidad' },
    { k: 'n_factura', t: 'N° Factura' },
    { k: 'fecha_facturacion', t: 'Fecha facturación', f: (c) => soloFecha(c.fecha_facturacion) },
    { k: 'tipo_marcacion', t: 'Tipo de marcación' },
    { k: 'precio_marcacion', t: 'Precio de marcación' },
    { k: 'fecha_entrega', t: 'Fecha de entrega', f: (c) => soloFecha(c.fecha_entrega) },
    { k: 'fecha_entrega_anticipada', t: 'Fecha anticipada de entrega', f: (c) => soloFecha(c.fecha_entrega_anticipada) },
    { k: 'valor_positivos', t: 'Valor positivos' },
    { k: 'dtf', t: 'DTF', f: (c) => (c.dtf ? `Sí${c.dtf_metros ? ` (${c.dtf_metros} m)` : ''}` : 'No') },
    { k: 'fletes', t: 'Fletes', f: (c) => (c.fletes || []).map((x) => `${x.descripcion}: ${x.precio}`).join(' | ') },
    { k: 'gastos_adicionales', t: 'Gastos adicionales', f: (c) => (c.gastos_adicionales || []).map((x) => `${x.descripcion}: ${x.cantidad ?? 1} x ${x.valor_unitario ?? x.valor} = ${x.valor}`).join(' | ') },
    { k: 'usuario_email', t: 'Vendedor' },
  ]

  const exportar = (tipo) => {
    if (!filtradas.length) { setError('No hay cotizaciones para exportar.'); return }
    if (tipo === 'csv') descargarCsv('cotizaciones', COLUMNAS_EXPORT, filtradas)
    else descargarExcel('cotizaciones', COLUMNAS_EXPORT, filtradas)
    registrarExportacion('Cotizaciones', `${tipo.toUpperCase()} · ${filtradas.length} registros`)
  }

  const clientes = useMemo(() => [...new Set(cotizaciones.map((c) => c.cliente).filter(Boolean))].sort(), [cotizaciones])
  const mostrarVendedor = superAdmin || verTodas

  const th = 'whitespace-nowrap px-3 py-2 text-left font-semibold'
  const td = 'whitespace-nowrap px-3 py-2'

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1026] via-[#141a3d] to-[#2a1458] text-slate-200">
      {/* Ajustes para celular: campos de 16 px (evita el zoom automático de iPhone) y botones fáciles de tocar */}
      <style>{`@media (max-width: 767px){
        input:not([type=checkbox]):not([type=radio]), select, textarea { font-size: 16px !important; min-height: 44px; }
        button, summary { min-height: 40px; }
        html { -webkit-text-size-adjust: 100%; }
      }`}</style>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-3 sm:gap-3 sm:px-6 sm:py-4">
        <h1 className="text-xl font-bold text-white">PYC Comercial</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">{ROLES[perfil.rol]?.t || perfil.rol}</span>
          <span className="hidden text-slate-300 sm:inline">{user.email}</span>
          <button onClick={() => supabase.auth.signOut()} className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:bg-white/10">Cerrar Sesión</button>
        </div>
      </header>

      <main className="space-y-4 p-3 pb-28 sm:space-y-5 sm:p-6 md:pb-6">
        {!miembro && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-amber-200">
            Tu cuenta aún no tiene un rol asignado. Pide al Super Admin de PYC Comercial que te asigne el rol Vendedor.
          </div>
        )}

        {miembro && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              <Kpi titulo="Cotizaciones" valor={kpis.total} sub={`${kpis.aprobadas} aprobadas`} />
              <Kpi titulo="Valor cotizado" valor={cop(kpis.valorCotizado)} />
              <Kpi titulo="Valor aprobado" valor={cop(kpis.valorAprobado)} />
              <Kpi titulo="% Rentabilidad promedio" valor={pct(kpis.rentProm)} />
            </div>

            {!verTodas && !superAdmin && (
              <p className="text-xs text-slate-400">Estás viendo solo tus cotizaciones.</p>
            )}

            {tiene(perfil, 'agenda') && (
              <>
                <VozAlertas user={user} nombre={nombre} cotizaciones={cotizaciones} version={versionAlertas} />
                <SyncCalendario user={user} version={versionAlertas} />
                <PanelAlertas cotizaciones={cotizaciones} version={versionAlertas} onVencidas={onVencidas} onVerAgenda={verAgenda} />
              </>
            )}

            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2 p-3 sm:gap-3 sm:p-4">
                <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cotización, cliente, OP…" className={`${sel} w-full sm:w-auto sm:min-w-[220px] sm:flex-1`} />
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={`${sel} flex-1 sm:flex-none`}>
                  {['Todos', 'Pendiente', 'Aprobado', 'Negado'].map((e) => <option key={e}>{e}</option>)}
                </select>
                <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className={`${sel} flex-1 sm:flex-none`}>
                  <option value="Todos">Todos los meses</option>
                  {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <button onClick={() => exportar('csv')} className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10">Exportar CSV</button>
                <button onClick={() => exportar('excel')} className="rounded-lg border border-emerald-400/40 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/10">Exportar Excel</button>
                {puedeCrear && (
                  <button onClick={() => setForm({})} className="hidden rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 sm:inline-block">+ Nueva cotización</button>
                )}
              </div>

              {error && <p className="mx-4 mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

              {/* CELULAR: tarjetas en vez de tabla */}
              <div className="space-y-3 p-3 pt-0 md:hidden">
                {cargando && <p className="p-4 text-center text-sm text-slate-400">Cargando…</p>}
                {!cargando && !filtradas.length && <p className="p-4 text-center text-sm text-slate-400">No hay cotizaciones para mostrar.</p>}
                {filtradas.map((c) => (
                  <article key={c.id} className="rounded-xl border border-white/10 bg-[#141a3d] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-400">Cotización</p>
                        <p className="font-semibold text-white">{c.n_cotizacion}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[c.estado] || ''}`}>{c.estado}</span>
                    </div>
                    <p className="mt-1 truncate text-base font-medium text-white">{c.cliente}</p>
                    {c.referencia && <p className="truncate text-xs text-slate-400">{c.referencia}</p>}
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                      <div><dt className="text-xs text-slate-400">Valor total</dt><dd className="text-white">{cop(c.valor_total)}</dd></div>
                      <div><dt className="text-xs text-slate-400">Valor aprobado</dt><dd>{c.valor_aprobado ? cop(c.valor_aprobado) : '—'}</dd></div>
                      <div><dt className="text-xs text-slate-400">Fecha envío</dt><dd>{soloFecha(c.fecha_envio) || '—'}</dd></div>
                      <div><dt className="text-xs text-slate-400">Entrega</dt><dd>{soloFecha(c.fecha_entrega) || '—'}</dd></div>
                      {c.fecha_entrega_anticipada && <div><dt className="text-xs text-slate-400">Entrega anticipada</dt><dd>{soloFecha(c.fecha_entrega_anticipada)}</dd></div>}
                      {c.contacto && <div><dt className="text-xs text-slate-400">Contacto</dt><dd className="truncate">{c.contacto}</dd></div>}
                      {mostrarVendedor && <div className="col-span-2"><dt className="text-xs text-slate-400">Vendedor</dt><dd className="truncate text-xs">{c.usuario_email || '—'}</dd></div>}
                    </dl>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      {puedeEditar && <button onClick={() => setForm(c)} className="rounded-lg bg-blue-600/20 py-2 text-blue-200">Editar</button>}
                      {tiene(perfil, 'agenda') && <button onClick={() => setPendientesDe(c)} className="rounded-lg bg-amber-500/15 py-2 text-amber-200">Pendientes</button>}
                      {tiene(perfil, 'historial') && <button onClick={() => setHistorialDe(c)} className="rounded-lg bg-violet-500/15 py-2 text-violet-200">Historial</button>}
                      {puedeEliminar && <button onClick={() => eliminar(c)} className="rounded-lg bg-red-500/15 py-2 text-red-200">Eliminar</button>}
                    </div>
                  </article>
                ))}
              </div>

              {/* ESCRITORIO: tabla completa */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1500px] text-sm">
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
                      <th className={th}>Entrega</th>
                      <th className={th}>Entrega anticip.</th>
                      <th className={th}>Registrada</th>
                      <th className={`${th} sticky right-0 z-20 bg-[#1b2150]`}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargando && <tr><td colSpan={21} className="p-6 text-center text-slate-400">Cargando…</td></tr>}
                    {!cargando && !filtradas.length && <tr><td colSpan={21} className="p-6 text-center text-slate-400">No hay cotizaciones para mostrar.</td></tr>}
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
                        <td className={td}>{soloFecha(c.fecha_entrega) || '—'}</td>
                        <td className={td}>{soloFecha(c.fecha_entrega_anticipada) || '—'}</td>
                        <td className={`${td} text-xs text-slate-400`}>
                          {c.created_at ? new Date(c.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </td>
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

            <section ref={seccionTabs} className="scroll-mt-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
              <nav className="hidden flex-wrap gap-1 border-b border-white/10 px-2 pt-2 md:flex">
                {tabs.map(([k, t]) => (
                  <button key={k} onClick={() => setTab(k)}
                    className={`rounded-t-lg px-4 py-2 text-sm ${tab === k ? 'bg-white/10 font-semibold text-white' : 'text-slate-400 hover:text-white'}`}>
                    {t}
                    {k === 'agenda' && vencidas > 0 && <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">{vencidas}</span>}
                  </button>
                ))}
              </nav>
              {tab === 'agenda' && tiene(perfil, 'agenda') && (
                <Agenda user={user} nombre={nombre} superAdmin={superAdmin} clientes={clientes} cotizaciones={cotizaciones}
                  filtroForzado={filtroAgenda} onChange={refrescarAlertas} />
              )}
              {tab === 'cotizador' && tiene(perfil, 'cotizador') && <Cotizador cotizaciones={cotizaciones} onCrear={puedeCrear ? (d) => setForm({ borrador: d }) : undefined} />}
              {tab === 'bd' && <BaseDatos user={user} perfil={perfil} />}
              {tab === 'historial' && tiene(perfil, 'historial') && <Historial />}
              {tab === 'usuarios' && superAdmin && <Usuarios user={user} />}
            </section>
          </>
        )}
      </main>

      {/* CELULAR: botón flotante para crear y barra de navegación inferior */}
      {miembro && puedeCrear && !form && (
        <button onClick={() => setForm({})} aria-label="Nueva cotización"
          className="fixed bottom-20 right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-semibold text-white shadow-xl shadow-black/40 active:scale-95 md:hidden">
          <span className="text-xl leading-none">+</span> Cotización
        </button>
      )}
      {miembro && (
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-[#0b1026]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-slate-300">
            <span className="text-lg leading-none">📄</span><span className="text-[10px]">Cotizaciones</span>
          </button>
          {tabs.map(([k, t]) => (
            <button key={k} onClick={() => { setTab(k); setTimeout(() => seccionTabs.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 ${tab === k ? 'text-white' : 'text-slate-400'}`}>
              <span className="text-lg leading-none">{ICONO_TAB[k] || '•'}</span>
              <span className="text-[10px]">{TAB_CORTO[k] || t}</span>
              {k === 'agenda' && vencidas > 0 && <span className="absolute right-1/4 top-1 rounded-full bg-red-500 px-1 text-[10px] text-white">{vencidas}</span>}
              {tab === k && <span className="absolute inset-x-3 top-0 h-0.5 rounded bg-blue-400" />}
            </button>
          ))}
        </nav>
      )}

      {form && (
        <CotizacionForm
          registro={form.id ? form : null}
          borrador={form.borrador}
          user={user}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); cargar(); refrescarAlertas() }}
        />
      )}

      {pendientesDe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-0 sm:p-4">
          <div className="h-full w-full max-w-3xl overflow-y-auto rounded-none border border-white/10 bg-[#141a3d] shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <h2 className="font-semibold text-white">Pendientes · Cotización {pendientesDe.n_cotizacion} · {pendientesDe.cliente}</h2>
              <button onClick={() => setPendientesDe(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <Agenda user={user} nombre={nombre} superAdmin={superAdmin} cotizacionId={pendientesDe.id} nCotizacion={pendientesDe.n_cotizacion}
              cliente={pendientesDe.cliente} onChange={refrescarAlertas} />
          </div>
        </div>
      )}

      {historialDe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-0 sm:p-4">
          <div className="h-full w-full max-w-3xl overflow-y-auto rounded-none border border-white/10 bg-[#141a3d] shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl">
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
