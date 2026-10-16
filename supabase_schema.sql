-- ============================================================
-- PYC Comercial - script SQL UNIFICADO e IDEMPOTENTE
-- Ejecutar completo en Supabase > SQL Editor. Se puede correr varias veces:
-- crea lo que falta, migra lo antiguo y NO borra datos.
--
-- ANTES DE EJECUTAR: en la sección 10 revisa el/los correos del SUPER ADMIN.
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
  add column if not exists renta numeric,                 -- columna antigua (ya no se usa en la app)
  add column if not exists rentabilidad_pct numeric,      -- % Rentabilidad proyectada de la orden
  add column if not exists n_factura text,
  add column if not exists fecha_facturacion date,
  add column if not exists items jsonb default '[]'::jsonb, -- [{producto,color,cantidad,valor_unitario,total}]
  add column if not exists usuario_id uuid,               -- dueño (vendedor) de la cotización
  add column if not exists usuario_email text;

alter table cotizaciones alter column usuario_id set default auth.uid();

-- 1.1) MES: la columna es un NÚMERO (1-12). La app muestra el nombre (Enero...Diciembre)
-- y envía el número, así no hay errores de conversión. Convierte lo que ya exista.
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

-- 1.2) valor_total: con varios ítems es la SUMA de los ítems y la calcula la app
-- (si era una columna generada Cantidad x Valor Unitario, se convierte en normal).
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
 where coalesce(valor_total, 0) = 0
   and coalesce(jsonb_array_length(items), 0) = 0;

-- 2) ALERTAS (agenda y seguimientos) -----------------------------
create table if not exists alertas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table alertas
  add column if not exists titulo text,
  add column if not exists descripcion text,
  add column if not exists fecha_limite date,
  add column if not exists estado text default 'Pendiente',
  add column if not exists cliente text,                 -- empresa cliente asociada
  add column if not exists cotizacion_id uuid,
  add column if not exists n_cotizacion text,
  add column if not exists usuario_id uuid,              -- quién la creó
  add column if not exists usuario_email text,
  add column if not exists usuario_nombre text,
  add column if not exists gcal_event_id text;           -- evento creado en Google Calendar (API)

alter table alertas alter column usuario_id set default auth.uid();

-- 3) BASE DE DATOS / PROSPECCIÓN COMERCIAL -----------------------
create table if not exists clientes_prospeccion (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table clientes_prospeccion
  add column if not exists empresa text,           -- Cliente / Empresa
  add column if not exists nombre_contacto text,   -- Persona que atiende
  add column if not exists correo text,
  add column if not exists telefono text,          -- Teléfono / WhatsApp
  add column if not exists fiesta text,            -- Fiesta / Fechas Especiales
  add column if not exists detalle text,           -- profesión o evento (opcional)
  add column if not exists usuario_id uuid,
  add column if not exists usuario_email text;

alter table clientes_prospeccion alter column usuario_id set default auth.uid();

-- 4) AUDITORÍA ---------------------------------------------------
create table if not exists auditoria_logs (
  id uuid primary key default gen_random_uuid(),
  fecha_hora timestamptz not null default now()
);

alter table auditoria_logs
  add column if not exists usuario_id uuid,
  add column if not exists usuario_email text,
  add column if not exists usuario_nombre text,
  add column if not exists accion text,        -- CREAR | EDITAR | ELIMINAR
  add column if not exists modulo text,        -- Cotizaciones | Base de Datos | Alertas | Usuarios
  add column if not exists registro_id uuid,
  add column if not exists detalle text,
  add column if not exists cambios jsonb;

create index if not exists auditoria_logs_fecha_idx on auditoria_logs (fecha_hora desc);
create index if not exists auditoria_logs_registro_idx on auditoria_logs (registro_id);

-- 5) PERFILES, ROLES Y PERMISOS ----------------------------------
-- Roles:  super_admin (todo + administra usuarios)
--         vendedor    (ve SOLO sus cotizaciones; el resto según sus permisos)
--         sin_acceso  (cuenta nueva: no ve nada hasta que el super admin la habilite)
-- Permisos (columna json "permisos", solo para vendedor):
--   ver_todas_cotizaciones · cotizaciones_crear · cotizaciones_editar · cotizaciones_eliminar
--   agenda · cotizador · historial
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text,
  rol text not null default 'sin_acceso',
  activo boolean not null default true,
  permisos jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table perfiles add column if not exists nombre text;

