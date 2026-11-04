import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { ahoraHHMM, diasEntre, hoyStr, rangosDe, soloFecha } from '../lib/fechas'

// Asistente de voz: usa la voz sintetizada del navegador (Web Speech API), sin servicios externos ni costo.
// Solo habla mientras PYC Comercial está abierto en una pestaña.
const hayVoz = typeof window !== 'undefined' && 'speechSynthesis' in window

const leer = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v } catch { return d } }
const guardar = (k, v) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }

const saludo = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

export default function VozAlertas({ user, nombre, cotizaciones = [], version = 0 }) {
  const [activa, setActiva] = useState(() => leer('pyc_voz', 'off') === 'on')
  const [voces, setVoces] = useState([])
  const [vozNombre, setVozNombre] = useState(() => leer('pyc_voz_nombre', ''))
  const [velocidad, setVelocidad] = useState(() => Number(leer('pyc_voz_vel', '1')) || 1)
  const [alertas, setAlertas] = useState([])
  const [ultimo, setUltimo] = useState('')
  const dichas = useRef(new Set()) // recordatorios ya dichos hoy

  // Voces del sistema en español
  useEffect(() => {
    if (!hayVoz) return undefined
    const cargar = () => setVoces(window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('es')))
    cargar()
    window.speechSynthesis.addEventListener('voiceschanged', cargar)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', cargar)
  }, [])

  const hablar = useCallback((texto) => {
    if (!hayVoz || !texto) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(texto)
    const v = voces.find((x) => x.name === vozNombre) || voces[0]
    if (v) { u.voice = v; u.lang = v.lang } else u.lang = 'es-CO'
    u.rate = velocidad
    window.speechSynthesis.speak(u)
    setUltimo(texto)
  }, [voces, vozNombre, velocidad])

  // Alertas (se refrescan al crear/editar y cada 5 minutos)
  useEffect(() => {
    let activo = true
    const traer = () => supabase.from('alertas').select('*').limit(1000).then(({ data }) => { if (activo && data) setAlertas(data) })
    traer()
    const t = setInterval(traer, 300000)
    return () => { activo = false; clearInterval(t) }
  }, [version])

  // Solo las alertas propias, abiertas, de hoy o vencidas
  const mias = useCallback(() => {
    const hoy = hoyStr()
    return alertas.filter((a) =>
      a.estado !== 'Completado' && a.fecha_limite && (a.usuario_id === user.id || a.usuario_email === user.email) &&
      diasEntre(hoy, soloFecha(a.fecha_limite)) <= 0
    )
  }, [alertas, user.id, user.email])

  const resumen = useCallback(() => {
    const hoy = hoyStr()
    const lista = mias()
    const deHoy = lista.filter((a) => soloFecha(a.fecha_limite) === hoy)
      .sort((a, b) => (rangosDe(a)[0]?.ini || '99').localeCompare(rangosDe(b)[0]?.ini || '99'))
    const vencidas = lista.filter((a) => soloFecha(a.fecha_limite) < hoy)
    const seg = cotizaciones.filter((c) => c.estado === 'Pendiente' && c.fecha_envio && diasEntre(soloFecha(c.fecha_envio), hoy) >= 7).length

    const partes = [`${saludo()}, ${(nombre || '').split(' ')[0] || 'bienvenido'}.`]
    if (!deHoy.length && !vencidas.length) partes.push('No tienes alertas pendientes para hoy.')
    if (deHoy.length) {
      partes.push(`Hoy tienes ${deHoy.length} ${deHoy.length === 1 ? 'pendiente' : 'pendientes'}.`)
      deHoy.slice(0, 6).forEach((a) => {
        const r = rangosDe(a)
        const hora = r.length ? `, de ${r.map((x) => `${x.ini} a ${x.fin}`).join(' y de ')}` : ''
        partes.push(`${a.titulo || a.descripcion}${a.cliente ? `, cliente ${a.cliente}` : ''}${hora}.`)
      })
    }
    if (vencidas.length) partes.push(`Atención: tienes ${vencidas.length} ${vencidas.length === 1 ? 'alerta vencida' : 'alertas vencidas'}.`)
    if (seg) partes.push(`Hay ${seg} ${seg === 1 ? 'cotización pendiente' : 'cotizaciones pendientes'} por hacer seguimiento.`)
    return partes.join(' ')
  }, [mias, cotizaciones, nombre])

  // Resumen automático una vez al día (cuando la voz está activa y ya cargaron los datos)
  useEffect(() => {
    if (!activa || !hayVoz || !alertas.length) return
    const hoy = hoyStr()
    if (leer('pyc_voz_resumen', '') === hoy) return
    guardar('pyc_voz_resumen', hoy)
    hablar(resumen())
  }, [activa, alertas, hablar, resumen])

  // Recordatorio hablado cuando empieza cada rango de hora de una alerta propia
  useEffect(() => {
    if (!activa || !hayVoz) return undefined
    const revisar = () => {
      const ahora = ahoraHHMM()
      const hoy = hoyStr()
      mias().filter((a) => soloFecha(a.fecha_limite) === hoy).forEach((a) => {
        rangosDe(a).forEach((r, i) => {
          const clave = `${hoy}|${a.id}|${i}`
          if (ahora >= r.ini && ahora < r.fin && !dichas.current.has(clave) && leer(`pyc_dicha_${clave}`, '') !== '1') {
            dichas.current.add(clave)
            guardar(`pyc_dicha_${clave}`, '1')
            hablar(`Recordatorio: ${a.titulo || a.descripcion}${a.cliente ? `, cliente ${a.cliente}` : ''}. Tu horario es de ${r.ini} a ${r.fin}.`)
          }
        })
      })
    }
    revisar()
    const t = setInterval(revisar, 20000)
    return () => clearInterval(t)
  }, [activa, mias, hablar])

  const alternar = () => {
    const nuevo = !activa
    setActiva(nuevo)
    guardar('pyc_voz', nuevo ? 'on' : 'off')
    if (nuevo) hablar('Asistente de voz activado.')
    else window.speechSynthesis?.cancel()
  }

  if (!hayVoz) {
    return <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-400">Tu navegador no admite voz. Usa Chrome, Edge o Safari actualizados.</p>
  }

  const select = 'rounded-lg border border-white/10 bg-[#0b1026]/70 px-2 py-1.5 text-xs text-white outline-none'
  const tieneHorarios = mias().some((a) => rangosDe(a).length)

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm">
      <span className="font-semibold text-violet-200">🔊 Asistente de voz</span>
      <button onClick={alternar}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${activa ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-violet-600 text-white hover:bg-violet-500'}`}>
        {activa ? 'Activa · silenciar' : 'Activar voz'}
      </button>
      <button onClick={() => hablar(resumen())} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10">
        Resumen del día
      </button>
      {!!voces.length && (
        <select value={vozNombre} onChange={(e) => { setVozNombre(e.target.value); guardar('pyc_voz_nombre', e.target.value) }} className={select} aria-label="Voz">
          <option value="">Voz automática</option>
          {voces.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
        </select>
      )}
      <select value={velocidad} onChange={(e) => { setVelocidad(Number(e.target.value)); guardar('pyc_voz_vel', e.target.value) }} className={select} aria-label="Velocidad">
        <option value={0.85}>Lenta</option><option value={1}>Normal</option><option value={1.2}>Rápida</option>
      </select>
      <span className="text-xs text-slate-400">
        {activa
          ? tieneHorarios ? 'Te avisará al empezar el rango de hora de cada alerta tuya (con la pestaña abierta).' : 'Crea alertas con rango de hora para que te avise a esa hora.'
          : 'Actívala para escuchar el resumen del día y los recordatorios.'}
      </span>
      {ultimo && <span className="w-full truncate text-xs text-slate-500" title={ultimo}>Último mensaje: {ultimo}</span>}
    </div>
  )
}
