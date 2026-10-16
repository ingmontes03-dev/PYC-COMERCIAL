import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { registrarAuditoria } from '../lib/auditoria'
import { tiene } from '../lib/permisos'
import CotizacionForm from './CotizacionForm'
import Historial from './Historial'
import Agenda from './Agenda'
import Cotizador from './Cotizador'
import Llamadas from './Llamadas'
import Usuarios from './Usuarios'

const cop = (n) => (Number(n) || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// Columnas: las dos primeras son las congeladas
const COLUMNAS = [
  { k: 'n_cotizacion', t: '# Cotización' },
  { k: 'cliente', t: 'Cliente' },
  { k: 'fecha_envio', t: 'Fecha Envío' },
  { k: 'semana', t: 'Semana' },
  { k: 'mes', t: 'Mes' },
  { k: 'contacto', t: 'Contacto' },
  { k: 'referencia', t: 'Referencia' },
  { k: 'cantidad', t: 'Cantidad', num: true },
  { k: 'valor_unitario', t: 'Valor Unit.', money: true },
  { k: 'valor_total', t: 'Valor Total', money: true },
  { k: 'estado', t: 'Estado' },
  { k: 'motivo_negacion', t: 'Motivo Negación' },
  { k: 'fecha_op', t: 'Fecha OP' },
  { k: 'num_op', t: '# OP' },
  { k: 'valor_aprobado', t: 'Valor Aprobado', money: true },
  { k: 'renta', t: 'Renta', money: true },
  { k: 'n_factura', t: 'N° Factura' },
  { k: 'fecha_facturacion', t: 'Fecha Facturación' },
]

const BADGE = {
  Pendiente: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Aprobado: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  Negado: 'bg-red-500/15 text-red-300 border-red-500/30',
}

function Kpi({ titulo, valor, sub, grad }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 p-5 shadow-lg ${grad}`}>
      <p className="text-xs uppercase tracking-wider text-slate-300">{titulo}</p>
      <p className="mt-2 text-2xl font-bold text-white">{valor}</p>
      <p className="mt-1 text-xs text-slate-300/80">{sub}</p>
    </div>
  )
}

const Icono = ({ d }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)

export default function Dashboard({ user, perfil }) {
  const can = (p) => tiene(perfil, p)
  const esSuper = perfil?.rol === 'super_admin'

  const [datos, setDatos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('Todos')
  const [form, setForm] = useState(null) // null | {} (nuevo) | registro (editar)
  const [tab, setTab] = useState('agenda')
  const [refreshLog, setRefreshLog] = useState(0)
  const [modal, setModal] = useState(null) // { tipo: 'historial' | 'pendientes', registro }
  const [alertasVencidas, setAlertasVencidas] = useState(0)
  const [errorDatos, setErrorDatos] = useState('')

  const cargar = useCallback(async () => {
    if (!tiene(perfil, 'cotizaciones_ver')) { setDatos([]); setCargando(false); return }
    setCargando(true)
    const { data, error } = await supabase.from('cotizaciones').select('*').order('created_at', { ascending: false })
    if (error) setErrorDatos(`No se pudieron cargar las cotizaciones: ${error.message}`)
    else setErrorDatos('')
    setDatos(data || [])
    setCargando(false)
    setRefreshLog((x) => x + 1)
  }, [perfil])

  useEffect(() => { cargar() }, [cargar])

  // Cuenta de alertas vencidas (aparece como globo rojo en la pestaña de Agenda)
  const cargarAlertas = useCallback(async () => {
    if (!tiene(perfil, 'agenda')) { setAlertasVencidas(0); return }
    const d = new Date()
    const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const { count } = await supabase
      .from('alertas')
      .select('id', { count: 'exact', head: true })
      .or('estado.is.null,estado.neq.Completado')
      .lt('fecha_limite', hoy)
    setAlertasVencidas(count || 0)
  }, [perfil])

  useEffect(() => { cargarAlertas() }, [cargarAlertas])

  const eliminar = async (r) => {
    if (!window.confirm(`¿Eliminar la cotización ${r.n_cotizacion}?`)) return
    const { error } = await supabase.from('cotizaciones').delete().eq('id', r.id)
    if (error) return alert(error.message)
    await registrarAuditoria({
      usuario_email: user.email, accion: 'ELIMINAR', registro_id: r.id,
      n_cotizacion: r.n_cotizacion, campos_modificados: r,
    })
    cargar()
  }

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return datos.filter((r) =>
      (filtro === 'Todos' || r.estado === filtro) &&
      (!q || (r.cliente || '').toLowerCase().includes(q) || (r.n_cotizacion || '').toLowerCase().includes(q))
    )
  }, [datos, busqueda, filtro])

  // KPIs
  const kpis = useMemo(() => {
    const pend = datos.filter((r) => r.estado === 'Pendiente')
    const hoy = new Date()
    const aprobMes = datos.filter((r) => {
      if (r.estado !== 'Aprobado') return false
      const f = new Date((r.fecha_op || r.fecha_envio || '') + 'T00:00:00')
      return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear()
    })
    const conRenta = datos.filter((r) => r.renta !== null && r.renta !== '')
    const rentaProm = conRenta.length ? conRenta.reduce((a, r) => a + Number(r.renta), 0) / conRenta.length : 0
    return {
      total: datos.length,
      pendMonto: pend.reduce((a, r) => a + Number(r.valor_total || 0), 0),
      pendN: pend.length,
      aprobN: aprobMes.length,
      aprobMonto: aprobMes.reduce((a, r) => a + Number(r.valor_aprobado || r.valor_total || 0), 0),
      rentaProm,
    }
  }, [datos])

  // Exportar a Excel (CSV con BOM, abre directo en Excel)
  const exportarExcel = () => {
    const enc = COLUMNAS.map((c) => c.t).join(';')
    const filas = filtrados.map((r) => COLUMNAS.map((c) => `"${String(r[c.k] ?? '').replace(/"/g, '""')}"`).join(';'))
    const blob = new Blob(['﻿' + [enc, ...filas].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cotizaciones_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const celda = (r, c) => {
    const v = r[c.k]
    if (c.k === 'estado') return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE[v] || ''}`}>{v}</span>
    if (v === null || v === undefined || v === '') return <span className="text-slate-600">—</span>
    if (c.money) return cop(v)
    return v
  }

  // Pestañas visibles según los permisos de la cuenta
  const TABS = [
    { id: 'agenda', t: 'Agenda y Alertas de Pendientes', ok: can('agenda') },
    { id: 'historial', t: 'Historial de Auditoría', ok: can('historial') },
    { id: 'cotizador', t: 'Cotizador Rápido', ok: can('cotizador') },
    { id: 'llamadas', t: 'Llamadas / Base de Datos', ok: can('llamadas') },
    { id: 'usuarios', t: 'Usuarios y Permisos', ok: esSuper },
  ].filter((t) => t.ok)
  const tabActiva = TABS.some((t) => t.id === tab) ? tab : TABS[0]?.id

  const verCotizaciones = can('cotizaciones_ver')

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1026] via-[#10163a] to-[#1d1245] text-slate-200">
      {/* HEADER */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#0b1026]/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-violet-900/40" />
          <span className="text-lg font-semibold text-white">PYC Comercial</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-sm text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="hidden sm:inline">{user.email}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${esSuper ? 'bg-violet-500/20 text-violet-300' : 'bg-white/10 text-slate-300'}`}>
              {esSuper ? 'Super Admin' : 'Usuario'}
            </span>
          </span>
          <button onClick={() => supabase.auth.signOut()}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10">
            Cerrar Sesión
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 p-6">
        {!verCotizaciones && !TABS.length && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
            <p className="font-semibold text-white">Tu cuenta aún no tiene permisos asignados</p>
            <p className="mt-1 text-sm text-slate-300">Pídele al super administrador que te active los módulos que necesitas.</p>
          </div>
        )}

        {verCotizaciones && (
          <>
            {/* KPIs */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi titulo="Total Cotizaciones" valor={kpis.total} sub="Registros en el sistema" grad="bg-gradient-to-br from-[#1b2150] to-[#141a3d]" />
              <Kpi titulo="Pendientes por Aprobación" valor={cop(kpis.pendMonto)} sub={`${kpis.pendN} cotizaciones pendientes`} grad="bg-gradient-to-br from-[#3a2a0f]/60 to-[#141a3d]" />
              <Kpi titulo="Aprobadas este mes" valor={kpis.aprobN} sub={cop(kpis.aprobMonto)} grad="bg-gradient-to-br from-[#0f3a2c]/60 to-[#141a3d]" />
              <Kpi titulo="Renta promedio" valor={cop(kpis.rentaProm)} sub="Promedio de registros con renta" grad="bg-gradient-to-br from-[#2a1458] to-[#141a3d]" />
            </section>

            {/* BARRA DE HERRAMIENTAS */}
            <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por cliente o # cotización…"
                className="min-w-[240px] flex-1 rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
              <select value={filtro} onChange={(e) => setFiltro(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500">
                {['Todos', 'Pendiente', 'Aprobado', 'Negado'].map((s) => <option key={s}>{s}</option>)}
              </select>
              {can('cotizaciones_crear') && (
                <button onClick={() => setForm({})}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:bg-blue-500">
                  + Nueva Cotización
                </button>
              )}
              <button onClick={exportarExcel} className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10">Exportar Excel</button>
              <button onClick={() => window.print()} className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10">Exportar PDF</button>
            </section>

            {errorDatos && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{errorDatos}</p>}

            {/* TABLA PRINCIPAL */}
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#10163a]/80 shadow-xl">
              <div className="max-h-[520px] overflow-auto">
                <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      {COLUMNAS.map((c, i) => (
                        <th key={c.k}
                          className={`sticky top-0 whitespace-nowrap border-b border-white/10 bg-[#1b2150] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300
                            ${i === 0 ? 'left-0 z-30 min-w-[140px] w-[140px]' : ''}
                            ${i === 1 ? 'left-[140px] z-30 min-w-[200px] w-[200px] border-r border-white/10' : ''}`}>
                          {c.t}
                        </th>
                      ))}
                      <th className="sticky top-0 whitespace-nowrap border-b border-white/10 bg-[#1b2150] px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-300">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargando && <tr><td colSpan={19} className="p-6 text-center text-slate-400">Cargando…</td></tr>}
                    {!cargando && !filtrados.length && <tr><td colSpan={19} className="p-6 text-center text-slate-400">Sin resultados.</td></tr>}
                    {filtrados.map((r) => (
                      <tr key={r.id} className="group">
                        {COLUMNAS.map((c, i) => (
                          <td key={c.k}
                            className={`whitespace-nowrap border-b border-white/5 px-4 py-3 ${c.num || c.money ? 'text-right tabular-nums' : ''}
                              ${i === 0 ? 'sticky left-0 z-10 min-w-[140px] w-[140px] bg-[#10163a] font-semibold text-white group-hover:bg-[#1b2150]' : ''}
                              ${i === 1 ? 'sticky left-[140px] z-10 min-w-[200px] w-[200px] border-r border-white/10 bg-[#10163a] text-white group-hover:bg-[#1b2150]' : 'group-hover:bg-white/[0.03]'}`}>
                            {celda(r, c)}
                          </td>
                        ))}
                        <td className="whitespace-nowrap border-b border-white/5 px-4 py-3 group-hover:bg-white/[0.03]">
                          <div className="flex items-center justify-center gap-1">
                            {can('cotizaciones_editar') && (
                              <button title="Editar" onClick={() => setForm(r)} className="rounded-md p-1.5 text-blue-300 hover:bg-blue-500/20">
                                <Icono d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
                              </button>
                            )}
                            {can('historial') && (
                              <button title="Ver Historial / Auditoría" onClick={() => setModal({ tipo: 'historial', registro: r })} className="rounded-md p-1.5 text-violet-300 hover:bg-violet-500/20">
                                <Icono d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.7L3 8M3 3v5h5M12 7v5l4 2" />
                              </button>
                            )}
                            {can('agenda') && (
                              <button title="Ver Pendientes" onClick={() => setModal({ tipo: 'pendientes', registro: r })} className="rounded-md p-1.5 text-amber-300 hover:bg-amber-500/20">
                                <Icono d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                              </button>
                            )}
                            {can('cotizaciones_eliminar') && (
                              <button title="Eliminar" onClick={() => eliminar(r)} className="rounded-md p-1.5 text-red-300 hover:bg-red-500/20">
                                <Icono d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-white/10 px-4 py-2 text-xs text-slate-400">
                Mostrando {filtrados.length} de {datos.length} cotizaciones
              </div>
            </section>
          </>
        )}

        {/* MÓDULO INFERIOR / PESTAÑAS */}
        {!!TABS.length && (
          <section className="rounded-2xl border border-white/10 bg-[#10163a]/80 shadow-xl">
            <div className="flex flex-wrap gap-1 border-b border-white/10 p-2">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tabActiva === t.id ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                  {t.t}
                  {t.id === 'agenda' && alertasVencidas > 0 && (
                    <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">{alertasVencidas}</span>
                  )}
                </button>
              ))}
            </div>
            {tabActiva === 'agenda' && <Agenda user={user} onChange={cargarAlertas} />}
            {tabActiva === 'historial' && <Historial refresh={refreshLog} />}
            {tabActiva === 'cotizador' && <Cotizador cotizaciones={datos} />}
            {tabActiva === 'llamadas' && <Llamadas user={user} />}
            {tabActiva === 'usuarios' && <Usuarios user={user} />}
          </section>
        )}
      </main>

      {/* MODAL FORMULARIO */}
      {form && (
        <CotizacionForm registro={form.id ? form : null} user={user}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); cargar() }} />
      )}

      {/* MODAL HISTORIAL / PENDIENTES POR FILA */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#141a3d] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <h3 className="font-semibold text-white">
                {modal.tipo === 'historial' ? 'Historial' : 'Pendientes'} · Cotización {modal.registro.n_cotizacion}
              </h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            {modal.tipo === 'historial'
              ? <Historial registroId={modal.registro.id} refresh={refreshLog} />
              : <Agenda user={user} cotizacionId={modal.registro.id} nCotizacion={modal.registro.n_cotizacion} onChange={cargarAlertas} />}
          </div>
        </div>
      )}
    </div>
  )
}