-- Migra los roles de versiones anteriores
alter table perfiles drop constraint if exists perfiles_rol_check;
update perfiles
   set rol = 'vendedor',
       permisos = '{"ver_todas_cotizaciones":true,"cotizaciones_crear":true,"cotizaciones_editar":true,"cotizaciones_eliminar":true,"agenda":true,"cotizador":true,"historial":true}'::jsonb
 where rol = 'admin';
update perfiles set rol = 'vendedor' where rol in ('usuario', 'comercial', 'consulta');
alter table perfiles
  add constraint perfiles_rol_check check (rol in ('super_admin', 'vendedor', 'sin_acceso'));
alter table perfiles alter column rol set default 'sin_acceso';

-- 6) FUNCIONES DE SEGURIDAD (security definer: sin recursión en las políticas) ----
create or replace function public.es_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'super_admin' and activo)
$$;

create or replace function public.es_miembro()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo and rol in ('super_admin', 'vendedor'))
$$;

create or replace function public.tiene_permiso(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and activo
      and (rol = 'super_admin' or (rol = 'vendedor' and coalesce((permisos ->> p)::boolean, false)))
  )
$$;

-- ¿Puede esta cuenta ver una cotización? Propia, o permiso ver_todas_cotizaciones, o super admin
create or replace function public.puede_ver_cotizacion(owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_miembro()
     and (coalesce(owner = auth.uid(), false) or public.tiene_permiso('ver_todas_cotizaciones'))
$$;

grant execute on function public.es_super_admin() to authenticated;
grant execute on function public.es_miembro() to authenticated;
grant execute on function public.tiene_permiso(text) to authenticated;
grant execute on function public.puede_ver_cotizacion(uuid) to authenticated;

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

-- 7) DATOS EXISTENTES -------------------------------------------
-- 7.1) Cuentas que ya existen y no tienen perfil: quedan como vendedor (solo ven lo suyo)
insert into public.perfiles (id, email, rol, permisos)
select id, email, 'vendedor',
  '{"cotizaciones_crear":true,"cotizaciones_editar":true,"agenda":true,"cotizador":true}'::jsonb
from auth.users
on conflict (id) do nothing;

-- 7.2) Dueño de las cotizaciones antiguas: se recupera del historial anterior (quién las creó)
do $$
begin
  if to_regclass('public.historial_auditoria') is not null then
    execute $q$
      update public.cotizaciones c
         set usuario_email = h.usuario_email
        from (select distinct on (registro_id) registro_id, usuario_email
                from public.historial_auditoria
               where accion = 'CREAR' and registro_id is not null
               order by registro_id, fecha_hora asc) h
       where c.id = h.registro_id and c.usuario_email is null
    $q$;
  end if;
exception when others then
  raise notice 'No se pudo recuperar el dueño desde historial_auditoria: %', sqlerrm;
end $$;

update public.cotizaciones t set usuario_id = u.id from auth.users u
 where t.usuario_id is null and t.usuario_email is not null and lower(t.usuario_email) = lower(u.email);
update public.alertas t set usuario_id = u.id from auth.users u
 where t.usuario_id is null and t.usuario_email is not null and lower(t.usuario_email) = lower(u.email);
update public.clientes_prospeccion t set usuario_id = u.id from auth.users u
 where t.usuario_id is null and t.usuario_email is not null and lower(t.usuario_email) = lower(u.email);

-- 7.3) El historial anterior se copia a auditoria_logs (solo la primera vez)
do $$
begin
  if to_regclass('public.historial_auditoria') is not null
     and not exists (select 1 from public.auditoria_logs) then
    insert into public.auditoria_logs (fecha_hora, usuario_email, accion, modulo, registro_id, detalle, cambios)
    select coalesce(fecha_hora, now()), usuario_email, accion, 'Cotizaciones', registro_id,
           'Cotización ' || coalesce(n_cotizacion, ''), campos_modificados
      from public.historial_auditoria;
  end if;
exception when others then
  raise notice 'No se pudo copiar el historial anterior: %', sqlerrm;
end $$;

-- 8) AUDITORÍA AUTOMÁTICA (triggers) ------------------------------
-- Cada INSERT / UPDATE / DELETE queda registrado en auditoria_logs por la propia base de datos:
-- no depende de la app y nadie puede saltárselo ni alterarlo desde el navegador.
create or replace function public.log_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modulo text := tg_argv[0];
  v_email text := coalesce(auth.jwt() ->> 'email', 'sistema');
  v_nombre text;
  v_accion text;
  v_old jsonb;
  v_new jsonb;
  v_ref jsonb;
  v_id uuid;
  v_cambios jsonb;
