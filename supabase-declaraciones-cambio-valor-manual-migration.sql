-- Permite un valor manual por DEX dentro de una Declaración de Cambio —
-- a veces no se usa el monto completo del DEX en esa declaración.
-- Ejecutar en Supabase SQL Editor.

alter table control_expo
  add column if not exists valor_declaracion_usd numeric;

-- Verificar
select column_name, data_type
from information_schema.columns
where table_name = 'control_expo'
  and column_name = 'valor_declaracion_usd';
