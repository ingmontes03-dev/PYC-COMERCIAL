import { useState } from 'react'
import { supabase } from '../supabaseClient'

const traducir = (msg = '') => {
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos'
  if (/email not confirmed/i.test(msg)) return 'Tu correo aún no está confirmado'
  return msg
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(traducir(error.message))
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0b1026] via-[#141a3d] to-[#2a1458] p-4">
      <form onSubmit={handleLogin} className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600" />
          <h1 className="text-xl font-semibold text-white">PYC Comercial</h1>
        </div>
        <label className="mb-1 block text-sm text-slate-300">Correo</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-white outline-none focus:border-blue-500" />
        <label className="mb-1 block text-sm text-slate-300">Contraseña</label>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-white outline-none focus:border-blue-500" />
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        <button disabled={loading}
          className="w-full rounded-lg bg-blue-600 py-2 font-medium text-white transition hover:bg-blue-500 disabled:opacity-50">
          {loading ? 'Ingresando...' : 'Iniciar sesión'}
        </button>
      </form>
    </div>
  )
}
