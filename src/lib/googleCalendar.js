import { supabase } from '../supabaseClient'
import { fmtFecha, rangosDe, soloFecha } from './fechas'

// Sincronización automática con la API de Google Calendar: solo se activa si defines
// VITE_GOOGLE_CLIENT_ID (ID de cliente OAuth de Google Cloud). Sin él, la app genera
// el enlace directo "Agregar a Google Calendar" y el archivo .ics, que no requieren credenciales.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
export const apiDisponible = Boolean(CLIENT_ID)

const ZONA = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota'

const diaSiguiente = (f) => {
  const d = new Date(f + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return fmtFecha(d)
}
const sinGuiones = (f) => f.replace(/-/g, '')
const compacta = (f, h) => `${sinGuiones(f)}T${h.replace(':', '')}00`

const tituloEvento = (a) => `PYC: ${a.titulo || a.descripcion || 'Pendiente'}`

const TIPO_TEXTO = { entrega: 'Entrega de pedido', entrega_anticipada: 'Entrega anticipada', fecha_especial: 'Fecha especial de compra' }

const descripcionEvento = (a) =>
  [
    TIPO_TEXTO[a.tipo] && `Tipo: ${TIPO_TEXTO[a.tipo]}`,
    a.cliente && `Cliente: ${a.cliente}`,
    a.n_cotizacion && `Cotización: ${a.n_cotizacion}`,
    (a.usuario_nombre || a.usuario_email) && `Responsable: ${a.usuario_nombre || a.usuario_email}`,
    'Creado en PYC Comercial',
  ].filter(Boolean).join('\n')

// Enlace directo: abre Google Calendar con el evento listo para guardar.
// Con horario partido hay un enlace por rango (idx 0 = primero, 1 = segundo).
export function enlaceGoogleCalendar(a, idx = 0) {
  const f = soloFecha(a.fecha_limite)
  const r = rangosDe(a)[idx]
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: tituloEvento(a),
    details: descripcionEvento(a),
    dates: r ? `${compacta(f, r.ini)}/${compacta(f, r.fin)}` : `${sinGuiones(f)}/${sinGuiones(diaSiguiente(f))}`,
  })
  if (r) p.set('ctz', ZONA)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

// Archivo .ics (Google Calendar, Outlook y Apple Calendar)
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

export function descargarIcs(a) {
  const f = soloFecha(a.fecha_limite)
  const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const rangos = rangosDe(a)

  const evento = (n, inicio, fin, alarmas) => [
    'BEGIN:VEVENT',
    `UID:${a.id || Date.now()}-${n}@pyc-comercial`,
    `DTSTAMP:${sello}`,
    inicio,
    fin,
    `SUMMARY:${esc(tituloEvento(a))}`,
    `DESCRIPTION:${esc(descripcionEvento(a))}`,
    ...alarmas.flatMap((t) => ['BEGIN:VALARM', `TRIGGER:${t}`, 'ACTION:DISPLAY', `DESCRIPTION:${esc(tituloEvento(a))}`, 'END:VALARM']),
    'END:VEVENT',
  ]

  const eventos = rangos.length
    ? rangos.flatMap((r, i) => evento(i, `DTSTART:${compacta(f, r.ini)}`, `DTEND:${compacta(f, r.fin)}`, ['-PT10M', 'PT0S']))
    : evento(0, `DTSTART;VALUE=DATE:${sinGuiones(f)}`, `DTEND;VALUE=DATE:${sinGuiones(diaSiguiente(f))}`, ['-PT15H', 'PT8H'])

  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PYC Comercial//ES', 'CALSCALE:GREGORIAN', ...eventos, 'END:VCALENDAR']
  const blob = new Blob([lineas.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(blob)
  enlace.download = `alerta-${f}.ics`
  enlace.click()
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000)
}

// --- API de Google Calendar (opcional) ---------------------------------------------
let accessToken = null
let expira = 0

function cargarGoogle() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('No se pudo cargar el inicio de sesión de Google'))
    document.head.appendChild(s)
  })
}

async function obtenerToken() {
  if (accessToken && Date.now() < expira) return accessToken
  await cargarGoogle()
  return new Promise((resolve, reject) => {
    const cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      callback: (r) => {
        if (r.error) return reject(new Error(r.error_description || r.error))
        accessToken = r.access_token
        expira = Date.now() + (Number(r.expires_in) - 60) * 1000
        resolve(accessToken)
      },
      error_callback: (e) => reject(new Error(e?.message || 'Se canceló la autorización de Google')),
    })
    cliente.requestAccessToken({ prompt: accessToken ? '' : 'consent' })
  })
}

// ¿Hay una autorización de Google vigente en esta sesión? (el permiso dura ~1 hora y se pide con un clic)
export const tokenVigente = () => Boolean(accessToken) && Date.now() < expira

// Pide la autorización de Google. Debe llamarse desde un clic del usuario (si no, el navegador bloquea la ventana).
export async function conectarGoogle() {
  if (!apiDisponible) throw new Error('Falta configurar VITE_GOOGLE_CLIENT_ID')
  return obtenerToken()
}

async function insertar(token, cuerpo) {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `Google Calendar respondió ${res.status}`)
  return data.id
}

// Crea el/los evento(s) en el calendario principal del usuario (uno por rango de hora) y devuelve los ids
export async function crearEventoGoogle(a) {
  const token = await obtenerToken()
  const f = soloFecha(a.fecha_limite)
  const base = { summary: tituloEvento(a), description: descripcionEvento(a) }
  const rangos = rangosDe(a)

  if (!rangos.length) {
    return insertar(token, {
      ...base,
      start: { date: f },
      end: { date: diaSiguiente(f) },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 900 }] }, // 9:00 a.m. del día anterior
    })
  }
  const ids = []
  for (const r of rangos) {
    ids.push(await insertar(token, {
      ...base,
      start: { dateTime: `${f}T${r.ini}:00`, timeZone: ZONA },
      end: { dateTime: `${f}T${r.fin}:00`, timeZone: ZONA },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }, { method: 'popup', minutes: 0 }] },
    }))
  }
  return ids.join(',')
}

// Borra del calendario los eventos de una alerta (ids separados por coma). Si ya no existen, no pasa nada.
export async function borrarEventosGoogle(ids) {
  if (!ids) return
  const token = await obtenerToken()
  for (const id of String(ids).split(',').map((x) => x.trim()).filter(Boolean)) {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google Calendar respondió ${res.status}`)
  }
}

// Pone una alerta en el calendario y guarda el id del evento. Si la alerta cambió desde la última vez
// (gcal_stale), primero borra el evento viejo. Evita sincronizar la misma alerta dos veces a la vez.
const enCurso = new Set()
export async function sincronizarAlerta(a) {
  if (enCurso.has(a.id)) return null
  enCurso.add(a.id)
  try {
    if (a.gcal_event_id && a.gcal_stale) await borrarEventosGoogle(a.gcal_event_id)
    const id = await crearEventoGoogle(a)
    const { error } = await supabase.from('alertas').update({ gcal_event_id: id, gcal_stale: false }).eq('id', a.id)
    if (error) throw new Error(error.message)
    return id
  } finally {
    enCurso.delete(a.id)
  }
}
