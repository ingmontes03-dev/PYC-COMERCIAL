import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { PERMISOS, PRESETS, ROLES } from '../lib/permisos'

// ¿Los permisos de la cuenta son exactamente los del rol?
const esPreset = (p) => {
  const base = PRESETS[p.rol] || {}
  return PERMISOS.every(({ k }) => (p.permisos?.[k] === true) === (base[k] === true))
}

export default function Usuarios({ user }) {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error } = await supabase.from('perfiles').select('*').order('created_at', { ascending: true })
    if (error) { setError(`No se pudieron cargar los usuarios: ${error.message}`); setLista([]) }
    else { setError(''); setLista(data || []) }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const actualizar = async (p, cambios) => {
    setGuardando(p.id)
    setLista((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...cambios } : x))) // actualización inmediata
    const { data, error } = await supabase.from('perfiles').update(cambios).eq('id', p.id).select('id')
    setGuardando(null)
    if (error) { setError(`No se pudo guardar el cambio: ${error.message}`); cargar() }
    else if (!data?.length) { setError('No se pudo guardar: solo el super admin puede modificar cuentas.'); cargar() }
    else setError('')
  }

  const cambiarPermiso = (p, clave, valor) => actualizar(p, { permisos: { ...(p.permisos || {}), [clave]: valor } })

  const cambiarRol = (p, rol) => {
    if (rol === 'super_admin' && !window.confirm(`¿Dar acceso de SUPER ADMIN a ${p.email}? Verá todo y podrá administrar todas las cuentas.`)) return
    // Al elegir un rol se aplican sus permisos base; luego se pueden afinar con las casillas
    actualizar(p, { rol, permisos: PRESETS[rol] ? { ...PRESETS[rol] } : p.permisos })
  }

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-slate-300">
        <p className="font-semibold text-white">Roles</p>
        <ul className="mt-1 space-y-1">
          {Object.entries(ROLES).map(([k, r]) => (
            <li key={k}><b className="text-slate-100">{r.t}:</b> {r.desc}</li>
          ))}
        </ul>
        <p className="mt-3 font-semibold text-white">¿Cómo crear una cuenta nueva?</p>
        <p className="mt-1">
          En Supabase entra a <b>Authentication &gt; Users &gt; Add user &gt; Create new user</b>, escribe el correo y la contraseña
          y marca <b>Auto Confirm User</b>. La cuenta aparece aquí como <b>Sin acceso</b>: asígnale el rol Vendedor y sus permisos.
        </p>
      </div>

      {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      {cargando && <p className="text-sm text-slate-400">Cargando usuarios…</p>}

      <div className="space-y-3">
        {lista.map((p) => {
          const esYo = p.id === user.id
          return (
            <div key={p.id} className={`rounded-xl border p-4 ${p.activo ? 'border-white/10 bg-white/5' : 'border-red-500/30 bg-red-500/5 opacity-80'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[220px] flex-1">
                  <p className="font-medium text-white">
                    {p.email || '(sin correo)'}
                    {esYo && <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">Tú</span>}
                    {p.rol === 'vendedor' && !esPreset(p) && <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">Personalizado</span>}
                  </p>
                  <p className="text-xs text-slate-400">
                    {p.activo ? 'Cuenta activa' : 'Cuenta desactivada'}
                    {guardando === p.id ? ' · guardando…' : ''}
                  </p>
                </div>

                <input key={`${p.id}-${p.nombre || ''}`} defaultValue={p.nombre || ''} placeholder="Nombre a mostrar"
                  onBlur={(e) => { if (e.target.value.trim() !== (p.nombre || '')) actualizar(p, { nombre: e.target.value.trim() || null }) }}
                  className="w-48 rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />

                <select value={p.rol} disabled={esYo} onChange={(e) => cambiarRol(p, e.target.value)}
                  className="rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white disabled:opacity-50">
                  {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.t}</option>)}
                </select>

                <label className={`flex items-center gap-2 text-sm ${esYo ? 'opacity-50' : 'cursor-pointer'}`}>
                  <input type="checkbox" checked={p.activo} disabled={esYo} onChange={(e) => actualizar(p, { activo: e.target.checked })} />
                  Activa
                </label>
              </div>

              {p.rol === 'super_admin' && (
                <p className="mt-3 text-xs text-slate-400">El Super Admin tiene todos los permisos, ve todas las cotizaciones y administra usuarios.</p>
              )}
              {p.rol === 'sin_acceso' && (
                <p className="mt-3 text-xs text-slate-400">Esta cuenta no ve nada hasta que le asignes el rol Vendedor.</p>
              )}
              {p.rol === 'vendedor' && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {PERMISOS.map((perm) => (
                    <label key={perm.k} className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#0b1026]/50 px-3 py-2 text-sm text-slate-200">
                      <input type="checkbox" checked={p.permisos?.[perm.k] === true} onChange={(e) => cambiarPermiso(p, perm.k, e.target.checked)} />
                      {perm.t}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
