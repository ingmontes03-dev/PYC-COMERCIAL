import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { ahoraHHMM, diasEntre, fmtFecha, hoyStr, rangosDe, soloFecha } from '../lib/fechas'

// Asistente de voz: usa la voz sintetizada del navegador (Web Speech API), sin servicios externos ni costo.
// Solo habla mientras PYC Comercial está abierto en una pestaña.
const hayVoz = typeof window !== 'undefined' && 'speechSynthesis' in window

const leer = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v } catch { return d } }
const guardar = (k, v) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }

const saludo = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

// ---------- Elección de la mejor voz latina femenina ----------
// Las voces "neurales / online" (Edge, Chrome en Windows y Mac) suenan mucho más naturales que las clásicas.
const MUJERES = /salom[eé]|dalia|paulina|paloma|elena|valentina|sabina|monica|m[óo]nica|gabriela|lucia|luc[íi]a|marisol|camila|catalina|fernanda|isabella|carolina|lupe|esperanza|ximena|mia|sofia|sof[íi]a|female|mujer|google espa[ñn]ol de estados unidos|google espa[ñn]ol$/i
const HOMBRES = /jorge|diego|juan|carlos|alvaro|[áa]lvaro|pablo|raul|ra[úu]l|gonzalo|tom[áa]s|jes[úu]s|alonso|andr[ée]s|gerardo|enrique|miguel|male\b|hombre/i
const PAIS = { 'es-co': 60, 'es-mx': 48, 'es-us': 46, 'es-419': 46, 'es-ar': 38, 'es-pe': 38, 'es-cl': 38, 'es-ve': 38, 'es-ec': 38, 'es-pa': 38, 'es-cr': 36, 'es-es': 8 }

function puntaje(v) {
  const lang = (v.lang || '').toLowerCase().replace('_', '-')
  let p = PAIS[lang] ?? 25
  if (/salom[eé]/i.test(v.name)) p += 60 // voz neural colombiana
  if (/online|natural|neural/i.test(v.name)) p += 35
  if (MUJERES.test(v.name)) p += 40
  if (HOMBRES.test(v.name)) p -= 120
  if (/google/i.test(v.name) && !v.localService) p += 6
  return p
}

const etiquetaLang = (l = '') => {
  const k = l.toLowerCase().replace('_', '-')
  return { 'es-co': 'Colombia', 'es-mx': 'México', 'es-us': 'Latinoamérica', 'es-419': 'Latinoamérica', 'es-ar': 'Argentina', 'es-es': 'España' }[k] || l
}

// ---------- Texto hablado ----------
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

// 1500000 -> "1,5 millones de pesos"; así la voz no lee cifras interminables
function pesos(n) {
  const v = Math.round(Number(n) || 0)
  if (v >= 1000000) {
    const m = Math.round(v / 100000) / 10
    return m === 1 ? '1 millón de pesos' : `${String(m).replace('.', ',')} millones de pesos`
  }
  if (v >= 1000) return `${Math.round(v / 1000)} mil pesos`
  return `${v} pesos`
}

const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); return fmtFecha(d) }

const horaTexto = (a) => {
  const r = rangosDe(a)
  return r.length ? `, de ${r.map((x) => `${x.ini} a ${x.fin}`).join(' y de ')}` : ''
}
const describe = (a) => `${a.titulo || a.descripcion}${a.cliente ? `, cliente ${a.cliente}` : ''}${horaTexto(a)}.`
const porHora = (a, b) => (rangosDe(a)[0]?.ini || '99').localeCompare(rangosDe(b)[0]?.ini || '99')

