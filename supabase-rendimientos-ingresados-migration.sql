-- Migración: reestructura Rendimientos con el modelo de 5 conceptos que pidió
-- el jefe — Kilos ingresados y Kilos no procesados se capturan aparte, y
-- Kilos procesados pasa a calcularse (ingresados - no procesados) en vez de
-- escribirse a mano.
-- Ejecutar en Supabase SQL Editor

ALTER TABLE contenedor_rendimientos ADD COLUMN IF NOT EXISTS kilos_ingresados numeric DEFAULT 0;
ALTER TABLE contenedor_rendimientos ADD COLUMN IF NOT EXISTS kilos_no_procesados numeric DEFAULT 0;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contenedor_rendimientos'
ORDER BY ordinal_position;
