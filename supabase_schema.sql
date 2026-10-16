-- ============================================================
-- PYC Comercial - esquema completo e IDEMPOTENTE
-- Ejecutar en Supabase > SQL Editor. Es seguro correrlo varias veces:
-- crea lo que falta y NO borra datos existentes.
--
-- IMPORTANTE: al final hay una línea para definir quién es el
-- SUPER ADMIN. Edita ese correo ANTES de ejecutar el script.
-- ============================================================

-- 1) COTIZACIONES ------------------------------------------------
create table if not exists cotizaciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table cotizaciones
  add column if not exists fecha_envio date,
  add column if not exists semana int,
  add column if not exists mes text,
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

-- valor_total: con varios ítems ya no puede ser Cantidad x Valor Unitario
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

-- 3) LLAMADAS / PROSPECTOS ---------------------------------------
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

-- 4) AUDITORÍA ---------------------------------------------------
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

-- 5) PERFILES, ROLES Y PERMISOS ----------------------------------
-- rol: 'super_admin' (todo + administra usuarios) o 'usuario' (solo lo que se le asigne)
-- permisos: {"cotizaciones_ver":true, "cotizaciones_crear":true, "cotizaciones_editar":true,
--            "cotizaciones_eliminar":true, "agenda":true, "historial":true,
--            "cotizador":true, "llamadas":true}
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text,
  rol text not null default 'usuario',
  activo boolean not null default true,
  permisos jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfiles_rol_check') then
    alter table perfiles add constraint perfiles_rol_check check (rol in ('super_admin', 'usuario'));
  end if;
end $$;

-- Funciones de seguridad (security definer para evitar recursión en las políticas)
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
      and (rol = 'super_admin' or coalesce((permisos ->> p)::boolean, false))
  )
$$;

grant execute on function public.es_super_admin() to authenticated;
grant execute on function public.tiene_permiso(text) to authenticated;

-- Cada cuenta nueva (creada en Authentication > Users) obtiene su perfil sin permisos
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

-- Cuentas que YA existen: se les da acceso operativo completo para que nada deje de funcionar
-- (el super admin podrá restringirlas después desde la app)
insert into public.perfiles (id, email, permisos)
select id, email,
  '{"cotizaciones_ver":true,"cotizaciones_crear":true,"cotizaciones_editar":true,"cotizaciones_eliminar":true,"agenda":true,"historial":true,"cotizador":true,"llamadas":true}'::jsonb
from auth.users
on conflict (id) do nothing;

-- 6) SEGURIDAD (RLS) ---------------------------------------------
alter table perfiles enable row level security;
alter table cotizaciones enable row level security;
alter table alertas enable row level security;
alter table llamadas_prospectos enable row level security;
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

-- auditoría: solo lectura con permiso; cualquiera registra SU propio movimiento; nadie edita ni borra
drop policy if exists "auth_select" on historial_auditoria;
drop policy if exists "auth_insert" on historial_auditoria;
drop policy if exists "aud_select" on historial_auditoria;
drop policy if exists "aud_insert" on historial_auditoria;
create policy "aud_select" on historial_auditoria for select to authenticated
  using (public.tiene_permiso('historial'));
create policy "aud_insert" on historial_auditoria for insert to authenticated
  with check (usuario_email = (auth.jwt() ->> 'email'));

-- 7) SUPER ADMIN -------------------------------------------------
-- >>> EDITA ESTE CORREO: la cuenta debe existir en Authentication > Users <<<
update public.perfiles
   set rol = 'super_admin', activo = true
 where lower(email) = lower('ing.montes@gmail.com');

-- Verifica el resultado (debe aparecer tu correo con rol super_admin):
select email, rol, activo from public.perfiles order by created_at;

-- 8) Refresca la caché de esquema de la API
notify pgrst, 'reload schema';
