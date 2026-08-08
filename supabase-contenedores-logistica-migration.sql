-- Migración: enlazar contenedores con su booking de Logística
-- Ejecutar en Supabase SQL Editor

ALTER TABLE contenedores ADD COLUMN IF NOT EXISTS logistica_booking_id bigint REFERENCES logistica_bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contenedores_logistica_booking_id ON contenedores(logistica_booking_id);

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contenedores'
ORDER BY ordinal_position;