begin
  select nombre into v_nombre from public.perfiles where id = auth.uid();

  if tg_op = 'INSERT' then
    v_accion := 'CREAR';
    v_new := to_jsonb(new); v_ref := v_new; v_cambios := v_new; v_id := (v_new ->> 'id')::uuid;
  elsif tg_op = 'UPDATE' then
    v_accion := 'EDITAR';
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_ref := v_new; v_id := (v_new ->> 'id')::uuid;
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('antes', v_old -> n.key, 'despues', n.value)), '{}'::jsonb)
      into v_cambios
      from jsonb_each(v_new) n
     where n.key <> 'created_at' and (v_old -> n.key) is distinct from n.value;
    if v_cambios = '{}'::jsonb then return null; end if;   -- no cambió nada: no se registra
  else
    v_accion := 'ELIMINAR';
    v_old := to_jsonb(old); v_ref := v_old; v_cambios := v_old; v_id := (v_old ->> 'id')::uuid;
  end if;

  insert into public.auditoria_logs (usuario_id, usuario_email, usuario_nombre, accion, modulo, registro_id, detalle, cambios)
  values (
    auth.uid(), v_email, v_nombre, v_accion, v_modulo, v_id,
    concat_ws(' · ', v_ref ->> 'n_cotizacion', v_ref ->> 'cliente', v_ref ->> 'titulo',
              v_ref ->> 'empresa', v_ref ->> 'nombre_contacto', v_ref ->> 'email'),
    v_cambios
  );
  return null;
end $$;

drop trigger if exists trg_audit_cotizaciones on cotizaciones;
create trigger trg_audit_cotizaciones after insert or update or delete on cotizaciones
  for each row execute function public.log_auditoria('Cotizaciones');

drop trigger if exists trg_audit_base_datos on clientes_prospeccion;
create trigger trg_audit_base_datos after insert or update or delete on clientes_prospeccion
  for each row execute function public.log_auditoria('Base de Datos');

drop trigger if exists trg_audit_alertas on alertas;
create trigger trg_audit_alertas after insert or update or delete on alertas
  for each row execute function public.log_auditoria('Alertas');

drop trigger if exists trg_audit_perfiles on perfiles;
create trigger trg_audit_perfiles after update or delete on perfiles
  for each row execute function public.log_auditoria('Usuarios');

-- 9) SEGURIDAD (RLS) ---------------------------------------------
alter table perfiles enable row level security;
alter table cotizaciones enable row level security;
alter table alertas enable row level security;
alter table clientes_prospeccion enable row level security;
alter table auditoria_logs enable row level security;

-- Limpia políticas de versiones anteriores
drop policy if exists "auth_all" on cotizaciones;
drop policy if exists "auth_all" on alertas;
drop policy if exists "alertas_all" on alertas;
drop policy if exists "prospeccion_all" on clientes_prospeccion;

-- perfiles: cada quien ve el suyo; solo el super admin ve y edita todos
drop policy if exists "perfil_select" on perfiles;
create policy "perfil_select" on perfiles for select to authenticated
  using (id = auth.uid() or public.es_super_admin());
drop policy if exists "perfil_update" on perfiles;
create policy "perfil_update" on perfiles for update to authenticated
  using (public.es_super_admin()) with check (public.es_super_admin());

-- cotizaciones: cada vendedor ve las SUYAS; con ver_todas_cotizaciones ve las de todo el equipo
drop policy if exists "cot_select" on cotizaciones;
create policy "cot_select" on cotizaciones for select to authenticated
  using (public.puede_ver_cotizacion(usuario_id));

drop policy if exists "cot_insert" on cotizaciones;
create policy "cot_insert" on cotizaciones for insert to authenticated
  with check (public.tiene_permiso('cotizaciones_crear') and (usuario_id = auth.uid() or public.es_super_admin()));

drop policy if exists "cot_update" on cotizaciones;
create policy "cot_update" on cotizaciones for update to authenticated
  using (public.puede_ver_cotizacion(usuario_id) and public.tiene_permiso('cotizaciones_editar'))
  with check (public.puede_ver_cotizacion(usuario_id) and public.tiene_permiso('cotizaciones_editar'));

drop policy if exists "cot_delete" on cotizaciones;
create policy "cot_delete" on cotizaciones for delete to authenticated
  using (public.puede_ver_cotizacion(usuario_id) and public.tiene_permiso('cotizaciones_eliminar'));

