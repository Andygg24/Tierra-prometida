-- Migración: agregar columna contenedor a pedidos
-- Ejecutar en Supabase SQL Editor

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS contenedor text;

-- Verificar resultado
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'pedidos'
ORDER BY ordinal_position;