export default function VozAlertas({ user, nombre, cotizaciones = [], version = 0 }) {
  const [activa, setActiva] = useState(() => leer('pyc_voz', 'off') === 'on')
  const [voces, setVoces] = useState([])
  const [vozNombre, setVozNombre] = useState(() => leer('pyc_voz_nombre', ''))
  const [velocidad, setVelocidad] = useState(() => Number(leer('pyc_voz_vel', '1')) || 1)
  const [alertas, setAlertas] = useState([])
  const [ultimo, setUltimo] = useState('')
  const dichas = useRef(new Set()) // recordatorios ya dichos hoy

  // Voces del sistema en español, ordenadas: primero las latinas femeninas más naturales
  useEffect(() => {
    if (!hayVoz) return undefined
    const cargar = () => setVoces(
      window.speechSynthesis.getVoices()
        .filter((v) => v.lang?.toLowerCase().startsWith('es'))
        .sort((a, b) => puntaje(b) - puntaje(a))
    )
    cargar()
    window.speechSynthesis.addEventListener('voiceschanged', cargar)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', cargar)
  }, [])

  // Voz en uso: la elegida a mano o, en automático, la mejor puntuada
  const vozActual = voces.find((x) => x.name === vozNombre) || voces[0]
  const vozFemeninaLatina = voces.some((v) => puntaje(v) >= 80)

  const hablar = useCallback((texto) => {
    if (!hayVoz || !texto) return
    window.speechSynthesis.cancel()
    // Frase por frase: algunas voces (Google) se cortan si el texto es largo
    const frases = texto.match(/[^.!?]+[.!?]*/g) || [texto]
    frases.forEach((f) => {
      const t = f.trim()
      if (!t) return
      const u = new SpeechSynthesisUtterance(t)
      const v = voces.find((x) => x.name === vozNombre) || voces[0]
      if (v) { u.voice = v; u.lang = v.lang } else u.lang = 'es-CO'
      u.rate = velocidad
      window.speechSynthesis.speak(u)
    })
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

  // Alertas propias y abiertas
  const propias = useCallback(
    () => alertas.filter((a) => a.estado !== 'Completado' && a.fecha_limite && (a.usuario_id === user.id || a.usuario_email === user.email)),
    [alertas, user.id, user.email]
  )

  // Solo las alertas propias, abiertas, de hoy o vencidas (recordatorios por hora)
  const mias = useCallback(() => {
    const hoy = hoyStr()
    return propias().filter((a) => diasEntre(hoy, soloFecha(a.fecha_limite)) <= 0)
  }, [propias])

  const resumen = useCallback(() => {
    const hoy = hoyStr()
    const sig = manana()
    const lista = mias()
    const deHoy = lista.filter((a) => soloFecha(a.fecha_limite) === hoy).sort(porHora)
    const vencidas = lista.filter((a) => soloFecha(a.fecha_limite) < hoy)
    const deManana = propias().filter((a) => soloFecha(a.fecha_limite) === sig).sort(porHora)

    const partes = [`${saludo()}, ${(nombre || '').split(' ')[0] || 'bienvenido'}.`]

    // --- Hoy ---
    if (!deHoy.length && !vencidas.length) partes.push('No tienes alertas pendientes para hoy.')
    if (deHoy.length) {
      partes.push(`Hoy tienes ${plural(deHoy.length, 'pendiente', 'pendientes')}.`)
      deHoy.slice(0, 6).forEach((a) => partes.push(describe(a)))
    }
    if (vencidas.length) partes.push(`Atención: tienes ${plural(vencidas.length, 'alerta vencida', 'alertas vencidas')}.`)

    // --- Mañana ---
    const entregasManana = cotizaciones.filter((c) => c.estado === 'Aprobado' && soloFecha(c.fecha_entrega) === sig)
    if (!deManana.length && !entregasManana.length) {
      partes.push('Para mañana no tienes alertas programadas.')
    } else {
      if (deManana.length) {
        partes.push(`Para mañana tienes ${plural(deManana.length, 'pendiente', 'pendientes')}.`)
        deManana.slice(0, 6).forEach((a) => partes.push(describe(a)))
      }
      if (entregasManana.length) {
        partes.push(`Mañana hay ${plural(entregasManana.length, 'entrega programada', 'entregas programadas')}${
          entregasManana.length <= 3
            ? `: ${entregasManana.map((c) => `${c.cliente || 'sin cliente'}${c.n_cotizacion ? `, cotización ${c.n_cotizacion}` : ''}`).join('; ')}`
            : ''
        }.`)
      }
    }

    // --- Cotizaciones pendientes y aprobadas ---
    const pend = cotizaciones.filter((c) => c.estado === 'Pendiente')
    const aprob = cotizaciones.filter((c) => c.estado === 'Aprobado')
    const seg = pend.filter((c) => c.fecha_envio && diasEntre(soloFecha(c.fecha_envio), hoy) >= 7).length

    if (pend.length) {
      const valor = pend.reduce((a, c) => a + (Number(c.valor_total) || 0), 0)
      partes.push(`Tienes ${plural(pend.length, 'cotización pendiente', 'cotizaciones pendientes')} por un valor de ${pesos(valor)}.`)
      if (seg) partes.push(`${seg === 1 ? 'Una lleva' : `${seg} llevan`} siete días o más sin respuesta y ${seg === 1 ? 'necesita' : 'necesitan'} seguimiento.`)
    } else {
      partes.push('No tienes cotizaciones pendientes.')
    }

    if (aprob.length) {
      const valor = aprob.reduce((a, c) => a + (Number(c.valor_aprobado) || Number(c.valor_total) || 0), 0)
      partes.push(`Hay ${plural(aprob.length, 'cotización aprobada', 'cotizaciones aprobadas')} por ${pesos(valor)}.`)
      const sinFactura = aprob.filter((c) => !String(c.n_factura || '').trim()).length
      if (sinFactura) partes.push(`${sinFactura === 1 ? 'Una está' : `${sinFactura} están`} aún sin factura.`)
    } else {
      partes.push('Todavía no hay cotizaciones aprobadas.')
    }
    return partes.join(' ')
  }, [mias, propias, cotizaciones, nombre])

  // Resumen automático una vez al día (cuando la voz está activa y ya cargaron los datos)
  useEffect(() => {
    if (!activa || !hayVoz || (!alertas.length && !cotizaciones.length)) return undefined
    const hoy = hoyStr()
    if (leer('pyc_voz_resumen', '') === hoy) return undefined
    // si las voces aún no cargaron, espera un momento para no leerlo con la voz equivocada
    const t = setTimeout(() => {
      if (leer('pyc_voz_resumen', '') === hoy) return
      guardar('pyc_voz_resumen', hoy)
      hablar(resumen())
    }, voces.length ? 0 : 1500)
    return () => clearTimeout(t)
  }, [activa, alertas, cotizaciones, voces, hablar, resumen])

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
          <option value="">Automática · mejor voz latina femenina</option>
          {voces.map((v) => <option key={v.name} value={v.name}>{v.name} ({etiquetaLang(v.lang)})</option>)}
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
      {vozActual && <span className="w-full text-xs text-slate-400">Voz en uso: {vozActual.name} ({etiquetaLang(vozActual.lang)})</span>}
      {!!voces.length && !vozFemeninaLatina && (
        <span className="w-full text-xs text-amber-300">
          Este navegador no tiene una voz latina femenina natural. Para la mejor calidad abre PYC Comercial en Microsoft Edge (voces «Microsoft Salome», Colombia, o «Dalia», México) o en Chrome en Windows/Mac.
        </span>
      )}
      {ultimo && <span className="w-full truncate text-xs text-slate-500" title={ultimo}>Último mensaje: {ultimo}</span>}
    </div>
  )
}
