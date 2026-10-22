-- Migración: peso configurable de Cajas Princesses en Rendimientos
-- (antes era fijo 15.7 kg en el código; ahora se elige o se digita manual).
-- Ejecutar en Supabase SQL Editor

ALTER TABLE contenedor_rendimientos
  ADD COLUMN IF NOT EXISTS peso_princess numeric(5,2) NOT NULL DEFAULT 15.7;

-- Verificar
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'contenedor_rendimientos' AND column_name IN ('peso_del_monte', 'peso_princess');
