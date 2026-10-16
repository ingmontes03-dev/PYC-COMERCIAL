# PYC Comercial (React + Tailwind + Supabase)

## Estructura
```
package.json · index.html · vite.config.js · vercel.json · supabase_schema.sql
src/
  main.jsx · index.css · App.jsx · supabaseClient.js
  lib/        auditoria.js · permisos.js
  components/ Login · Dashboard · CotizacionForm · Historial · Agenda · Cotizador · Llamadas · Usuarios
```

## Variables de entorno (Vercel y `.env`)
```
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co      (solo el dominio, sin rutas ni "/" final)
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

## Base de datos y super admin
1. Abre `supabase_schema.sql`, edita el correo de la sección **7) SUPER ADMIN** y ejecútalo en Supabase > SQL Editor.
2. Verifica que la última consulta muestre tu correo con rol `super_admin`.
3. Para crear cuentas: Supabase > Authentication > Users > Add user (marca *Auto Confirm User*).
4. Entra a la app con el super admin, abre la pestaña **Usuarios y Permisos** y activa los módulos de cada cuenta.

## Permisos
Ver, crear, editar y eliminar cotizaciones · Agenda y alertas · Historial · Cotizador · Llamadas.
Se aplican en la interfaz y también en la base de datos (RLS), así que no se pueden saltar desde el navegador.
