-- Migración: agrega Consignee y Número de cajas a logistica_bookings
-- Ejecutar en Supabase SQL Editor

ALTER TABLE logistica_bookings
  ADD COLUMN IF NOT EXISTS consignee    text,
  ADD COLUMN IF NOT EXISTS numero_cajas integer;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'logistica_bookings'
ORDER BY ordinal_position;
