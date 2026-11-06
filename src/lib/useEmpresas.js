import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Nombres de empresa tomados de la Base de Datos (tabla clientes_prospeccion), sin repetidos y ordenados.
// Se usan en todos los campos que piden o buscan una empresa (cotización, cotizador, agenda).
// Se recargan al abrir el componente y cada 2 minutos, así una empresa recién creada aparece enseguida.
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ')

export default function useEmpresas() {
  const [empresas, setEmpresas] = useState([])

  useEffect(() => {
    let activo = true
    const traer = async () => {
      const { data } = await supabase.from('clientes_prospeccion').select('empresa').limit(5000)
      if (!activo || !data) return
      const vistos = new Map() // sin distinguir mayúsculas/minúsculas
      data.forEach((r) => { const n = norm(r.empresa); if (n && !vistos.has(n.toLowerCase())) vistos.set(n.toLowerCase(), n) })
      setEmpresas([...vistos.values()].sort((a, b) => a.localeCompare(b, 'es')))
    }
    traer()
    const t = setInterval(traer, 120000)
    return () => { activo = false; clearInterval(t) }
  }, [])

  return empresas
}
