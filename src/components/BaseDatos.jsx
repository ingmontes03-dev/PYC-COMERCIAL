import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { tiene } from '../lib/permisos'
import { descargarCsv, descargarExcel, registrarExportacion } from '../lib/exportar'

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

const EMPRESA_VACIA = { empresa: '', direccion: '', fiesta: '', detalle: '' }
const contactoVacio = () => ({ nombre_contacto: '', correo: '', telefono: '' })

const input = 'w-full rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs text-slate-400'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const COLUMNAS_EXPORT = [
  { k: 'empresa', t: 'Cliente / Empresa' },
  { k: 'nombre_contacto', t: 'Persona que atiende' },
  { k: 'correo', t: 'Correo electrónico' },
  { k: 'telefono', t: 'Teléfono / WhatsApp' },
  { k: 'direccion', t: 'Dirección' },
  { k: 'fiesta', t: 'Fiesta / Fecha especial' },
  { k: 'detalle', t: 'Detalle (profesión o evento)' },
  { k: 'usuario_email', t: 'Registrado por' },
  { k: 'created_at', t: 'Fecha de registro', f: (p) => (p.created_at ? new Date(p.created_at).toLocaleString('es-CO') : '') },
]

export default function BaseDatos({ user, perfil }) {
  const [lista, setLista] = useState([])
  const [emp, setEmp] = useState(EMPRESA_VACIA)
  const [contactos, setContactos] = useState([contactoVacio()])
  const [editId, setEditId] = useState(null)
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

  const nuevo = () => { setEmp(EMPRESA_VACIA); setContactos([contactoVacio()]); setEditId(null); setError('') }

  const irAlFormulario = () => document.getElementById('form-contactos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const editar = (p) => {
    setEmp({ empresa: p.empresa || '', direccion: p.direccion || '', fiesta: p.fiesta || '', detalle: p.detalle || '' })
    setContactos([{ nombre_contacto: p.nombre_contacto || '', correo: p.correo || '', telefono: p.telefono || '' }])
    setEditId(p.id)
    setError(''); setAviso('')
    irAlFormulario()
  }

  // Agregar otro contacto a una empresa que ya existe: precarga los datos de la empresa
  const agregarContacto = (p) => {
    setEmp({ empresa: p.empresa || '', direccion: p.direccion || '', fiesta: p.fiesta || '', detalle: p.detalle || '' })
    setContactos([contactoVacio()])
    setEditId(null)
    setError(''); setAviso('')
    irAlFormulario()
  }

  const guardar = async (e) => {
    e.preventDefault()
    setAviso('')
    const empresa = emp.empresa.trim()
    if (!empresa || !emp.fiesta) { setError('Completa: Cliente / Empresa y Fiesta / Fecha Especial.'); return }

    for (let i = 0; i < contactos.length; i += 1) {
      const c = contactos[i]
      const n = contactos.length > 1 ? ` (contacto ${i + 1})` : ''
      if (!c.nombre_contacto.trim()) { setError(`Escribe la persona que atiende${n}.`); return }
      if (c.telefono.replace(/\D/g, '').length < 7) { setError(`El teléfono / WhatsApp debe tener al menos 7 dígitos${n}.`); return }
      if (c.correo.trim() && !EMAIL.test(c.correo.trim())) { setError(`El correo no tiene un formato válido${n}. Puedes dejarlo vacío.`); return }
    }

    const comunes = {
      empresa,
      direccion: emp.direccion.trim() || null,
      fiesta: emp.fiesta,
      detalle: pideDetalle ? emp.detalle.trim() || null : null,
    }
    const filas = contactos.map((c) => ({
      ...comunes,
      nombre_contacto: c.nombre_contacto.trim(),
      correo: c.correo.trim() || null, // el correo es opcional
      telefono: c.telefono.trim(),
    }))

    setGuardando(true)
    let resultado
    if (editId) {
      resultado = await supabase.from('clientes_prospeccion').update(filas[0]).eq('id', editId).select('id')
    } else {
      resultado = await supabase.from('clientes_prospeccion').insert(filas.map((f) => ({ ...f, usuario_email: user.email }))).select('id')
    }
    setGuardando(false)

    const { data, error } = resultado
    if (error) {
      setError(`No se pudo guardar: ${error.message}${/relation|schema cache|column|null value/i.test(error.message) ? ' — Ejecuta supabase_schema.sql en Supabase (SQL Editor) y recarga la página.' : ''}`)
      return
    }
    if (!data?.length) { setError('No tienes permiso para modificar este registro.'); return }
    setAviso(editId ? 'Registro actualizado.' : `${data.length} contacto${data.length === 1 ? '' : 's'} guardado${data.length === 1 ? '' : 's'} para ${empresa}.`)
    nuevo()
    cargar()
  }

  const eliminar = async (p) => {
    if (!window.confirm(`¿Eliminar a ${p.nombre_contacto} (${p.empresa})?`)) return
    const { data, error } = await supabase.from('clientes_prospeccion').delete().eq('id', p.id).select('id')
    if (error) { setErrorLista(error.message); return }
    if (!data?.length) { setErrorLista('No tienes permiso para eliminar este registro.'); return }
    if (editId === p.id) nuevo()
    cargar()
  }

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return lista.filter((p) =>
      (filtroFiesta === 'Todas' || p.fiesta === filtroFiesta) &&
      (!q || [p.empresa, p.nombre_contacto, p.correo, p.telefono, p.direccion, p.fiesta, p.detalle].some((v) => (v || '').toLowerCase().includes(q)))
    )
  }, [lista, busqueda, filtroFiesta])

  const exportar = (tipo) => {
    if (!filtrados.length) { setErrorLista('No hay registros para exportar.'); return }
    if (tipo === 'csv') descargarCsv('base-de-datos', COLUMNAS_EXPORT, filtrados)
    else descargarExcel('base-de-datos', COLUMNAS_EXPORT, filtrados)
    registrarExportacion('Base de Datos', `${tipo.toUpperCase()} · ${filtrados.length} registros`)
  }

  return (
    <div className="space-y-5 p-4">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar empresa, contacto, correo, teléfono, dirección…"
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
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-[#1b2150] text-xs uppercase tracking-wide text-slate-300">
              <tr>
                {['Cliente / Empresa', 'Persona que atiende', 'Correo electrónico', 'Teléfono / WhatsApp', 'Dirección', 'Fiesta / Fecha especial', 'Registrado por', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td colSpan={8} className="p-4 text-center text-slate-400">Cargando…</td></tr>}
              {!cargando && !filtrados.length && <tr><td colSpan={8} className="p-4 text-center text-slate-400">Sin registros.</td></tr>}
              {filtrados.map((p) => (
                <tr key={p.id} className={`border-t border-white/5 hover:bg-white/[0.03] ${editId === p.id ? 'bg-blue-500/10' : ''}`}>
                  <td className="px-3 py-2 font-medium text-white">{p.empresa}</td>
                  <td className="px-3 py-2">{p.nombre_contacto}</td>
                  <td className="px-3 py-2">
                    {p.correo ? <a className="text-blue-300 hover:underline" href={`mailto:${p.correo}`}>{p.correo}</a> : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <a className="text-blue-300 hover:underline" href={`https://wa.me/${(p.telefono || '').replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{p.telefono}</a>
                  </td>
                  <td className="px-3 py-2 text-slate-300">{p.direccion || <span className="text-slate-500">—</span>}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300">{p.fiesta}</span>
                    {p.detalle && <span className="ml-2 text-xs text-slate-400">{p.detalle}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">{p.usuario_email || '—'}</td>
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
        </div>

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
            <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-white/10 bg-[#0b1026]/40 p-3 sm:grid-cols-3">
              {contactos.length > 1 && <div className="text-xs font-semibold text-violet-300 sm:col-span-3">Contacto {i + 1}</div>}
              <div>
                <label className={label}>Persona que atiende *</label>
                <input value={c.nombre_contacto} onChange={(e) => setC(i, 'nombre_contacto', e.target.value)} className={input} placeholder="Nombre del contacto / representante" />
              </div>
              <div>
                <label className={label}>Correo electrónico (opcional)</label>
                <input type="email" value={c.correo} onChange={(e) => setC(i, 'correo', e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Teléfono / WhatsApp *</label>
                <input type="tel" value={c.telefono} onChange={(e) => setC(i, 'telefono', e.target.value)} className={input} />
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
    </div>
  )
}
