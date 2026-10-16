import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

const VACIO = { empresa: '', nombre_cliente: '', correo: '', telefono: '', area: '' }
const AREAS = ['Compras', 'Bienestar', 'Recursos Humanos', 'Gerencia', 'Producción', 'Mantenimiento', 'Calidad', 'Contabilidad']
const input = 'w-full rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs text-slate-400'

export default function Llamadas({ user }) {
  const [lista, setLista] = useState([])
  const [form, setForm] = useState(VACIO)
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState('')
  const [errorLista, setErrorLista] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error } = await supabase
      .from('llamadas_prospectos')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      setErrorLista(`No se pudo cargar la base de datos: ${error.message}`)
      setLista([])
    } else {
      setErrorLista('')
      setLista(data || [])
    }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const guardar = async (e) => {
    e.preventDefault()
    const d = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]))

    if (!d.empresa || !d.nombre_cliente || !d.correo || !d.telefono || !d.area) {
      setError('Todos los campos son obligatorios: Empresa, Nombre del cliente, Correo, Teléfono y Área.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo)) {
      setError('El correo no tiene un formato válido.')
      return
    }
    if (d.telefono.replace(/\D/g, '').length < 7) {
      setError('El teléfono debe tener al menos 7 dígitos.')
      return
    }

    setGuardando(true)
    const { error } = await supabase.from('llamadas_prospectos').insert({ ...d, usuario_email: user.email })
    setGuardando(false)
    if (error) { setError(`No se pudo guardar: ${error.message}`); return }
    setForm(VACIO)
    setError('')
    cargar()
  }

  const eliminar = async (p) => {
    if (!window.confirm(`¿Eliminar a ${p.nombre_cliente} (${p.empresa})?`)) return
    const { error } = await supabase.from('llamadas_prospectos').delete().eq('id', p.id)
    if (error) { setErrorLista(error.message); return }
    cargar()
  }

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return lista
    return lista.filter((p) =>
      [p.empresa, p.nombre_cliente, p.correo, p.telefono, p.area].some((v) => (v || '').toLowerCase().includes(q))
    )
  }, [lista, busqueda])

  return (
    <div className="space-y-5 p-4">
      <form onSubmit={guardar} className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="mb-3 text-sm font-semibold text-white">Registrar prospecto</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className={label}>Empresa *</label>
            <input value={form.empresa} onChange={(e) => set('empresa', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Nombre del cliente *</label>
            <input value={form.nombre_cliente} onChange={(e) => set('nombre_cliente', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Correo *</label>
            <input type="email" value={form.correo} onChange={(e) => set('correo', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Teléfono *</label>
            <input type="tel" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Área * (Compras, Bienestar…)</label>
            <input list="areas-llamadas" value={form.area} onChange={(e) => set('area', e.target.value)} className={input} />
            <datalist id="areas-llamadas">{AREAS.map((a) => <option key={a} value={a} />)}</datalist>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-3 flex justify-end">
          <button disabled={guardando} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
            {guardando ? 'Guardando…' : '+ Agregar prospecto'}
          </button>
        </div>
      </form>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por empresa, cliente, correo, teléfono o área…"
            className={`${input} max-w-md`} />
          <span className="text-xs text-slate-400">{filtrados.length} de {lista.length} prospectos</span>
        </div>

        {errorLista && <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{errorLista}</p>}

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#1b2150] text-xs uppercase tracking-wide text-slate-300">
              <tr>
                {['Empresa', 'Cliente', 'Correo', 'Teléfono', 'Área', 'Registrado por', 'Fecha', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td colSpan={8} className="p-4 text-center text-slate-400">Cargando…</td></tr>}
              {!cargando && !filtrados.length && <tr><td colSpan={8} className="p-4 text-center text-slate-400">Sin prospectos.</td></tr>}
              {filtrados.map((p) => (
                <tr key={p.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-2 font-medium text-white">{p.empresa}</td>
                  <td className="px-3 py-2">{p.nombre_cliente}</td>
                  <td className="px-3 py-2"><a className="text-blue-300 hover:underline" href={`mailto:${p.correo}`}>{p.correo}</a></td>
                  <td className="px-3 py-2"><a className="text-blue-300 hover:underline" href={`tel:${p.telefono}`}>{p.telefono}</a></td>
                  <td className="px-3 py-2">{p.area}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{p.usuario_email || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">{p.created_at ? new Date(p.created_at).toLocaleDateString('es-CO') : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => eliminar(p)} className="text-xs text-red-300 hover:text-red-200">Eliminar</button>
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
