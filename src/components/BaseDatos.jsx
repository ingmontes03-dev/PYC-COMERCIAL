import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { tiene } from '../lib/permisos'

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

const VACIO = { empresa: '', nombre_contacto: '', correo: '', telefono: '', fiesta: '', detalle: '' }
const input = 'w-full rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs text-slate-400'

export default function BaseDatos({ user, perfil }) {
  const [lista, setLista] = useState([])
  const [form, setForm] = useState(VACIO)
  const [editId, setEditId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroFiesta, setFiltroFiesta] = useState('Todas')
  const [error, setError] = useState('')
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

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const pideDetalle = form.fiesta === FIESTA_PROFESION || form.fiesta === FIESTA_OTRO

  // El autor, o quien tenga el permiso, puede editar / eliminar (la base de datos lo vuelve a validar)
  const puedeEditar = (p) => p.usuario_id === user.id || tiene(perfil, 'cotizaciones_editar')
  const puedeEliminar = (p) => p.usuario_id === user.id || tiene(perfil, 'cotizaciones_eliminar')

  const nuevo = () => { setForm(VACIO); setEditId(null); setError('') }

  const editar = (p) => {
    setForm({
      empresa: p.empresa || '', nombre_contacto: p.nombre_contacto || '', correo: p.correo || '',
      telefono: p.telefono || '', fiesta: p.fiesta || '', detalle: p.detalle || '',
    })
    setEditId(p.id)
    setError('')
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  const guardar = async (e) => {
    e.preventDefault()
    const d = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]))

    if (!d.empresa || !d.nombre_contacto || !d.correo || !d.telefono || !d.fiesta) {
      setError('Completa: Cliente / Empresa, Persona que atiende, Correo, Teléfono / WhatsApp y Fiesta / Fecha Especial.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo)) { setError('El correo no tiene un formato válido.'); return }
    if (d.telefono.replace(/\D/g, '').length < 7) { setError('El teléfono / WhatsApp debe tener al menos 7 dígitos.'); return }

    const payload = { ...d, detalle: pideDetalle ? d.detalle || null : null }

    setGuardando(true)
    let resultado
    if (editId) {
      resultado = await supabase.from('clientes_prospeccion').update(payload).eq('id', editId).select('id')
    } else {
      resultado = await supabase.from('clientes_prospeccion').insert({ ...payload, usuario_email: user.email }).select('id')
    }
    setGuardando(false)

    const { data, error } = resultado
    if (error) {
      setError(`No se pudo guardar: ${error.message}${/relation|schema cache|column/i.test(error.message) ? ' — Ejecuta supabase_schema.sql en Supabase.' : ''}`)
      return
    }
    if (!data?.length) { setError('No tienes permiso para modificar este registro.'); return }
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
      (!q || [p.empresa, p.nombre_contacto, p.correo, p.telefono, p.fiesta, p.detalle].some((v) => (v || '').toLowerCase().includes(q)))
    )
  }, [lista, busqueda, filtroFiesta])

  return (
    <div className="space-y-5 p-4">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar empresa, contacto, correo, teléfono…"
            className={`${input} max-w-md`} />
          <select value={filtroFiesta} onChange={(e) => setFiltroFiesta(e.target.value)} className={`${input} max-w-xs`}>
            <option>Todas</option>
            {FIESTAS.map((f) => <option key={f}>{f}</option>)}
          </select>
          <span className="text-xs text-slate-400">{filtrados.length} de {lista.length} registros</span>
        </div>

        {errorLista && <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{errorLista}</p>}

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-[#1b2150] text-xs uppercase tracking-wide text-slate-300">
              <tr>
                {['Cliente / Empresa', 'Persona que atiende', 'Correo electrónico', 'Teléfono / WhatsApp', 'Fiesta / Fecha especial', 'Registrado por', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td colSpan={7} className="p-4 text-center text-slate-400">Cargando…</td></tr>}
              {!cargando && !filtrados.length && <tr><td colSpan={7} className="p-4 text-center text-slate-400">Sin registros.</td></tr>}
              {filtrados.map((p) => (
                <tr key={p.id} className={`border-t border-white/5 hover:bg-white/[0.03] ${editId === p.id ? 'bg-blue-500/10' : ''}`}>
                  <td className="px-3 py-2 font-medium text-white">{p.empresa}</td>
                  <td className="px-3 py-2">{p.nombre_contacto}</td>
                  <td className="px-3 py-2"><a className="text-blue-300 hover:underline" href={`mailto:${p.correo}`}>{p.correo}</a></td>
                  <td className="px-3 py-2">
                    <a className="text-blue-300 hover:underline" href={`https://wa.me/${(p.telefono || '').replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{p.telefono}</a>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300">{p.fiesta}</span>
                    {p.detalle && <span className="ml-2 text-xs text-slate-400">{p.detalle}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">{p.usuario_email || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {puedeEditar(p) && <button onClick={() => editar(p)} className="mr-3 text-xs text-blue-300 hover:text-blue-200">Editar</button>}
                    {puedeEliminar(p) && <button onClick={() => eliminar(p)} className="text-xs text-red-300 hover:text-red-200">Eliminar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={guardar} className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">{editId ? 'Editar registro' : 'Registrar cliente / prospecto'}</p>
          {editId && <button type="button" onClick={nuevo} className="text-xs text-slate-300 hover:text-white">Cancelar edición</button>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label}>Cliente / Empresa *</label>
            <input value={form.empresa} onChange={(e) => set('empresa', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Persona que atiende *</label>
            <input value={form.nombre_contacto} onChange={(e) => set('nombre_contacto', e.target.value)} className={input} placeholder="Nombre del contacto / representante" />
          </div>
          <div>
            <label className={label}>Correo electrónico *</label>
            <input type="email" value={form.correo} onChange={(e) => set('correo', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Teléfono / WhatsApp *</label>
            <input type="tel" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Fiesta / Fechas Especiales *</label>
            <select value={form.fiesta} onChange={(e) => set('fiesta', e.target.value)} className={input}>
              <option value="">Seleccionar…</option>
              {FIESTAS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          {pideDetalle && (
            <div>
              <label className={label}>{form.fiesta === FIESTA_PROFESION ? 'Profesión (Secretaria, Médico, Ingeniero, Contador…)' : '¿Qué evento?'}</label>
              <input value={form.detalle} onChange={(e) => set('detalle', e.target.value)} className={input} />
            </div>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-3 flex justify-end">
          <button disabled={guardando} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
            {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : '+ Agregar a la base de datos'}
          </button>
        </div>
      </form>
    </div>
  )
}
