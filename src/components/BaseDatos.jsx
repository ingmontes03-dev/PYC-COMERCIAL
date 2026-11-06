import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { tiene } from '../lib/permisos'
import { descargarCsv, descargarExcel, registrarExportacion } from '../lib/exportar'
import { fmtFecha, hoyStr, soloFecha } from '../lib/fechas'

export const FIESTAS = [
  'Día del Niño',
  'Día de la Madre',
  'Día del Padre',
  'Día de la Mujer',
  'Día del Hombre',
  'Día del Esposo / Pareja',
  'Día del Conductor',
  'Días del Profesional / Profesiones',
  'Fiesta de Fin de Año / Regalos Corporativos',
  'Otro / Evento Especial',
]
const FIESTA_PROFESION = 'Días del Profesional / Profesiones'
const FIESTA_OTRO = 'Otro / Evento Especial'
const MAX_CONTACTOS = 10
const AVISOS = [[0, 'El mismo día'], [3, '3 días antes'], [7, '7 días antes'], [15, '15 días antes'], [30, '30 días antes']]

const EMPRESA_VACIA = { empresa: '', direccion: '', fiesta: '', detalle: '', fecha_especial: '', aviso_dias: 7 }
const contactoVacio = () => ({ nombre_contacto: '', correo: '', correo2: '', telefono: '', observaciones: '', abierta: false })

const input = 'w-full rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs text-slate-400'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Fecha y hora de cada movimiento (hora de Colombia)
const fmtRegistro = (v) => {
  const d = v ? new Date(v) : null
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''
}

const aDate = (s) => { const [y, m, d] = soloFecha(s).split('-').map(Number); return new Date(y, m - 1, d) }
const sumarDias = (s, n) => { const d = aDate(s); d.setDate(d.getDate() + n); return fmtFecha(d) }

// Día en que suena la alarma: próxima ocurrencia de la fecha especial menos los días de anticipación (nunca antes de hoy)
function fechaAlarma(fechaEspecial, avisoDias) {
  const hoy = hoyStr()
  let o = aDate(fechaEspecial)
  while (fmtFecha(o) < hoy) o = new Date(o.getFullYear() + 1, o.getMonth(), o.getDate())
  const alarma = sumarDias(fmtFecha(o), -avisoDias)
  return alarma < hoy ? hoy : alarma
}

const COLUMNAS_EXPORT = [
  { k: 'empresa', t: 'Cliente / Empresa' },
  { k: 'nombre_contacto', t: 'Persona que atiende' },
  { k: 'correo', t: 'Correo electrónico' },
  { k: 'correo2', t: 'Correo electrónico 2' },
  { k: 'telefono', t: 'Teléfono / WhatsApp' },
  { k: 'direccion', t: 'Dirección' },
  { k: 'fiesta', t: 'Fiesta / Fecha especial' },
  { k: 'detalle', t: 'Detalle (profesión o evento)' },
  { k: 'fecha_especial', t: 'Fecha especial de compra', f: (p) => soloFecha(p.fecha_especial) },
  { k: 'aviso_dias', t: 'Días de aviso', f: (p) => (p.fecha_especial ? p.aviso_dias ?? '' : '') },
  { k: 'observaciones', t: 'Observaciones' },
  { k: 'usuario_email', t: 'Registrado por' },
  { k: 'created_at', t: 'Fecha y hora de registro', f: (p) => fmtRegistro(p.created_at) },
]

