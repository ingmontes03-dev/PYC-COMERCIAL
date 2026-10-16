import { fmtFecha, soloFecha } from './fechas'

// Sincronización automática con la API de Google Calendar: solo se activa si defines
// VITE_GOOGLE_CLIENT_ID (ID de cliente OAuth de Google Cloud). Sin él, la app genera
// el enlace directo "Agregar a Google Calendar" y el archivo .ics, que no requieren credenciales.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
export const apiDisponible = Boolean(CLIENT_ID)

const diaSiguiente = (f) => {
  const d = new Date(f + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return fmtFecha(d)
}
const sinGuiones = (f) => f.replace(/-/g, '')

const tituloEvento = (a) => `PYC: ${a.titulo || a.descripcion || 'Pendiente'}`

const descripcionEvento = (a) =>
  [
    a.cliente && `Cliente: ${a.cliente}`,
    a.n_cotizacion && `Cotización: ${a.n_cotizacion}`,
    (a.usuario_nombre || a.usuario_email) && `Responsable: ${a.usuario_nombre || a.usuario_email}`,
    'Creado en PYC Comercial',
  ].filter(Boolean).join('\n')

// Enlace directo: abre Google Calendar con el evento listo para guardar
export function enlaceGoogleCalendar(a) {
  const f = soloFecha(a.fecha_limite)
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: tituloEvento(a),
    details: descripcionEvento(a),
    dates: `${sinGuiones(f)}/${sinGuiones(diaSiguiente(f))}`, // evento de día completo
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

// Archivo .ics (Google Calendar, Outlook y Apple Calendar): recordatorio 9:00 a.m. del día anterior y 8:00 a.m. del día
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

export function descargarIcs(a) {
  const f = soloFecha(a.fecha_limite)
  const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PYC Comercial//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${a.id || Date.now()}@pyc-comercial`,
    `DTSTAMP:${sello}`,
    `DTSTART;VALUE=DATE:${sinGuiones(f)}`,
    `DTEND;VALUE=DATE:${sinGuiones(diaSiguiente(f))}`,
    `SUMMARY:${esc(tituloEvento(a))}`,
    `DESCRIPTION:${esc(descripcionEvento(a))}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(tituloEvento(a))}`, 'END:VALARM',
    'BEGIN:VALARM', 'TRIGGER:PT8H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(tituloEvento(a))}`, 'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
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

// Crea el evento en el calendario principal del usuario y devuelve su id
export async function crearEventoGoogle(a) {
  const token = await obtenerToken()
  const f = soloFecha(a.fecha_limite)
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: tituloEvento(a),
      description: descripcionEvento(a),
      start: { date: f },
      end: { date: diaSiguiente(f) },
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 900 }, { method: 'email', minutes: 900 }], // 9:00 a.m. del día anterior
      },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `Google Calendar respondió ${res.status}`)
  return data.id
}
