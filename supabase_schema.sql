-- Ejecutar en Supabase > SQL Editor

create table if not exists cotizaciones (
  id uuid primary key default gen_random_uuid(),
  fecha_envio date,
  semana int,
  mes text,
  n_cotizacion text,
  contacto text,
  cliente text,
  referencia text,
  cantidad numeric default 0,
  valor_unitario numeric default 0,
  valor_total numeric generated always as (coalesce(cantidad,0) * coalesce(valor_unitario,0)) stored,
  estado text default 'Pendiente' check (estado in ('Pendiente','Aprobado','Negado')),
  motivo_negacion text,
  fecha_op date,
  num_op text,
  valor_aprobado numeric,
  renta numeric,
  n_factura text,
  fecha_facturacion date,
  created_at timestamptz default now()
);

create table if not exists historial_auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario_email text not null,
  accion text not null check (accion in ('CREAR','EDITAR','ELIMINAR')),
  fecha_hora timestamptz default now(),
  registro_id uuid,
  n_cotizacion text,
  campos_modificados jsonb
);

create table if not exists pendientes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  fecha_limite date not null,
  estado text default 'Pendiente' check (estado in ('Pendiente','En curso','Completado')),
  cotizacion_id uuid references cotizaciones(id) on delete set null,
  usuario_email text,
  created_at timestamptz default now()
);

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

alter table cotizaciones enable row level security;
alter table historial_auditoria enable row level security;
alter table pendientes enable row level security;
alter table clientes enable row level security;

create policy "auth_all" on cotizaciones for all to authenticated using (true) with check (true);
create policy "auth_all" on pendientes for all to authenticated using (true) with check (true);
create policy "auth_all" on clientes for all to authenticated using (true) with check (true);
-- La auditoría es de solo inserción y lectura (no se edita ni borra)
create policy "auth_select" on historial_auditoria for select to authenticated using (true);
create policy "auth_insert" on historial_auditoria for insert to authenticated with check (true);
