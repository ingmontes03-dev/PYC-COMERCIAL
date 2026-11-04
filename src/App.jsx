import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

function Aviso({ titulo, texto }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0b1026] via-[#141a3d] to-[#2a1458] p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
        <h1 className="text-lg font-semibold text-white">{titulo}</h1>
        <p className="mt-2 text-sm text-slate-300">{texto}</p>
        <button onClick={() => supabase.auth.signOut()}
          className="mt-5 rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">
          Cerrar Sesión
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [perfil, setPerfil] = useState(null)
  const [errorPerfil, setErrorPerfil] = useState('')
  const [cargandoPerfil, setCargandoPerfil] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCargando(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  const uid = session?.user?.id

  // Carga el perfil (rol y permisos) de la cuenta que inició sesión
  useEffect(() => {
    if (!uid) { setPerfil(null); setErrorPerfil(''); return }
    let activo = true
    setCargandoPerfil(true)
    supabase.from('perfiles').select('*').eq('id', uid).maybeSingle().then(({ data, error }) => {
      if (!activo) return
      if (error) setErrorPerfil(error.message)
      else if (!data) setErrorPerfil('Tu cuenta no tiene perfil. Ejecuta supabase_schema.sql en Supabase y vuelve a entrar.')
      else { setPerfil(data); setErrorPerfil('') }
      setCargandoPerfil(false)
    })
    return () => { activo = false }
  }, [uid])

  if (cargando) return <div className="min-h-screen bg-[#0b1026]" />
  if (!session) return <Login />
  if (cargandoPerfil) return <div className="min-h-screen bg-[#0b1026]" />
  if (errorPerfil) return <Aviso titulo="No se pudo cargar tu perfil" texto={errorPerfil} />
  if (!perfil) return <div className="min-h-screen bg-[#0b1026]" />
  if (perfil.activo === false) {
    return <Aviso titulo="Cuenta desactivada" texto="Tu cuenta fue desactivada. Contacta al super administrador de PYC Comercial." />
  }
  return <Dashboard user={session.user} perfil={perfil} />
}
