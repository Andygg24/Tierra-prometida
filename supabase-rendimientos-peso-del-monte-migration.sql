-- Migración: peso configurable de Cajas Del Monte en Rendimientos (16.8 o 16.5 kg)
-- Ejecutar en Supabase SQL Editor

ALTER TABLE contenedor_rendimientos
  ADD COLUMN IF NOT EXISTS peso_del_monte numeric(5,2) NOT NULL DEFAULT 16.8;

-- Verificar
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'contenedor_rendimientos'
ORDER BY ordinal_position;
