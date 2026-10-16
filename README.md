# PYC Comercial

Plataforma comercial (cotizaciones, agenda, base de datos de clientes, auditoría y roles) en React + Vite + Tailwind + Supabase, lista para Vercel.

## Estructura

```
index.html · vite.config.js · vercel.json · package.json · .env.example · supabase_schema.sql
src/
  main.jsx · App.jsx · supabaseClient.js · index.css
  lib/        fechas.js · permisos.js · googleCalendar.js
  components/ Login · Dashboard · CotizacionForm · PanelAlertas · Agenda · Cotizador
              BaseDatos · Historial · Usuarios
```

## Puesta en marcha

1. **Supabase → SQL Editor**: pega y ejecuta `supabase_schema.sql` completo (es idempotente, se puede repetir).
   - En la sección 10 están los correos que quedan como Super Admin (`ing.montes@gmail.com`, `ing.montes03@gmail.com`). Cámbialos si hace falta.
2. **Vercel → Settings → Environment Variables** (con prefijo `VITE_`, obligatorio para que el navegador las lea):
   - `VITE_SUPABASE_URL` = solo `https://xxxx.supabase.co` (sin `/rest/v1`, sin la clave).
   - `VITE_SUPABASE_ANON_KEY` = la clave `sb_publishable_...` (o anon).
   - `VITE_GOOGLE_CLIENT_ID` = opcional, para sincronizar con Google Calendar vía API.
3. **Redeploy** en Vercel (las variables solo aplican a builds nuevos).

Local: `cp .env.example .env`, `npm install`, `npm run dev`.

## Roles y permisos

| Rol | Alcance |
|---|---|
| `super_admin` | Todo: ve todas las cotizaciones, audita, administra usuarios y permisos. |
| `vendedor` | Ve solo sus cotizaciones; el resto según permisos. |
| `sin_acceso` | Cuenta nueva sin acceso hasta que el Super Admin la habilite. |

Permisos del vendedor: `ver_todas_cotizaciones`, `cotizaciones_crear`, `cotizaciones_editar`, `cotizaciones_eliminar`, `agenda`, `cotizador`, `historial`. Se gestionan en la pestaña **Usuarios y Permisos**. La seguridad real está en las políticas RLS de Supabase; la interfaz solo refleja lo que la base de datos permite.

## Auditoría

Triggers en la base de datos escriben en `auditoria_logs` (usuario, acción CREAR/EDITAR/ELIMINAR, módulo, registro, detalle, antes/después y fecha/hora) cada cambio en Cotizaciones, Base de Datos, Alertas y Usuarios. Se consulta en la pestaña **Historial de Auditoría**.

## Google Calendar

- Enlace "Google Calendar" y descarga `.ics` funcionan sin configuración.
- Sincronización automática por API: crea un OAuth Client ID (Web) en Google Cloud, habilita Google Calendar API, agrega el dominio de Vercel como origen autorizado y define `VITE_GOOGLE_CLIENT_ID`.

## Vercel

`vercel.json` define framework Vite, salida `dist` y rewrite SPA. Node 22.x.
