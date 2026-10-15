# CRM Comercial (React + Tailwind + Supabase)

## 1. Crear el proyecto
```bash
npm create vite@latest crm-comercial -- --template react
cd crm-comercial
npm install @supabase/supabase-js
npm install -D tailwindcss @tailwindcss/vite
```

En `vite.config.js`:
```js
import tailwindcss from '@tailwindcss/vite'
export default { plugins: [react(), tailwindcss()] }
```
En `src/index.css`: `@import "tailwindcss";`

## 2. Variables de entorno (`.env`)
```
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
```

## 3. Base de datos
Ejecuta `supabase_schema.sql` en Supabase > SQL Editor.
Crea usuarios en Authentication > Users (desactiva el registro público si quieres acceso cerrado).

## 4. Archivos
Copia `src/` sobre el proyecto y ejecuta `npm run dev`.
