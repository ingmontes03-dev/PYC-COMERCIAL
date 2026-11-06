import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { ahoraHHMM, diasEntre, fmtFecha, hoyStr, rangosDe, soloFecha } from '../lib/fechas'

// Asistente de voz: usa la voz sintetizada del navegador (Web Speech API), sin servicios externos ni costo.
// Solo habla mientras PYC Comercial está abierto en una pestaña.
const hayVoz = typeof window !== 'undefined' && 'speechSynthesis' in window
const Reconocimiento = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const ZONA = 'America/Bogota'

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
// (se evitan los puntos dentro de las frases —p. m., Cot.— porque el texto se lee frase por frase)
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

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

// "2026-11-07" -> "viernes 7 de noviembre"
const fechaHablada = (s) => {
  const [y, m, d] = soloFecha(s).split('-').map(Number)
  if (!y) return ''
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Fecha y hora de un registro (hora de Colombia): "jueves 5 de noviembre a las 3:20 de la tarde"
function registroHablado(v) {
  const d = v ? new Date(v) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  const dia = d.toLocaleDateString('es-CO', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' })
  const [hh, mm] = d.toLocaleTimeString('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number)
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  const momento = hh < 12 ? 'de la mañana' : hh < 19 ? 'de la tarde' : 'de la noche'
  return `${dia} a las ${h12}:${String(mm).padStart(2, '0')} ${momento}`
}

const horaTexto = (a) => {
  const r = rangosDe(a)
  return r.length ? `, de ${r.map((x) => `${x.ini} a ${x.fin}`).join(' y de ')}` : ''
}
const limpiaDetalle = (s) => String(s || '').replace(/https?:\/\/\S+/g, '').replace(/\S+@\S+/g, '').replace(/\s+/g, ' ').trim()
const sinPunto = (s) => String(s || '').trim().replace(/[.!?]+$/, '')

// Reseña corta de qué trata la alerta: la tarea, el cliente, la cotización y el detalle
// (sin correos ni enlaces). Ej.: "Llamar a Valle de Lili, cotización 1234, confirmar el pedido de uniformes"
function resena(a) {
  const titulo = sinPunto(a.titulo || a.descripcion)
  const partes = [titulo]
  const cliente = sinPunto(a.cliente)
  if (cliente && !sinTildes(titulo).includes(sinTildes(cliente))) partes.push(`cliente ${cliente}`)
  if (a.n_cotizacion) partes.push(`cotización ${a.n_cotizacion}`)
  if (a.descripcion && a.titulo) {
    if (/^fecha especial/i.test(titulo)) {
      const nombres = String(a.descripcion).split('|').map((x) => x.split(' · ')[0].trim()).filter(Boolean)
      if (nombres.length) partes.push(`${nombres.length > 1 ? 'contactos' : 'contacto'}: ${nombres.slice(0, 3).join(', ')}`)
    } else {
      const d = sinPunto(limpiaDetalle(a.descripcion))
      if (d) partes.push(d.length > 160 ? d.slice(0, 160) : d)
    }
  }
  return partes.join(', ')
}

const describe = (a) => `${resena(a)}${horaTexto(a)}.`
const describeConFecha = (a) => `${resena(a)}, el ${fechaHablada(a.fecha_limite)}${horaTexto(a)}.`
const describeVencida = (a, hoy) => {
  const d = diasEntre(soloFecha(a.fecha_limite), hoy)
  return `${resena(a)}, ${d <= 1 ? 'venció ayer' : `venció hace ${d} días`}.`
}
const porHora = (a, b) => (rangosDe(a)[0]?.ini || '99').localeCompare(rangosDe(b)[0]?.ini || '99')
const porFechaHora = (a, b) => soloFecha(a.fecha_limite).localeCompare(soloFecha(b.fecha_limite)) || porHora(a, b)
const esEntrega = (a) => a.tipo === 'entrega' || a.tipo === 'entrega_anticipada'
const ORDINALES = ['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto']

export default function VozAlertas({ user, nombre, cotizaciones = [], version = 0 }) {
  const [activa, setActiva] = useState(() => leer('pyc_voz', 'off') === 'on')
  const [voces, setVoces] = useState([])
  const [vozNombre, setVozNombre] = useState(() => leer('pyc_voz_nombre2', '')) // clave nueva: descarta la voz guardada antes (p. ej. Raul) y vuelve a la automática
  const [velocidad, setVelocidad] = useState(() => Number(leer('pyc_voz_vel', '1')) || 1)
  const [alertas, setAlertas] = useState([])
  const [ultimo, setUltimo] = useState('')
  const [escuchando, setEscuchando] = useState(false)
  const [oido, setOido] = useState('')
  const dichas = useRef(new Set()) // recordatorios ya dichos hoy
  const cola = useRef([]) // referencias a las frases en cola (si no, Chrome las descarta y la voz se corta a la mitad)

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
    const frases = (texto.match(/[^.!?]+[.!?]*/g) || [texto]).map((f) => f.trim()).filter(Boolean)
    const v = voces.find((x) => x.name === vozNombre) || voces[0]
    cola.current = frases.map((t) => {
      const u = new SpeechSynthesisUtterance(t)
      if (v) { u.voice = v; u.lang = v.lang } else u.lang = 'es-CO'
      u.rate = velocidad
      return u
    })
    cola.current.forEach((u) => window.speechSynthesis.speak(u))
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
    () => alertas.filter((a) => a.estado !== 'Completado' && a.fecha_limite && !esEntrega(a) && (a.usuario_id === user.id || a.usuario_email === user.email)),
    [alertas, user.id, user.email]
  )

  // Solo las alertas propias, abiertas, de hoy o vencidas (recordatorios por hora)
  const mias = useCallback(() => {
    const hoy = hoyStr()
    return propias().filter((a) => diasEntre(hoy, soloFecha(a.fecha_limite)) <= 0)
  }, [propias])

  // --- Entregas: fecha de entrega y fecha anticipada de cada cotización aprobada (alertas del sistema) ---
  const textoEntregas = useCallback(() => {
    const hoy = hoyStr()
    const sig = manana()
    const items = []
    cotizaciones.filter((c) => c.estado === 'Aprobado').forEach((c) => {
      const base = `${c.cliente || 'sin cliente'}${c.n_cotizacion ? `, cotización ${c.n_cotizacion}` : ''}`
      const f1 = soloFecha(c.fecha_entrega)
      const f2 = soloFecha(c.fecha_entrega_anticipada)
      if (f1) items.push({ f: f1, t: `Entrega de ${base}` })
      if (f2) items.push({ f: f2, t: `Entrega anticipada de ${base}` })
    })
    items.sort((a, b) => a.f.localeCompare(b.f))
    const deHoy = items.filter((i) => i.f === hoy)
    const deManana = items.filter((i) => i.f === sig)
    const proximas = items.filter((i) => i.f > sig)
    const vencidas = alertas.filter((a) => esEntrega(a) && a.estado !== 'Completado' && soloFecha(a.fecha_limite) && soloFecha(a.fecha_limite) < hoy
      && (a.usuario_id === user.id || a.usuario_email === user.email))
    const partes = []
    if (deHoy.length) partes.push(`Hoy tienes ${plural(deHoy.length, 'entrega', 'entregas')}: ${deHoy.map((i) => i.t).join('; ')}.`)
    else partes.push('Hoy no tienes entregas.')
    if (deManana.length) partes.push(`Mañana tienes ${plural(deManana.length, 'entrega', 'entregas')}: ${deManana.map((i) => i.t).join('; ')}.`)
    if (proximas.length) {
      partes.push(`Próximas entregas.`)
      proximas.slice(0, 5).forEach((i) => partes.push(`${i.t}, el ${fechaHablada(i.f)}.`))
      if (proximas.length > 5) partes.push(`Y ${proximas.length - 5} más adelante.`)
    }
    if (vencidas.length) partes.push(`Atención: tienes ${plural(vencidas.length, 'alerta de entrega vencida', 'alertas de entrega vencidas')} sin completar.`)
    return partes.join(' ')
  }, [cotizaciones, alertas, user.id, user.email])

  // --- Hoy, mañana y los pendientes más próximos ---
  const textoAgenda = useCallback(() => {
    const hoy = hoyStr()
    const sig = manana()
    const lista = mias()
    const deHoy = lista.filter((a) => soloFecha(a.fecha_limite) === hoy).sort(porHora)
    const vencidas = lista.filter((a) => soloFecha(a.fecha_limite) < hoy)
    const abiertas = propias()
    const deManana = abiertas.filter((a) => soloFecha(a.fecha_limite) === sig).sort(porHora)
    const proximos = abiertas.filter((a) => soloFecha(a.fecha_limite) > sig).sort(porFechaHora)
    const partes = []

    if (!deHoy.length && !vencidas.length) partes.push('No tienes alertas pendientes para hoy.')
    if (deHoy.length) {
      partes.push(`Hoy tienes ${plural(deHoy.length, 'pendiente', 'pendientes')}.`)
      deHoy.slice(0, 6).forEach((a) => partes.push(describe(a)))
    }
    if (vencidas.length) {
      partes.push(`Atención: tienes ${plural(vencidas.length, 'alerta vencida', 'alertas vencidas')}.`)
      vencidas.sort(porFechaHora).slice(0, 5).forEach((a) => partes.push(describeVencida(a, hoy)))
    }

    if (!deManana.length) {
      partes.push('Para mañana no tienes alertas programadas.')
    } else {
      partes.push(`Para mañana tienes ${plural(deManana.length, 'pendiente', 'pendientes')}.`)
      deManana.slice(0, 6).forEach((a) => partes.push(describe(a)))
    }

    if (proximos.length) {
      partes.push(`Tus próximos pendientes después de mañana son ${proximos.length === 1 ? 'uno' : Math.min(proximos.length, 5)}.`)
      proximos.slice(0, 5).forEach((a) => partes.push(describeConFecha(a)))
      if (proximos.length > 5) partes.push(`Y ${proximos.length - 5} más adelante.`)
    }
    partes.push(textoEntregas())
    return partes.join(' ')
  }, [mias, propias, textoEntregas])

  // --- Cotizaciones pendientes y aprobadas ---
  const textoCotizaciones = useCallback(() => {
    const hoy = hoyStr()
    const pend = cotizaciones.filter((c) => c.estado === 'Pendiente')
    const aprob = cotizaciones.filter((c) => c.estado === 'Aprobado')
    const seg = pend.filter((c) => c.fecha_envio && diasEntre(soloFecha(c.fecha_envio), hoy) >= 7).length
    const partes = []

    if (pend.length) {
      const valor = pend.reduce((a, c) => a + (Number(c.valor_total) || 0), 0)
      partes.push(`Tienes ${plural(pend.length, 'cotización pendiente', 'cotizaciones pendientes')} por un valor de ${pesos(valor)}.`)
      if (seg) partes.push(`${seg === 1 ? 'Una lleva' : `${seg} llevan`} siete días o más sin respuesta y ${seg === 1 ? 'necesita' : 'necesitan'} seguimiento.`)
      const antiguas = [...pend].sort((a, b) => soloFecha(a.fecha_envio || a.created_at).localeCompare(soloFecha(b.fecha_envio || b.created_at))).slice(0, 3)
      partes.push(`${pend.length > 3 ? 'Las más antiguas son' : 'Son'}: ${antiguas.map((c) => `${c.cliente || 'sin cliente'}${c.n_cotizacion ? `, número ${c.n_cotizacion}` : ''}, por ${pesos(c.valor_total)}`).join('; ')}.`)
    } else {
      partes.push('No tienes cotizaciones pendientes.')
    }

    if (aprob.length) {
      const valor = aprob.reduce((a, c) => a + (Number(c.valor_aprobado) || Number(c.valor_total) || 0), 0)
      partes.push(`Hay ${plural(aprob.length, 'cotización aprobada', 'cotizaciones aprobadas')} por ${pesos(valor)}.`)
      partes.push(`${aprob.length > 3 ? 'Las más recientes son' : 'Son'}: ${aprob.slice(0, 3).map((c) => `${c.cliente || 'sin cliente'}${c.n_cotizacion ? `, número ${c.n_cotizacion}` : ''}, por ${pesos(Number(c.valor_aprobado) || Number(c.valor_total) || 0)}`).join('; ')}.`)
      const sinFactura = aprob.filter((c) => !String(c.n_factura || '').trim()).length
      if (sinFactura) partes.push(`${sinFactura === 1 ? 'Una está' : `${sinFactura} están`} aún sin factura.`)
    } else {
      partes.push('Todavía no hay cotizaciones aprobadas.')
    }
    return partes.join(' ')
  }, [cotizaciones])

  const resumen = useCallback(
    () => [`${saludo()}, ${(nombre || '').split(' ')[0] || 'bienvenido'}.`, textoAgenda(), textoCotizaciones()].join(' '),
    [nombre, textoAgenda, textoCotizaciones]
  )

  // --- Últimos 5 clientes creados (se consulta en el momento, siempre con datos frescos) ---
  const ultimosClientes = useCallback(async () => {
    const { data, error } = await supabase
      .from('clientes_prospeccion')
      .select('empresa, nombre_contacto, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) { hablar('No pude consultar la base de datos de clientes en este momento.'); return }

    // Una empresa puede tener varios contactos: se cuenta una sola vez
    const vistos = new Set()
    const clientes = []
    for (const c of data || []) {
      const k = sinTildes(c.empresa).trim()
      if (!k || vistos.has(k)) continue
      vistos.add(k)
      clientes.push(c)
      if (clientes.length === 5) break
    }
    if (!clientes.length) { hablar('Aún no hay clientes registrados en la base de datos.'); return }

    const partes = [`Los últimos ${clientes.length === 1 ? 'cliente creado es' : `${clientes.length} clientes creados son`}.`]
    clientes.forEach((c, i) => {
      const quien = c.nombre_contacto ? `, atiende ${c.nombre_contacto}` : ''
      const cuando = registroHablado(c.created_at)
      partes.push(`${ORDINALES[i]}, ${c.empresa}${quien}${cuando ? `, registrado el ${cuando}` : ''}.`)
    })
    hablar(partes.join(' '))
  }, [hablar])

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

  // Preguntar con la voz: "últimos clientes", "cotizaciones", "pendientes / mañana", "resumen"
  const responder = useCallback((frase) => {
    const t = sinTildes(frase)
    if (/cliente/.test(t)) ultimosClientes()
    else if (/cotiza|aprobad/.test(t)) hablar(textoCotizaciones())
    else if (/manana|proxim|pendiente|alerta|agenda|hoy/.test(t)) hablar(textoAgenda())
    else hablar(resumen())
  }, [ultimosClientes, hablar, textoCotizaciones, textoAgenda, resumen])

  const preguntar = () => {
    if (!Reconocimiento) return
    window.speechSynthesis.cancel() // para que no se escuche a sí mismo
    const r = new Reconocimiento()
    r.lang = 'es-CO'
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = (e) => { const f = e.results[0][0].transcript; setOido(f); responder(f) }
    r.onerror = (e) => { setOido(e.error === 'not-allowed' ? 'Permite el uso del micrófono en el navegador.' : 'No te escuché, intenta de nuevo.') }
    r.onend = () => setEscuchando(false)
    setOido('')
    setEscuchando(true)
    try { r.start() } catch { setEscuchando(false) }
  }

  if (!hayVoz) {
    return <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-400">Tu navegador no admite voz. Usa Chrome, Edge o Safari actualizados.</p>
  }

  const select = 'rounded-lg border border-white/10 bg-[#0b1026]/70 px-2 py-1.5 text-xs text-white outline-none'
  const boton = 'rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10'
  const tieneHorarios = mias().some((a) => rangosDe(a).length)

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm">
      <span className="font-semibold text-violet-200">🔊 Asistente de voz</span>
      <button onClick={alternar}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${activa ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-violet-600 text-white hover:bg-violet-500'}`}>
        {activa ? 'Activa · silenciar' : 'Activar voz'}
      </button>
      <button onClick={() => hablar(resumen())} className={boton}>Resumen del día</button>
      <button onClick={() => hablar(textoAgenda())} className={boton}>Pendientes</button>
      <button onClick={() => hablar(textoCotizaciones())} className={boton}>Cotizaciones</button>
      <button onClick={ultimosClientes} className={boton}>Últimos 5 clientes</button>
      {Reconocimiento && (
        <button onClick={preguntar} disabled={escuchando}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white ${escuchando ? 'bg-red-600' : 'bg-blue-600 hover:bg-blue-500'}`}>
          {escuchando ? '🎤 Te escucho…' : '🎤 Preguntar'}
        </button>
      )}
      <button onClick={() => window.speechSynthesis.cancel()} className={boton}>Callar</button>
      {!!voces.length && (
        <select value={vozNombre} onChange={(e) => { setVozNombre(e.target.value); guardar('pyc_voz_nombre2', e.target.value) }} className={select} aria-label="Voz">
          <option value="">Automática · mejor voz latina femenina</option>
          {voces.map((v) => <option key={v.name} value={v.name}>{v.name} ({etiquetaLang(v.lang)})</option>)}
        </select>
      )}
      <select value={velocidad} onChange={(e) => { setVelocidad(Number(e.target.value)); guardar('pyc_voz_vel', e.target.value) }} className={select} aria-label="Velocidad">
        <option value={0.85}>Lenta</option><option value={1}>Normal</option><option value={1.2}>Rápida</option>
      </select>
      <span className="w-full text-xs text-slate-400">
        {activa
          ? tieneHorarios ? 'Te avisará al empezar el rango de hora de cada alerta tuya (con la pestaña abierta).' : 'Crea alertas con rango de hora para que te avise a esa hora.'
          : 'Actívala para escuchar el resumen del día y los recordatorios.'}
        {Reconocimiento && ' Con «Preguntar» di, por ejemplo: «últimos clientes», «cotizaciones», «pendientes» o «resumen».'}
      </span>
      {vozActual && <span className="w-full text-xs text-slate-400">Voz en uso: {vozActual.name} ({etiquetaLang(vozActual.lang)})</span>}
      {!!voces.length && !vozFemeninaLatina && (
        <span className="w-full text-xs text-amber-300">
          Este navegador no tiene una voz latina femenina natural. Para la mejor calidad abre PYC Comercial en Microsoft Edge (voces «Microsoft Salome», Colombia, o «Dalia», México) o en Chrome en Windows/Mac.
        </span>
      )}
      {oido && <span className="w-full text-xs text-sky-300">Escuché: «{oido}»</span>}
      {ultimo && <span className="w-full text-xs text-slate-500">Último mensaje: {ultimo}</span>}
    </div>
  )
}
