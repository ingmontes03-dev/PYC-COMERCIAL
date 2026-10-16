-- ============================================================
-- PYC Comercial - esquema completo e IDEMPOTENTE
-- Ejecutar en Supabase > SQL Editor. Es seguro correrlo varias veces:
-- crea lo que falta, migra lo antiguo y NO borra datos.
--
-- IMPORTANTE: en la sección 9 hay una línea con el correo del
-- SUPER ADMIN. Edítala ANTES de ejecutar el script.
-- ============================================================
 
-- 1) COTIZACIONES ------------------------------------------------
create table if not exists cotizaciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);
 
alter table cotizaciones
  add column if not exists fecha_envio date,
  add column if not exists semana int,
  add column if not exists n_cotizacion text,
  add column if not exists contacto text,
  add column if not exists cliente text,
  add column if not exists referencia text,
  add column if not exists cantidad numeric default 0,
  add column if not exists valor_unitario numeric default 0,
  add column if not exists estado text default 'Pendiente',
  add column if not exists motivo_negacion text,
  add column if not exists fecha_op date,
  add column if not exists num_op text,
  add column if not exists valor_aprobado numeric,
  add column if not exists renta numeric,
  add column if not exists n_factura text,
  add column if not exists fecha_facturacion date,
  add column if not exists items jsonb default '[]'::jsonb;
 
