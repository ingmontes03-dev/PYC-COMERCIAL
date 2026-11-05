import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { diasEntre, fmtFecha, hhmm, hoyStr, rangosDe, soloFecha, textoRangos } from '../lib/fechas'
import { descargarCsv, descargarExcel, registrarExportacion } from '../lib/exportar'
import { apiDisponible, crearEventoGoogle, descargarIcs, enlaceGoogleCalendar } from '../lib/googleCalendar'

const DIAS_SEMANA = 7
const DIAS_SEGUIMIENTO = 7

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

// "Activas" es la vista principal: las alertas completadas pasan solas al Archivo
const FILTROS = [
  ['activas', 'Activas'],
  ['vencidas', 'Vencidas'],
  ['hoy', 'Hoy'],
  ['semana', 'Esta semana'],
  ['despues', 'Más adelante'],
  ['archivo', 'Archivo (completadas)'],
  ['todas', 'Todas'],
]

const fmtCreada = (v) => {
  if (!v) return 'sin fecha'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? 'sin fecha' : d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const diaCreada = (v) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? fmtFecha(d) : '' }

const COLUMNAS_EXPORT = [
  { k: 'titulo', t: 'Tarea', f: (a) => a.titulo || a.descripcion || '' },
  { k: 'cliente', t: 'Cliente / Empresa' },
  { k: 'n_cotizacion', t: 'Cotización' },
  { k: 'fecha_limite', t: 'Fecha límite', f: (a) => soloFecha(a.fecha_limite) },
  { k: 'horario', t: 'Horario', f: (a) => textoRangos(a) },
  { k: 'estado', t: 'Estado', f: (a) => a.estado || 'Pendiente' },
  { k: 'usuario', t: 'Creada por', f: (a) => a.usuario_nombre || a.usuario_email || '' },
  { k: 'created_at', t: 'Fecha de creación', f: (a) => (a.created_at ? fmtCreada(a.created_at) : '') },
]

const input = 'rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'
const boton = 'rounded-md border border-white/15 px-2 py-1 text-xs text-slate-100 hover:bg-white/10'
const FORM_VACIO = { titulo: '', fecha: '', ini: '', fin: '', partido: false, ini2: '', fin2: '' }

