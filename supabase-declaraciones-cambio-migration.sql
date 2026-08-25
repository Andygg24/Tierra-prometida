-- Módulo "Declaración de Cambio" dentro de Control Expo: cada declaración
-- llega por un valor total en USD, y se "llena" asignándole uno o varios
-- DEX (cada DEX pertenece completo a una sola declaración, no se parte).
-- Ejecutar en Supabase SQL Editor.

create table if not exists declaraciones_cambio (
  id         bigint primary key default extract(epoch from now())*1000,
  numero     text,               -- número/referencia de la declaración, si se conoce
  banco      text,               -- banco o intermediario cambiario
  valor_usd  numeric not null,
  fecha      date,
  obs        text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table declaraciones_cambio disable row level security;
alter table declaraciones_cambio replica identity full;

-- Cada DEX apunta a lo sumo a una declaración de cambio. Si se borra la
-- declaración, los DEX asignados quedan libres (no se borran).
alter table control_expo
  add column if not exists declaracion_cambio_id bigint references declaraciones_cambio(id) on delete set null;

create index if not exists idx_control_expo_declaracion_cambio on control_expo(declaracion_cambio_id);

-- Verificar
select column_name, data_type
from information_schema.columns
where table_name = 'declaraciones_cambio'
order by ordinal_position;
