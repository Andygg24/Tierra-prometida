-- Migración: agregar columna proveedor a contenedor_rendimientos
-- Ejecutar en Supabase SQL Editor

ALTER TABLE contenedor_rendimientos
  ADD COLUMN IF NOT EXISTS proveedor text;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contenedor_rendimientos'
ORDER BY ordinal_position;