export default function BaseDatos({ user, perfil }) {
  const [lista, setLista] = useState([])
  const [emp, setEmp] = useState(EMPRESA_VACIA)
  const [contactos, setContactos] = useState([contactoVacio()])
  const [editId, setEditId] = useState(null)
  const [alertaRef, setAlertaRef] = useState(null) // alerta existente que se reutiliza al agregar otro contacto de la misma empresa
  const [busqueda, setBusqueda] = useState('')
  const [filtroFiesta, setFiltroFiesta] = useState('Todas')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [errorLista, setErrorLista] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error } = await supabase.from('clientes_prospeccion').select('*').order('created_at', { ascending: false })
    if (error) { setErrorLista(`No se pudo cargar la base de datos: ${error.message}`); setLista([]) }
    else { setErrorLista(''); setLista(data || []) }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const setE = (k, v) => setEmp((p) => ({ ...p, [k]: v }))
  const setC = (i, k, v) => setContactos((p) => p.map((c, j) => (j === i ? { ...c, [k]: v } : c)))
  const pideDetalle = emp.fiesta === FIESTA_PROFESION || emp.fiesta === FIESTA_OTRO

  // Cantidad de contactos que se van a ingresar a la vez para la misma empresa
  const cambiarCantidad = (n) => {
    setContactos((prev) => (n <= prev.length ? prev.slice(0, n) : [...prev, ...Array.from({ length: n - prev.length }, contactoVacio)]))
  }

  // El autor, o quien tenga el permiso, puede editar / eliminar (la base de datos lo vuelve a validar)
  const puedeEditar = (p) => p.usuario_id === user.id || tiene(perfil, 'cotizaciones_editar')
  const puedeEliminar = (p) => p.usuario_id === user.id || tiene(perfil, 'cotizaciones_eliminar')

  const nuevo = () => { setEmp(EMPRESA_VACIA); setContactos([contactoVacio()]); setEditId(null); setAlertaRef(null); setError('') }

  const irAlFormulario = () => document.getElementById('form-contactos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const datosEmpresa = (p) => ({
    empresa: p.empresa || '', direccion: p.direccion || '', fiesta: p.fiesta || '', detalle: p.detalle || '',
    fecha_especial: soloFecha(p.fecha_especial), aviso_dias: p.aviso_dias ?? 7,
  })

  const editar = (p) => {
    setEmp(datosEmpresa(p))
    setContactos([{
      nombre_contacto: p.nombre_contacto || '', correo: p.correo || '', correo2: p.correo2 || '',
      telefono: p.telefono || '', observaciones: p.observaciones || '', abierta: !!p.observaciones,
    }])
    setEditId(p.id)
    setAlertaRef(null)
    setError(''); setAviso('')
    irAlFormulario()
  }

  // Agregar otro contacto a una empresa que ya existe: precarga los datos de la empresa
  // y, si ya tiene alarma, la comparte en vez de crear otra igual
  const agregarContacto = (p) => {
    setEmp(datosEmpresa(p))
    setContactos([contactoVacio()])
    setEditId(null)
    setAlertaRef(p.alerta_id && p.fecha_especial ? { id: p.alerta_id, fecha: soloFecha(p.fecha_especial), aviso: p.aviso_dias ?? 7 } : null)
    setError(''); setAviso('')
    irAlFormulario()
  }

  // Alarma en Agenda: el título es corto (lo lee la voz) y los correos van en la descripción
  const datosAlerta = (filas, empresa, avisoDias) => ({
    titulo: `Fecha especial: ${emp.fiesta}${pideDetalle && emp.detalle.trim() ? ` (${emp.detalle.trim()})` : ''} · ${empresa}`,
    descripcion: filas
      .map((c) => [c.nombre_contacto, c.correo, c.correo2, c.telefono && `Tel. ${c.telefono}`].filter(Boolean).join(' · '))
      .join('  |  '),
    cliente: empresa,
    fecha_limite: fechaAlarma(emp.fecha_especial, avisoDias),
    hora_inicio: '08:00',
    hora_fin: '09:00',
  })

  const crearAlerta = async (filas, empresa, avisoDias) => {
    const { data, error } = await supabase
      .from('alertas')
      .insert({
        ...datosAlerta(filas, empresa, avisoDias),
        estado: 'Pendiente',
        tipo: 'fecha_especial',
        usuario_email: user.email,
        usuario_nombre: perfil.nombre || user.email,
      })
      .select('id')
      .single()
    return error ? { error: error.message } : { id: String(data.id) }
  }

  const borrarAlerta = (id) => supabase.from('alertas').delete().eq('id', id)

  const guardar = async (e) => {
    e.preventDefault()
    setAviso(''); setError('')
    const empresa = emp.empresa.trim()
    if (!empresa || !emp.fiesta) { setError('Completa: Cliente / Empresa y Fiesta / Fecha Especial.'); return }

    for (let i = 0; i < contactos.length; i += 1) {
      const c = contactos[i]
      const n = contactos.length > 1 ? ` (contacto ${i + 1})` : ''
      if (!c.nombre_contacto.trim()) { setError(`Escribe la persona que atiende${n}.`); return }
      if (c.telefono.replace(/\D/g, '').length < 7) { setError(`El teléfono / WhatsApp debe tener al menos 7 dígitos${n}.`); return }
      if (c.correo.trim() && !EMAIL.test(c.correo.trim())) { setError(`El primer correo no tiene un formato válido${n}. Puedes dejarlo vacío.`); return }
      if (c.correo2.trim() && !EMAIL.test(c.correo2.trim())) { setError(`El segundo correo no tiene un formato válido${n}. Puedes dejarlo vacío.`); return }
    }

    const avisoDias = Number(emp.aviso_dias) || 0
    const fecha = emp.fecha_especial || null
    const comunes = {
      empresa,
      direccion: emp.direccion.trim() || null,
      fiesta: emp.fiesta,
      detalle: pideDetalle ? emp.detalle.trim() || null : null,
      fecha_especial: fecha,
      aviso_dias: avisoDias,
    }
    const filas = contactos.map((c) => ({
      ...comunes,
      nombre_contacto: c.nombre_contacto.trim(),
      correo: c.correo.trim() || null, // los correos son opcionales
      correo2: c.correo2.trim() || null,
      telefono: c.telefono.trim(),
      observaciones: c.observaciones.trim() || null,
    }))

    setGuardando(true)
    let nota = ''
    let alertaId = null
    let alertaCreada = false
    let alertaBorrar = null

    if (editId) {
      const p = lista.find((x) => x.id === editId)
      alertaId = p?.alerta_id || null
      const otros = alertaId ? lista.filter((x) => x.alerta_id === alertaId && x.id !== editId).length : 0
      const igual = !!p && (soloFecha(p.fecha_especial) || null) === fecha && (p.aviso_dias ?? 7) === avisoDias
      if (!fecha) {
        if (alertaId && !otros) alertaBorrar = alertaId
        alertaId = null
      } else if (alertaId && !otros && !igual) {
        const { error } = await supabase.from('alertas').update(datosAlerta(filas, empresa, avisoDias)).eq('id', alertaId)
        if (error) nota = ` No se pudo actualizar la alarma: ${error.message}`
      } else if (!alertaId || (otros && !igual)) {
        const r = await crearAlerta(filas, empresa, avisoDias)
        alertaId = r.id || null
        alertaCreada = !!r.id
        if (r.error) nota = ` No se pudo crear la alarma en Agenda: ${r.error}`
      }
    } else if (fecha) {
      if (alertaRef && alertaRef.fecha === fecha && alertaRef.aviso === avisoDias) {
        alertaId = alertaRef.id
      } else {
        const r = await crearAlerta(filas, empresa, avisoDias)
        alertaId = r.id || null
        alertaCreada = !!r.id
        if (r.error) nota = ` No se pudo crear la alarma en Agenda: ${r.error}`
      }
    }

    let resultado
    if (editId) {
      resultado = await supabase.from('clientes_prospeccion').update({ ...filas[0], alerta_id: alertaId }).eq('id', editId).select('id')
    } else {
      resultado = await supabase.from('clientes_prospeccion')
        .insert(filas.map((f) => ({ ...f, alerta_id: alertaId, usuario_email: user.email }))).select('id')
    }
    const { data, error } = resultado

    if (error || !data?.length) {
      if (alertaCreada && alertaId) await borrarAlerta(alertaId) // no deja alarmas huérfanas
      setGuardando(false)
      setError(error
        ? `No se pudo guardar: ${error.message}${/relation|schema cache|column|null value/i.test(error.message) ? ' — Ejecuta supabase_schema.sql en Supabase (SQL Editor) y recarga la página.' : ''}`
        : 'No tienes permiso para modificar este registro.')
      return
    }
    if (alertaBorrar) await borrarAlerta(alertaBorrar)
    setGuardando(false)

    const base = editId ? 'Registro actualizado.' : `${data.length} contacto${data.length === 1 ? '' : 's'} guardado${data.length === 1 ? '' : 's'} para ${empresa}.`
    setAviso(`${base}${alertaId && fecha ? ` Alarma programada en Agenda para el ${fechaAlarma(fecha, avisoDias)}.` : ''}${nota}`)
    nuevo()
    cargar()
  }

  const eliminar = async (p) => {
    if (!window.confirm(`¿Eliminar a ${p.nombre_contacto} (${p.empresa})?`)) return
    const { data, error } = await supabase.from('clientes_prospeccion').delete().eq('id', p.id).select('id')
    if (error) { setErrorLista(error.message); return }
    if (!data?.length) { setErrorLista('No tienes permiso para eliminar este registro.'); return }
    if (p.alerta_id && !lista.some((x) => x.alerta_id === p.alerta_id && x.id !== p.id)) await borrarAlerta(p.alerta_id)
    if (editId === p.id) nuevo()
    cargar()
  }

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return lista.filter((p) =>
      (filtroFiesta === 'Todas' || p.fiesta === filtroFiesta) &&
      (!q || [p.empresa, p.nombre_contacto, p.correo, p.correo2, p.telefono, p.direccion, p.fiesta, p.detalle, p.observaciones]
        .some((v) => (v || '').toLowerCase().includes(q)))
    )
  }, [lista, busqueda, filtroFiesta])

  const exportar = (tipo) => {
    if (!filtrados.length) { setErrorLista('No hay registros para exportar.'); return }
    if (tipo === 'csv') descargarCsv('base-de-datos', COLUMNAS_EXPORT, filtrados)
    else descargarExcel('base-de-datos', COLUMNAS_EXPORT, filtrados)
    registrarExportacion('Base de Datos', `${tipo.toUpperCase()} · ${filtrados.length} registros`)
  }

  const enlaceCorreo = (c) => <a className="block text-blue-300 hover:underline" href={`mailto:${c}`}>{c}</a>

  return (
    <div className="space-y-5 p-4">
      {/* FORMULARIO: arriba del listado */}
      <form id="form-contactos" onSubmit={guardar} className="scroll-mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">{editId ? 'Editar registro' : 'Registrar cliente / prospecto'}</p>
          {editId && <button type="button" onClick={nuevo} className="text-xs text-slate-300 hover:text-white">Cancelar edición</button>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label}>Cliente / Empresa *</label>
            <input value={emp.empresa} onChange={(e) => setE('empresa', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Dirección</label>
            <input value={emp.direccion} onChange={(e) => setE('direccion', e.target.value)} className={input} placeholder="Calle / carrera, barrio, ciudad" />
          </div>
          <div>
            <label className={label}>Fiesta / Fechas Especiales *</label>
            <select value={emp.fiesta} onChange={(e) => setE('fiesta', e.target.value)} className={input}>
              <option value="">Seleccionar…</option>
              {FIESTAS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          {pideDetalle && (
            <div>
              <label className={label}>{emp.fiesta === FIESTA_PROFESION ? 'Profesión (Secretaria, Médico, Ingeniero, Contador…)' : '¿Qué evento?'}</label>
              <input value={emp.detalle} onChange={(e) => setE('detalle', e.target.value)} className={input} />
            </div>
          )}
          <div>
            <label className={label}>Fecha especial de compra (programa una alarma)</label>
            <input type="date" value={emp.fecha_especial} onChange={(e) => setE('fecha_especial', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Avisar con anticipación</label>
            <select value={emp.aviso_dias} onChange={(e) => setE('aviso_dias', Number(e.target.value))} disabled={!emp.fecha_especial} className={`${input} disabled:opacity-50`}>
              {AVISOS.map(([n, t]) => <option key={n} value={n}>{t}</option>)}
            </select>
          </div>
        </div>
        {emp.fecha_especial && (
          <p className="mt-2 text-xs text-slate-400">
            Se crea una alerta en Agenda para el <b className="text-slate-200">{fechaAlarma(emp.fecha_especial, Number(emp.aviso_dias) || 0)}</b> con los correos
            y teléfonos de los contactos. Si la fecha ya pasó este año, se programa para la próxima.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-white">Personas que atienden</p>
          {!editId && (
            <label className="flex items-center gap-2 text-xs text-slate-300">
              ¿Cuántos contactos de esta empresa vas a agregar?
              <select value={contactos.length} onChange={(e) => cambiarCantidad(Number(e.target.value))}
                className="rounded-lg border border-white/10 bg-[#0b1026]/70 px-2 py-1 text-sm text-white outline-none">
                {Array.from({ length: MAX_CONTACTOS }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="mt-3 space-y-3">
          {contactos.map((c, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-white/10 bg-[#0b1026]/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
              {contactos.length > 1 && <div className="text-xs font-semibold text-violet-300 sm:col-span-2 lg:col-span-4">Contacto {i + 1}</div>}
              <div>
                <label className={label}>Persona que atiende *</label>
                <input value={c.nombre_contacto} onChange={(e) => setC(i, 'nombre_contacto', e.target.value)} className={input} placeholder="Nombre del contacto / representante" />
              </div>
              <div>
                <label className={label}>Correo electrónico (opcional)</label>
                <input type="email" value={c.correo} onChange={(e) => setC(i, 'correo', e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Segundo correo (opcional)</label>
                <input type="email" value={c.correo2} onChange={(e) => setC(i, 'correo2', e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Teléfono / WhatsApp *</label>
                <input type="tel" value={c.telefono} onChange={(e) => setC(i, 'telefono', e.target.value)} className={input} />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <button type="button" onClick={() => setC(i, 'abierta', !c.abierta)} className="text-xs text-blue-300 hover:text-blue-200">
                  {c.abierta ? '▾ Ocultar observaciones' : `▸ Observaciones${c.observaciones.trim() ? ' (con texto)' : ''}`}
                </button>
                {c.abierta && (
                  <textarea value={c.observaciones} onChange={(e) => setC(i, 'observaciones', e.target.value)} rows={3}
                    placeholder="Notas del cliente: gustos, qué suele comprar, mejor hora para llamar…" className={`${input} mt-2`} />
                )}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-3 flex justify-end">
          <button disabled={guardando} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
            {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : contactos.length > 1 ? `+ Agregar ${contactos.length} contactos` : '+ Agregar a la base de datos'}
          </button>
        </div>
      </form>

      {/* LISTADO */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar empresa, contacto, correo, teléfono, dirección, observaciones…"
            className={`${input} max-w-md`} />
          <select value={filtroFiesta} onChange={(e) => setFiltroFiesta(e.target.value)} className={`${input} max-w-xs`}>
            <option>Todas</option>
            {FIESTAS.map((f) => <option key={f}>{f}</option>)}
          </select>
          <span className="text-xs text-slate-400">{filtrados.length} de {lista.length} registros</span>
          <div className="ml-auto flex gap-2">
            <button onClick={() => exportar('csv')} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-100 hover:bg-white/10">Exportar CSV</button>
            <button onClick={() => exportar('excel')} className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/10">Exportar Excel</button>
          </div>
        </div>

        {errorLista && <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{errorLista}</p>}
        {aviso && <p className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{aviso}</p>}

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[1300px] text-sm">
            <thead className="bg-[#1b2150] text-xs uppercase tracking-wide text-slate-300">
              <tr>
                {['Cliente / Empresa', 'Persona que atiende', 'Correos', 'Teléfono / WhatsApp', 'Dirección', 'Fiesta / Fecha especial', 'Observaciones', 'Registrado', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td colSpan={9} className="p-4 text-center text-slate-400">Cargando…</td></tr>}
              {!cargando && !filtrados.length && <tr><td colSpan={9} className="p-4 text-center text-slate-400">Sin registros.</td></tr>}
              {filtrados.map((p) => (
                <tr key={p.id} className={`border-t border-white/5 align-top hover:bg-white/[0.03] ${editId === p.id ? 'bg-blue-500/10' : ''}`}>
                  <td className="px-3 py-2 font-medium text-white">{p.empresa}</td>
                  <td className="px-3 py-2">{p.nombre_contacto}</td>
                  <td className="px-3 py-2">
                    {p.correo || p.correo2
                      ? <>{p.correo && enlaceCorreo(p.correo)}{p.correo2 && enlaceCorreo(p.correo2)}</>
                      : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <a className="text-blue-300 hover:underline" href={`https://wa.me/${(p.telefono || '').replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{p.telefono}</a>
                  </td>
                  <td className="px-3 py-2 text-slate-300">{p.direccion || <span className="text-slate-500">—</span>}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300">{p.fiesta}</span>
                    {p.detalle && <span className="ml-2 text-xs text-slate-400">{p.detalle}</span>}
                    {p.fecha_especial && (
                      <span className="mt-1 block text-xs text-amber-300">
                        📅 {soloFecha(p.fecha_especial)}{p.alerta_id ? ` · alarma ${p.aviso_dias ? `${p.aviso_dias} días antes` : 'el mismo día'}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {p.observaciones ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-blue-300">Ver</summary>
                        <p className="mt-1 max-w-[260px] whitespace-pre-wrap text-xs text-slate-300">{p.observaciones}</p>
                      </details>
                    ) : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
                    {p.usuario_email || '—'}
                    <span className="block">{fmtRegistro(p.created_at) || '—'}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button onClick={() => agregarContacto(p)} className="mr-3 text-xs text-violet-300 hover:text-violet-200" title="Agregar otro contacto de esta empresa">+ Contacto</button>
                    {puedeEditar(p) && <button onClick={() => editar(p)} className="mr-3 text-xs text-blue-300 hover:text-blue-200">Editar</button>}
                    {puedeEliminar(p) && <button onClick={() => eliminar(p)} className="text-xs text-red-300 hover:text-red-200">Eliminar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
