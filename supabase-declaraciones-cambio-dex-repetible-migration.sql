-- Permite que un mismo DEX se reparta entre varias Declaraciones de Cambio
-- (antes un DEX solo podía pertenecer a una declaración completa). Cambia
-- el modelo de "1 columna en control_expo" a una tabla de relación, donde
-- cada fila es "este DEX aporta tanto USD a esta declaración".
-- Ejecutar en Supabase SQL Editor.

create table if not exists declaraciones_cambio_dex (
  id                    bigint primary key default extract(epoch from now())*1000,
  declaracion_cambio_id bigint not null references declaraciones_cambio(id) on delete cascade,
  dex_id                bigint not null references control_expo(id) on delete cascade,
  valor_usd             numeric not null,
  created_at            timestamptz not null default now()
);

alter table declaraciones_cambio_dex disable row level security;
alter table declaraciones_cambio_dex replica identity full;

create index if not exists idx_decl_dex_declaracion on declaraciones_cambio_dex(declaracion_cambio_id);
create index if not exists idx_decl_dex_dex          on declaraciones_cambio_dex(dex_id);

-- Migra las asignaciones que ya existían con el modelo anterior (columna
-- declaracion_cambio_id en control_expo) a la nueva tabla de relación.
insert into declaraciones_cambio_dex (id, declaracion_cambio_id, dex_id, valor_usd)
select
  (extract(epoch from now())*1000)::bigint + row_number() over (),
  declaracion_cambio_id,
  id,
  coalesce(valor_declaracion_usd, valor_dex_usd, 0)
from control_expo
where declaracion_cambio_id is not null;

alter table control_expo
  drop column if exists declaracion_cambio_id,
  drop column if exists valor_declaracion_usd;

-- Verificar
select id, declaracion_cambio_id, dex_id, valor_usd from declaraciones_cambio_dex order by id;
