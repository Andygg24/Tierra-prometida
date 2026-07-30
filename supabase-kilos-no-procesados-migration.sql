-- Migración: agregar columna kilos_no_procesados a contenedor_rendimientos
-- Kg que entraron con el camión pero no se llegaron a procesar (se restan de
-- kilos_procesados para calcular el rendimiento real).
ALTER TABLE contenedor_rendimientos
  ADD COLUMN IF NOT EXISTS kilos_no_procesados numeric(10,2) DEFAULT 0;

-- Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contenedor_rendimientos'
  AND column_name = 'kilos_no_procesados';
