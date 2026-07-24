-- Migración: registrar quién hizo cada préstamo/devolución de canastillas
-- (mismo patrón que canastilla_rondas.iniciada_por), para poder rastrear
-- quién despachó o recibió cada lote cuando varios operarios usan el
-- escáner.
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE canastilla_movimientos ADD COLUMN IF NOT EXISTS registrado_por text;

-- Verificar
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'canastilla_movimientos' ORDER BY ordinal_position;
