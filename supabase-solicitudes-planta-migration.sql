-- Módulo "Pedidos" (Inventario → Pedidos): solicitudes internas de insumos
-- que la planta necesita, con flujo de aprobación.
-- Ejecutar en Supabase SQL Editor.

create table if not exists solicitudes_planta (
  id             bigint primary key default extract(epoch from now())*1000,
  item           text not null,
  cantidad       numeric,
  unidad         text,
  area           text,
  prioridad      text not null default 'Media',   -- Baja | Media | Alta
  obs            text,
  estado         text not null default 'Pendiente', -- Pendiente | Aprobado | Rechazado | Comprado | Entregado
  solicitado_por text,
  trazabilidad   jsonb not null default '[]',
  created_at     timestamptz not null default now()
);

alter table solicitudes_planta disable row level security;
alter table solicitudes_planta replica identity full;

create index if not exists idx_solicitudes_planta_estado on solicitudes_planta (estado);

-- Verificar
select column_name, data_type
from information_schema.columns
where table_name = 'solicitudes_planta'
order by ordinal_position;
