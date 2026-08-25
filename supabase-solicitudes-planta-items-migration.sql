-- Permite varios ítems por solicitud en el módulo Pedidos (antes era un
-- solo ítem por fila). Ejecutar en Supabase SQL Editor.

alter table solicitudes_planta
  add column if not exists items jsonb not null default '[]';

-- Migra filas ya existentes (modelo anterior de un solo ítem por solicitud)
-- al nuevo arreglo "items" — no pasa nada si la tabla está vacía.
update solicitudes_planta
set items = jsonb_build_array(jsonb_build_object('item', item, 'cantidad', cantidad, 'unidad', unidad))
where items = '[]'::jsonb and item is not null;

alter table solicitudes_planta
  drop column if exists item,
  drop column if exists cantidad,
  drop column if exists unidad;

-- Verificar
select column_name, data_type
from information_schema.columns
where table_name = 'solicitudes_planta'
order by ordinal_position;
