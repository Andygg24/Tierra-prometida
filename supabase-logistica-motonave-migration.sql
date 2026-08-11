-- Migración: Motonave en la operación de Logística
-- Ejecutar en Supabase SQL Editor

ALTER TABLE logistica_bookings ADD COLUMN IF NOT EXISTS motonave text;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'logistica_bookings'
ORDER BY ordinal_position;