-- 1.1) MES: la columna pasa a ser un NÚMERO (1-12).
-- La app muestra el nombre (Enero...Diciembre) y envía el número, así no hay
-- errores de conversión. Convierte lo que ya exista ('Octubre', '10', fechas...).
do $$
declare t text;
begin
  select data_type into t
    from information_schema.columns
   where table_schema = 'public' and table_name = 'cotizaciones' and column_name = 'mes';
 
  if t is null then
    alter table cotizaciones add column mes smallint;
  elsif t in ('text', 'character varying', 'character') then
    alter table cotizaciones alter column mes type smallint using (
      case
        when mes is null or btrim(mes) = '' then null
        when btrim(mes) ~ '^\d{1,2}$' and btrim(mes)::int between 1 and 12 then btrim(mes)::smallint
        when btrim(mes) ~ '^\d{4}-\d{2}' and substring(btrim(mes) from 6 for 2)::int between 1 and 12
          then substring(btrim(mes) from 6 for 2)::smallint
        when lower(translate(btrim(mes), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou')) = 'enero' then 1
        when lower(translate(btrim(mes), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou')) = 'febrero' then 2
        when lower(translate(btrim(mes), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou')) = 'marzo' then 3
        when lower(translate(btrim(mes), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou')) = 'abril' then 4
        when lower(translate(btrim(mes), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou')) = 'mayo' then 5
        when lower(translate(btrim(mes), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou')) = 'junio' then 6
        when lower(translate(btrim(mes), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou')) = 'julio' then 7
        when lower(translate(btrim(mes), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou')) = 'agosto' then 8
        when lower(translate(btrim(mes), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou')) in ('septiembre', 'setiembre') then 9
        when lower(translate(btrim(mes), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou')) = 'octubre' then 10
        when lower(translate(btrim(mes), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou')) = 'noviembre' then 11
        when lower(translate(btrim(mes), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou')) = 'diciembre' then 12
        else null
      end);
  elsif t in ('integer', 'bigint', 'numeric', 'real', 'double precision') then
    alter table cotizaciones alter column mes type smallint
      using (case when mes between 1 and 12 then mes::smallint else null end);
  elsif t in ('date', 'timestamp without time zone', 'timestamp with time zone') then
    alter table cotizaciones alter column mes type smallint using (extract(month from mes)::smallint);
  end if;
exception when others then
  raise notice 'No se pudo convertir la columna mes (%). La app funciona igual: acepta texto o número.', sqlerrm;
end $$;
 
-- 1.2) valor_total: con varios ítems ya no puede ser Cantidad x Valor Unitario
-- generado por la base, así que es una columna normal que calcula la app.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cotizaciones'
      and column_name = 'valor_total' and is_generated = 'ALWAYS'
  ) then
    alter table cotizaciones drop column valor_total;
  end if;
end $$;
 
alter table cotizaciones add column if not exists valor_total numeric default 0;
 
update cotizaciones
   set valor_total = coalesce(cantidad, 0) * coalesce(valor_unitario, 0)
 where coalesce(valor_total, 0) = 0;
 
-- 2) ALERTAS (agenda y pendientes) -------------------------------
create table if not exists alertas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);
 
alter table alertas
  add column if not exists titulo text,
  add column if not exists descripcion text,
  add column if not exists fecha_limite date,
  add column if not exists estado text default 'Pendiente',
  add column if not exists cotizacion_id uuid,
  add column if not exists n_cotizacion text,
  add column if not exists usuario_email text;
 
-- 3) LLAMADAS / PROSPECTOS (Empresa, Cliente, Correo, Teléfono, Área) ----
create table if not exists llamadas_prospectos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);
 
alter table llamadas_prospectos
  add column if not exists empresa text,
  add column if not exists nombre_cliente text,
  add column if not exists correo text,
  add column if not exists telefono text,
  add column if not exists area text,
  add column if not exists usuario_email text;
 
-- 4) PROSPECCIÓN COMERCIAL (contacto + fiesta / fecha especial) ----
create table if not exists clientes_prospeccion (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);
 
alter table clientes_prospeccion
  add column if not exists nombre_contacto text,
  add column if not exists correo text,
  add column if not exists telefono text,
  add column if not exists empresa text,
  add column if not exists fiesta text,
  add column if not exists detalle text,
  add column if not exists usuario_email text;
 
-- 5) AUDITORÍA ---------------------------------------------------
create table if not exists historial_auditoria (
  id uuid primary key default gen_random_uuid(),
  fecha_hora timestamptz default now()
);
 
alter table historial_auditoria
  add column if not exists usuario_email text,
  add column if not exists accion text,
  add column if not exists registro_id uuid,
  add column if not exists n_cotizacion text,
  add column if not exists campos_modificados jsonb;
 
-- 6) PERFILES, ROLES Y PERMISOS ----------------------------------
-- Roles:
--   super_admin : todo + administra usuarios y permisos
--   admin       : todo el trabajo comercial (sin administrar usuarios)
--   comercial   : trabaja cotizaciones, agenda, cotizador, llamadas y prospección
--   consulta    : solo lectura de cotizaciones y cotizador
--   sin_acceso  : cuenta nueva, no ve nada hasta que el super admin la habilite
-- Para comercial / consulta / sin_acceso, la columna "permisos" (json) afina cada módulo.
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text,
  rol text not null default 'sin_acceso',
  activo boolean not null default true,
  permisos jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
 
-- Migra el esquema anterior ('usuario') a los roles nuevos
alter table perfiles drop constraint if exists perfiles_rol_check;
update perfiles set rol = 'comercial' where rol = 'usuario';
alter table perfiles
  add constraint perfiles_rol_check
  check (rol in ('super_admin', 'admin', 'comercial', 'consulta', 'sin_acceso'));
alter table perfiles alter column rol set default 'sin_acceso';
 
-- Los comerciales existentes reciben también el módulo de prospección
update perfiles
   set permisos = permisos || '{"prospeccion":true}'::jsonb
 where rol = 'comercial' and not (permisos ? 'prospeccion');
 
-- Funciones de seguridad (security definer: evitan recursión en las políticas)
create or replace function public.es_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'super_admin' and activo
  )
$$;
 
create or replace function public.tiene_permiso(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and activo
      and (rol in ('super_admin', 'admin') or coalesce((permisos ->> p)::boolean, false))
  )
$$;
 
grant execute on function public.es_super_admin() to authenticated;
grant execute on function public.tiene_permiso(text) to authenticated;
 
-- Cada cuenta nueva (Authentication > Users) obtiene su perfil como 'sin_acceso'
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;
 
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
 
-- Cuentas que YA existen y no tienen perfil: quedan como 'comercial' para que nada deje de funcionar
insert into public.perfiles (id, email, rol, permisos)
select id, email, 'comercial',
  '{"cotizaciones_ver":true,"cotizaciones_crear":true,"cotizaciones_editar":true,"agenda":true,"cotizador":true,"llamadas":true,"prospeccion":true}'::jsonb
from auth.users
on conflict (id) do nothing;
 
-- 7) SEGURIDAD (RLS) ---------------------------------------------
alter table perfiles enable row level security;
alter table cotizaciones enable row level security;
alter table alertas enable row level security;
alter table llamadas_prospectos enable row level security;
alter table clientes_prospeccion enable row level security;
alter table historial_auditoria enable row level security;
 
-- perfiles: cada quien ve el suyo; el super admin ve y edita todos
drop policy if exists "perfil_select" on perfiles;
create policy "perfil_select" on perfiles for select to authenticated
  using (id = auth.uid() or public.es_super_admin());
drop policy if exists "perfil_update" on perfiles;
create policy "perfil_update" on perfiles for update to authenticated
  using (public.es_super_admin()) with check (public.es_super_admin());
 
-- cotizaciones: un permiso por acción
drop policy if exists "auth_all" on cotizaciones;
drop policy if exists "cot_select" on cotizaciones;
drop policy if exists "cot_insert" on cotizaciones;
drop policy if exists "cot_update" on cotizaciones;
drop policy if exists "cot_delete" on cotizaciones;
create policy "cot_select" on cotizaciones for select to authenticated
  using (public.tiene_permiso('cotizaciones_ver'));
create policy "cot_insert" on cotizaciones for insert to authenticated
  with check (public.tiene_permiso('cotizaciones_crear'));
create policy "cot_update" on cotizaciones for update to authenticated
  using (public.tiene_permiso('cotizaciones_editar')) with check (public.tiene_permiso('cotizaciones_editar'));
create policy "cot_delete" on cotizaciones for delete to authenticated
  using (public.tiene_permiso('cotizaciones_eliminar'));
 
-- alertas
drop policy if exists "auth_all" on alertas;
drop policy if exists "alertas_all" on alertas;
create policy "alertas_all" on alertas for all to authenticated
  using (public.tiene_permiso('agenda')) with check (public.tiene_permiso('agenda'));
 
-- llamadas / prospectos
drop policy if exists "auth_all" on llamadas_prospectos;
drop policy if exists "llamadas_all" on llamadas_prospectos;
create policy "llamadas_all" on llamadas_prospectos for all to authenticated
  using (public.tiene_permiso('llamadas')) with check (public.tiene_permiso('llamadas'));
 
-- prospección comercial
drop policy if exists "prospeccion_all" on clientes_prospeccion;
create policy "prospeccion_all" on clientes_prospeccion for all to authenticated
  using (public.tiene_permiso('prospeccion')) with check (public.tiene_permiso('prospeccion'));
 
-- auditoría: lectura con permiso; cada quien registra SU movimiento; nadie edita ni borra
drop policy if exists "auth_select" on historial_auditoria;
drop policy if exists "auth_insert" on historial_auditoria;
drop policy if exists "aud_select" on historial_auditoria;
drop policy if exists "aud_insert" on historial_auditoria;
create policy "aud_select" on historial_auditoria for select to authenticated
  using (public.tiene_permiso('historial'));
create policy "aud_insert" on historial_auditoria for insert to authenticated
  with check (usuario_email = (auth.jwt() ->> 'email'));
 
-- 8) Refresca la caché de esquema de la API
notify pgrst, 'reload schema';
 
-- 9) SUPER ADMIN -------------------------------------------------
-- >>> EDITA ESTE CORREO: la cuenta debe existir en Authentication > Users <<<
update public.perfiles
   set rol = 'super_admin', activo = true
 where lower(email) = lower('ing.montes@gmail.com');
 
-- Aviso si no quedó ningún super admin (el correo de arriba no coincide con ninguna cuenta)
do $$
begin
  if not exists (select 1 from public.perfiles where rol = 'super_admin') then
    raise warning 'NO HAY SUPER ADMIN: corrige el correo de la sección 9 y vuelve a ejecutar.';
  end if;
end $$;
 
-- Resultado (debe aparecer tu correo con rol super_admin):
select email, rol, activo from public.perfiles order by created_at;
 
Claude ha terminado la respuesta