-- alertas: todo el equipo con permiso "agenda" las ve; solo su creador (o el super admin) las modifica
drop policy if exists "alertas_select" on alertas;
create policy "alertas_select" on alertas for select to authenticated
  using (public.tiene_permiso('agenda'));

drop policy if exists "alertas_insert" on alertas;
create policy "alertas_insert" on alertas for insert to authenticated
  with check (public.tiene_permiso('agenda') and (usuario_id = auth.uid() or public.es_super_admin()));

drop policy if exists "alertas_update" on alertas;
create policy "alertas_update" on alertas for update to authenticated
  using (public.tiene_permiso('agenda') and (usuario_id = auth.uid() or public.es_super_admin()))
  with check (public.tiene_permiso('agenda') and (usuario_id = auth.uid() or public.es_super_admin()));

drop policy if exists "alertas_delete" on alertas;
create policy "alertas_delete" on alertas for delete to authenticated
  using (public.tiene_permiso('agenda') and (usuario_id = auth.uid() or public.es_super_admin()));

-- Base de Datos: lectura y alta para todo el equipo; editar/eliminar el autor o quien tenga el permiso
drop policy if exists "bd_select" on clientes_prospeccion;
create policy "bd_select" on clientes_prospeccion for select to authenticated
  using (public.es_miembro());

drop policy if exists "bd_insert" on clientes_prospeccion;
create policy "bd_insert" on clientes_prospeccion for insert to authenticated
  with check (public.es_miembro() and (usuario_id = auth.uid() or public.es_super_admin()));

drop policy if exists "bd_update" on clientes_prospeccion;
create policy "bd_update" on clientes_prospeccion for update to authenticated
  using (public.es_miembro() and (usuario_id = auth.uid() or public.tiene_permiso('cotizaciones_editar')))
  with check (public.es_miembro() and (usuario_id = auth.uid() or public.tiene_permiso('cotizaciones_editar')));

drop policy if exists "bd_delete" on clientes_prospeccion;
create policy "bd_delete" on clientes_prospeccion for delete to authenticated
  using (public.es_miembro() and (usuario_id = auth.uid() or public.tiene_permiso('cotizaciones_eliminar')));

-- auditoria_logs: solo lectura (super admin o permiso "historial"). Nadie inserta/edita/borra desde la app:
-- los registros los escribe únicamente el trigger.
drop policy if exists "log_select" on auditoria_logs;
create policy "log_select" on auditoria_logs for select to authenticated
  using (public.es_super_admin() or public.tiene_permiso('historial'));

-- Tablas antiguas (se conservan sus datos, solo las ve el super admin)
do $$
begin
  if to_regclass('public.historial_auditoria') is not null then
    execute 'alter table public.historial_auditoria enable row level security';
    execute 'drop policy if exists "auth_select" on public.historial_auditoria';
    execute 'drop policy if exists "auth_insert" on public.historial_auditoria';
    execute 'drop policy if exists "aud_select" on public.historial_auditoria';
    execute 'drop policy if exists "aud_insert" on public.historial_auditoria';
    execute 'drop policy if exists "hist_old_select" on public.historial_auditoria';
    execute 'create policy "hist_old_select" on public.historial_auditoria for select to authenticated using (public.es_super_admin())';
  end if;
  if to_regclass('public.llamadas_prospectos') is not null then
    execute 'alter table public.llamadas_prospectos enable row level security';
    execute 'drop policy if exists "auth_all" on public.llamadas_prospectos';
    execute 'drop policy if exists "llamadas_all" on public.llamadas_prospectos';
    execute 'drop policy if exists "llamadas_select" on public.llamadas_prospectos';
    execute 'create policy "llamadas_select" on public.llamadas_prospectos for select to authenticated using (public.es_miembro())';
  end if;
end $$;

-- 10) SUPER ADMIN -------------------------------------------------
-- >>> Deja SOLO tu(s) correo(s). Cada cuenta debe existir en Authentication > Users <<<
update public.perfiles
   set rol = 'super_admin', activo = true
 where lower(email) in (lower('ing.montes@gmail.com'), lower('ing.montes03@gmail.com'));

-- Aviso si no quedó ningún super admin
do $$
begin
  if not exists (select 1 from public.perfiles where rol = 'super_admin') then
    raise warning 'NO HAY SUPER ADMIN: corrige los correos de la sección 10 y vuelve a ejecutar.';
  end if;
end $$;

-- 11) Refresca la caché de esquema de la API (evita "column ... in the schema cache")
notify pgrst, 'reload schema';

-- Resultado: debe aparecer tu correo con rol super_admin
select email, rol, activo from public.perfiles order by created_at;
