-- Migración: N° Exportación y N° Proforma en Logística
-- Ejecutar en Supabase SQL Editor

ALTER TABLE logistica_bookings ADD COLUMN IF NOT EXISTS numero_exportacion integer;
ALTER TABLE logistica_bookings ADD COLUMN IF NOT EXISTS numero_proforma    integer;

CREATE INDEX IF NOT EXISTS idx_logistica_bookings_numero_exportacion ON logistica_bookings(numero_exportacion);

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'logistica_bookings'
ORDER BY ordinal_position;