export default function Agenda({
  user, nombre, superAdmin = false, cotizacionId, nCotizacion, cliente, clientes = [],
  cotizaciones = [], filtroForzado, onChange,
}) {
  const global = !cotizacionId
  const [items, setItems] = useState([])
  const [f, setF] = useState(FORM_VACIO)
  const [empresa, setEmpresa] = useState(cliente || '')
  const [editId, setEditId] = useState(null)
  const [filtro, setFiltro] = useState('activas')
  const [busqueda, setBusqueda] = useState('')
  const [fEstado, setFEstado] = useState('Todos')
  const [fCreador, setFCreador] = useState('Todos')
  const [fCliente, setFCliente] = useState('Todos')
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const [fCreadaDesde, setFCreadaDesde] = useState('')
  const [fCreadaHasta, setFCreadaHasta] = useState('')
  const [avanzado, setAvanzado] = useState(false)
  const [aGoogle, setAGoogle] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [cargando, setCargando] = useState(true)

  // Desde el panel del Dashboard se puede abrir directamente un filtro (vencidas, hoy, etc.)
  useEffect(() => { if (filtroForzado?.f) setFiltro(filtroForzado.f) }, [filtroForzado])

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
        (soloFecha(a.fecha_limite) || '9999-12-31').localeCompare(soloFecha(b.fecha_limite) || '9999-12-31') ||
        hhmm(a.hora_inicio).localeCompare(hhmm(b.hora_inicio))
      )
      setItems(ordenadas)
      setError('')
    }
    setCargando(false)
  }, [cotizacionId])

  useEffect(() => { cargar() }, [cargar])

  const refrescar = async () => { await cargar(); onChange?.() }
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const puedeGestionar = (a) => superAdmin || a.usuario_id === user.id

  const limpiarForm = () => { setF(FORM_VACIO); setEditId(null); if (!cliente) setEmpresa('') }

  const sincronizar = async (alerta) => {
    const id = await crearEventoGoogle(alerta)
    await supabase.from('alertas').update({ gcal_event_id: id }).eq('id', alerta.id)
  }

  const validar = () => {
    if (!f.titulo.trim() || !f.fecha) return 'Escribe la tarea y la fecha límite.'
    if (!f.ini || !f.fin) return 'Selecciona el rango de hora (desde y hasta).'
    if (f.fin <= f.ini) return 'En el rango de hora, "hasta" debe ser posterior a "desde".'
    if (f.partido) {
      if (!f.ini2 || !f.fin2) return 'Horario partido: completa también el segundo rango de hora.'
      if (f.fin2 <= f.ini2) return 'En el segundo rango, "hasta" debe ser posterior a "desde".'
      if (f.ini2 < f.fin) return 'El segundo rango debe empezar después de que termine el primero.'
    }
    return ''
  }

  const guardar = async (e) => {
    e.preventDefault()
    setAviso('')
    const msg = validar()
    if (msg) { setError(msg); return }

    const campos = {
      titulo: f.titulo.trim(),
      fecha_limite: f.fecha,
      hora_inicio: f.ini,
      hora_fin: f.fin,
      hora_inicio2: f.partido ? f.ini2 : null,
      hora_fin2: f.partido ? f.fin2 : null,
      cliente: (cliente || empresa).trim() || null,
    }

    if (editId) {
      const { data, error } = await supabase.from('alertas').update(campos).eq('id', editId).select('id')
      if (error) { setError(`No se pudo guardar: ${error.message}${/column|schema cache/i.test(error.message) ? ' — Ejecuta supabase_schema.sql en Supabase.' : ''}`); return }
      if (!data?.length) { setError('Solo quien creó la alerta (o el super admin) puede modificarla.'); return }
      limpiarForm(); setError(''); setAviso('Alerta actualizada.')
      refrescar()
      return
    }

    const { data, error } = await supabase
      .from('alertas')
      .insert({
        ...campos,
        estado: 'Pendiente',
        usuario_email: user.email,
        usuario_nombre: nombre || user.email,
        cotizacion_id: cotizacionId || null,
        n_cotizacion: nCotizacion || null,
      })
      .select()
      .single()
    if (error) { setError(`No se pudo guardar la alerta: ${error.message}${/column|schema cache/i.test(error.message) ? ' — Ejecuta supabase_schema.sql completo en Supabase (SQL Editor) y recarga la página.' : ''}`); return }

    limpiarForm(); setError('')

    if (aGoogle) {
      if (apiDisponible) {
        try { await sincronizar(data); setAviso('Alerta guardada y sincronizada con Google Calendar.') }
        catch (err) { setError(`La alerta se guardó, pero no se pudo sincronizar con Google Calendar: ${err.message}`) }
      } else {
        window.open(enlaceGoogleCalendar(data, 0), '_blank', 'noopener')
        setAviso(data.hora_inicio2
          ? 'Alerta guardada. Se abrió Google Calendar con el primer rango; el segundo se agrega con el botón "Calendar 2" de la alerta.'
          : 'Alerta guardada. Se abrió Google Calendar para que confirmes el evento.')
      }
    }
    refrescar()
  }

  const editar = (a) => {
    setF({
      titulo: a.titulo || a.descripcion || '',
      fecha: soloFecha(a.fecha_limite),
      ini: hhmm(a.hora_inicio), fin: hhmm(a.hora_fin),
      partido: !!(a.hora_inicio2 && a.hora_fin2),
      ini2: hhmm(a.hora_inicio2), fin2: hhmm(a.hora_fin2),
    })
    if (!cliente) setEmpresa(a.cliente || '')
    setEditId(a.id)
    setError(''); setAviso('')
    document.getElementById('form-alerta')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const desdeSeguimiento = (c) => {
    limpiarForm()
    setF({ ...FORM_VACIO, titulo: `Seguimiento cotización ${c.n_cotizacion || ''}`.trim() })
    setEmpresa(c.cliente || '')
    document.getElementById('form-alerta')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

  const borrar = async (a) => {
    if (!window.confirm(`¿Eliminar la alerta "${a.titulo || a.descripcion}"?`)) return
    const { data, error } = await supabase.from('alertas').delete().eq('id', a.id).select('id')
    if (error) setError(error.message)
    else if (!data?.length) setError('Solo quien creó la alerta (o el super admin) puede eliminarla.')
    if (editId === a.id) limpiarForm()
    refrescar()
  }

  const hoy = hoyStr()
  const dias = (a) => (a.fecha_limite ? diasEntre(hoy, soloFecha(a.fecha_limite)) : null)
  const abierta = (a) => a.estado !== 'Completado'

  const cuentas = useMemo(() => ({
    activas: items.filter(abierta).length,
    vencidas: items.filter((a) => abierta(a) && dias(a) !== null && dias(a) < 0).length,
    hoy: items.filter((a) => abierta(a) && dias(a) === 0).length,
    semana: items.filter((a) => abierta(a) && dias(a) > 0 && dias(a) <= DIAS_SEMANA).length,
    despues: items.filter((a) => abierta(a) && dias(a) > DIAS_SEMANA).length,
    archivo: items.filter((a) => !abierta(a)).length,
    todas: items.length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [items, hoy])

  const creadores = useMemo(() => [...new Set(items.map((a) => a.usuario_nombre || a.usuario_email).filter(Boolean))].sort(), [items])
  const empresas = useMemo(() => [...new Set(items.map((a) => a.cliente).filter(Boolean))].sort(), [items])

  const hayFiltros = !!(busqueda || fEstado !== 'Todos' || fCreador !== 'Todos' || fCliente !== 'Todos' || fDesde || fHasta || fCreadaDesde || fCreadaHasta)
  const limpiarFiltros = () => {
    setBusqueda(''); setFEstado('Todos'); setFCreador('Todos'); setFCliente('Todos')
    setFDesde(''); setFHasta(''); setFCreadaDesde(''); setFCreadaHasta('')
  }

  const visibles = items.filter((a) => {
    const d = dias(a)
    const vista = (() => {
      switch (filtro) {
        case 'activas': return abierta(a) || fEstado === 'Completado'
        case 'vencidas': return abierta(a) && d !== null && d < 0
        case 'hoy': return abierta(a) && d === 0
        case 'semana': return abierta(a) && d > 0 && d <= DIAS_SEMANA
        case 'despues': return abierta(a) && d > DIAS_SEMANA
        case 'archivo': return !abierta(a)
        default: return true
      }
    })()
    if (!vista) return false
    const q = busqueda.toLowerCase().trim()
    if (q && ![a.titulo, a.descripcion, a.cliente, a.n_cotizacion, a.usuario_nombre, a.usuario_email].some((v) => (v || '').toLowerCase().includes(q))) return false
    if (fEstado !== 'Todos' && (a.estado || 'Pendiente') !== fEstado) return false
    if (fCreador !== 'Todos' && (a.usuario_nombre || a.usuario_email) !== fCreador) return false
    if (fCliente !== 'Todos' && a.cliente !== fCliente) return false
    const fl = soloFecha(a.fecha_limite)
    if (fDesde && (!fl || fl < fDesde)) return false
    if (fHasta && (!fl || fl > fHasta)) return false
    const dc = diaCreada(a.created_at)
    if (fCreadaDesde && (!dc || dc < fCreadaDesde)) return false
    if (fCreadaHasta && (!dc || dc > fCreadaHasta)) return false
    return true
  })

  const exportar = (tipo) => {
    if (!visibles.length) { setError('No hay alertas para exportar con los filtros actuales.'); return }
    if (tipo === 'csv') descargarCsv('alertas', COLUMNAS_EXPORT, visibles)
    else descargarExcel('alertas', COLUMNAS_EXPORT, visibles)
    registrarExportacion('Alertas', `${tipo.toUpperCase()} · ${visibles.length} alertas`)
  }

  const seguimientos = useMemo(
    () => cotizaciones
      .filter((c) => c.estado === 'Pendiente' && c.fecha_envio)
      .map((c) => ({ ...c, dias: diasEntre(soloFecha(c.fecha_envio), hoy) }))
      .filter((c) => c.dias >= DIAS_SEGUIMIENTO)
      .sort((a, b) => b.dias - a.dias),
    [cotizaciones, hoy]
  )

  const mostrarSeguimientos = global && ['activas', 'todas', 'seguimientos'].includes(filtro)

  return (
    <div className="p-4">
      <form id="form-alerta" onSubmit={guardar} className="mb-4 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-semibold text-white">{editId ? 'Editar alerta' : 'Nueva alerta o pendiente'}</p>
        <div className="flex flex-wrap gap-2">
          <input value={f.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Tarea o seguimiento..."
            className={`min-w-[200px] flex-1 ${input}`} />
          {!cliente && (
            <>
              <input list="clientes-agenda" value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Empresa / cliente"
                className={`w-52 ${input}`} />
              <datalist id="clientes-agenda">{clientes.map((c) => <option key={c} value={c} />)}</datalist>
            </>
          )}
          <input type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} className={input} aria-label="Fecha límite" />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-xs text-slate-400">Rango de hora *</p>
            <div className="flex items-center gap-2">
              <input type="time" value={f.ini} onChange={(e) => set('ini', e.target.value)} className={input} aria-label="Desde" />
              <span className="text-xs text-slate-400">a</span>
              <input type="time" value={f.fin} onChange={(e) => set('fin', e.target.value)} className={input} aria-label="Hasta" />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-slate-200">
            <input type="checkbox" checked={f.partido} onChange={(e) => set('partido', e.target.checked)} />
            Horario partido (2 rangos)
          </label>

          {f.partido && (
            <div>
              <p className="mb-1 text-xs text-slate-400">Segundo rango *</p>
              <div className="flex items-center gap-2">
                <input type="time" value={f.ini2} onChange={(e) => set('ini2', e.target.value)} className={input} aria-label="Segundo rango desde" />
                <span className="text-xs text-slate-400">a</span>
                <input type="time" value={f.fin2} onChange={(e) => set('fin2', e.target.value)} className={input} aria-label="Segundo rango hasta" />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!editId && (
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={aGoogle} onChange={(e) => setAGoogle(e.target.checked)} />
              {apiDisponible ? 'Sincronizar automáticamente con Google Calendar' : 'Abrir Google Calendar al guardar para agregar el evento'}
            </label>
          )}
          <div className="ml-auto flex gap-2">
            {editId && <button type="button" onClick={limpiarForm} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">Cancelar</button>}
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">{editId ? 'Guardar cambios' : 'Agregar'}</button>
          </div>
        </div>
      </form>

      {error && <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      {aviso && <p className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{aviso}</p>}

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {FILTROS.map(([k, t]) => (
          <button key={k} onClick={() => setFiltro(k)}
            className={`rounded-full border px-3 py-1 ${filtro === k ? 'border-blue-400 bg-blue-500/20 text-white' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>
            {t} ({cuentas[k]})
          </button>
        ))}
        {global && (
          <button onClick={() => setFiltro('seguimientos')}
            className={`rounded-full border px-3 py-1 ${filtro === 'seguimientos' ? 'border-blue-400 bg-blue-500/20 text-white' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>
            Seguimientos comerciales ({seguimientos.length})
          </button>
        )}
      </div>

      {filtro !== 'seguimientos' && (
        <div className="mb-4 space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar tarea, cliente, cotización o creador…"
              className={`min-w-[220px] flex-1 ${input}`} />
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className={input} aria-label="Estado">
              <option value="Todos">Todos los estados</option>
              <option>Pendiente</option><option>En curso</option><option>Completado</option>
            </select>
            <button type="button" onClick={() => setAvanzado((v) => !v)} className={boton}>{avanzado ? 'Ocultar filtros' : 'Más filtros'}</button>
            {hayFiltros && <button type="button" onClick={limpiarFiltros} className={boton}>Limpiar</button>}
            <span className="text-xs text-slate-400">{visibles.length} de {items.length}</span>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => exportar('csv')} className={boton}>Exportar CSV</button>
              <button type="button" onClick={() => exportar('excel')} className="rounded-md border border-emerald-400/40 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10">Exportar Excel</button>
            </div>
          </div>
          {avanzado && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Creada por</label>
                <select value={fCreador} onChange={(e) => setFCreador(e.target.value)} className={`w-full ${input}`}>
                  <option value="Todos">Todos</option>{creadores.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Cliente / empresa</label>
                <select value={fCliente} onChange={(e) => setFCliente(e.target.value)} className={`w-full ${input}`}>
                  <option value="Todos">Todos</option>{empresas.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Fecha límite (desde – hasta)</label>
                <div className="flex gap-1">
                  <input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} className={`w-full ${input}`} />
                  <input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} className={`w-full ${input}`} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Fecha de creación (desde – hasta)</label>
                <div className="flex gap-1">
                  <input type="date" value={fCreadaDesde} onChange={(e) => setFCreadaDesde(e.target.value)} className={`w-full ${input}`} />
                  <input type="date" value={fCreadaHasta} onChange={(e) => setFCreadaHasta(e.target.value)} className={`w-full ${input}`} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {cargando && <p className="text-sm text-slate-400">Cargando alertas…</p>}
      {!cargando && filtro !== 'seguimientos' && !visibles.length && !error && <p className="text-sm text-slate-400">{filtro === 'archivo' ? 'El archivo está vacío.' : hayFiltros ? 'Ninguna alerta coincide con los filtros.' : 'No hay alertas en esta vista.'}</p>}

      {filtro !== 'seguimientos' && (
        <ul className="space-y-2">
          {visibles.map((t) => {
            const s = semaforo(t.fecha_limite, t.estado)
            const texto = t.titulo || t.descripcion || '(sin título)'
            const gestiona = puedeGestionar(t)
            const rangos = rangosDe(t)
            return (
              <li key={t.id} className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${s.cls}`}>
                <div className="min-w-[200px] flex-1">
                  <p className={`text-sm font-medium text-white ${t.estado === 'Completado' ? 'line-through opacity-60' : ''}`}>{texto}</p>
                  {t.descripcion && t.titulo && <p className="text-xs opacity-80">✉ {t.descripcion}</p>}
                  <p className="text-xs opacity-90">
                    Límite: {t.fecha_limite ? soloFecha(t.fecha_limite) : '—'}
                    {rangos.length ? ` · ⏰ ${textoRangos(t)}` : ' · sin horario'} · {s.txt}
                    {t.n_cotizacion ? ` · Cotización ${t.n_cotizacion}` : ''}
                  </p>
                  <p className="text-xs opacity-80">
                    Cliente: <b>{t.cliente || '—'}</b> · Creada por: <b>{t.usuario_nombre || t.usuario_email || '—'}</b>
                  </p>
                  <p className="text-xs opacity-80">📅 Creada el <b>{fmtCreada(t.created_at)}</b></p>
                </div>

                {t.fecha_limite && (
                  <div className="flex flex-wrap items-center gap-1">
                    {t.gcal_event_id ? (
                      <span className="rounded-md bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300">✓ En Google Calendar</span>
                    ) : apiDisponible ? (
                      gestiona && <button type="button" onClick={() => sincronizarFila(t)} className={boton}>Sincronizar Google Calendar</button>
                    ) : (
                      <>
                        <a href={enlaceGoogleCalendar(t, 0)} target="_blank" rel="noreferrer" className={boton}>{rangos.length > 1 ? 'Calendar 1' : 'Google Calendar'}</a>
                        {rangos.length > 1 && <a href={enlaceGoogleCalendar(t, 1)} target="_blank" rel="noreferrer" className={boton}>Calendar 2</a>}
                      </>
                    )}
                    <button type="button" onClick={() => descargarIcs(t)} className={boton} title="Descargar archivo .ics (Google, Outlook, Apple)">.ics</button>
                  </div>
                )}

                {gestiona ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {t.estado !== 'Completado'
                      ? <button onClick={() => cambiarEstado(t.id, 'Completado')} className="rounded-md bg-emerald-600/80 px-2 py-1 text-xs text-white hover:bg-emerald-500">✓ Completar</button>
                      : <button onClick={() => cambiarEstado(t.id, 'Pendiente')} className={boton}>Reabrir</button>}
                    <select value={t.estado || 'Pendiente'} onChange={(e) => cambiarEstado(t.id, e.target.value)}
                      className="rounded-md border border-white/10 bg-[#0b1026]/70 px-2 py-1 text-xs text-white">
                      <option>Pendiente</option><option>En curso</option><option>Completado</option>
                    </select>
                    <button onClick={() => editar(t)} className="text-xs text-blue-300 hover:text-blue-200">Editar</button>
                    <button onClick={() => borrar(t)} className="text-xs text-red-300 hover:text-red-200">Eliminar</button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">Solo la puede modificar quien la creó</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {mostrarSeguimientos && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-blue-300">Seguimiento comercial (cotizaciones pendientes hace {DIAS_SEGUIMIENTO}+ días)</p>
          {!seguimientos.length && <p className="text-sm text-slate-400">Sin cotizaciones por seguir.</p>}
          <ul className="space-y-2">
            {seguimientos.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3">
                <div className="min-w-[200px] flex-1">
                  <p className="text-sm font-medium text-white">Cotización {c.n_cotizacion || '—'} · {c.cliente || 'sin cliente'}</p>
                  <p className="text-xs text-blue-200">Pendiente hace {c.dias} días{c.usuario_email ? ` · Vendedor: ${c.usuario_email}` : ''}</p>
                </div>
                <button onClick={() => desdeSeguimiento(c)} className={boton}>+ Crear alerta de seguimiento</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
