import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { PERMISOS, REQUIEREN_VER } from '../lib/permisos'

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
    const { error } = await supabase.from('perfiles').update(cambios).eq('id', p.id)
    setGuardando(null)
    if (error) { setError(`No se pudo guardar el cambio: ${error.message}`); cargar() }
    else setError('')
  }

  const cambiarPermiso = (p, clave, valor) => {
    const permisos = { ...(p.permisos || {}), [clave]: valor }
    if (valor && REQUIEREN_VER.includes(clave)) permisos.cotizaciones_ver = true
    if (!valor && clave === 'cotizaciones_ver') REQUIEREN_VER.forEach((k) => { permisos[k] = false })
    actualizar(p, { permisos })
  }

  const cambiarRol = (p, rol) => {
    if (rol === 'super_admin' && !window.confirm(`¿Dar acceso de SUPER ADMIN a ${p.email}? Podrá administrar todas las cuentas.`)) return
    actualizar(p, { rol })
  }

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-slate-200">
        <p className="font-semibold text-white">¿Cómo crear una cuenta nueva?</p>
        <p className="mt-1 text-slate-300">
          En Supabase entra a <b>Authentication &gt; Users &gt; Add user &gt; Create new user</b>, escribe el correo y la contraseña
          y marca <b>Auto Confirm User</b>. La cuenta aparecerá aquí sin permisos: actívalos con las casillas de abajo.
        </p>
      </div>

      {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      {cargando && <p className="text-sm text-slate-400">Cargando usuarios…</p>}

      <div className="space-y-3">
        {lista.map((p) => {
          const esYo = p.id === user.id
          const esSuper = p.rol === 'super_admin'
          return (
            <div key={p.id} className={`rounded-xl border p-4 ${p.activo ? 'border-white/10 bg-white/5' : 'border-red-500/30 bg-red-500/5 opacity-80'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[200px] flex-1">
                  <p className="font-medium text-white">
                    {p.email || '(sin correo)'}
                    {esYo && <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">Tú</span>}
                  </p>
                  <p className="text-xs text-slate-400">
                    {p.activo ? 'Cuenta activa' : 'Cuenta desactivada'}
                    {guardando === p.id ? ' · guardando…' : ''}
                  </p>
                </div>

                <select value={p.rol} disabled={esYo} onChange={(e) => cambiarRol(p, e.target.value)}
                  className="rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white disabled:opacity-50">
                  <option value="usuario">Usuario</option>
                  <option value="super_admin">Super Admin</option>
                </select>

                <label className={`flex items-center gap-2 text-sm ${esYo ? 'opacity-50' : 'cursor-pointer'}`}>
                  <input type="checkbox" checked={p.activo} disabled={esYo} onChange={(e) => actualizar(p, { activo: e.target.checked })} />
                  Activa
                </label>
              </div>

              {esSuper ? (
                <p className="mt-3 text-xs text-slate-400">El Super Admin tiene todos los permisos y administra usuarios.</p>
              ) : (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
