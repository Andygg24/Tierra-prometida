-- Migración: agregar columna kilos_rechazados a contenedor_rendimientos
-- Limón que no pasó la prueba de calidad (no se procesa ni se empaca).
-- La devolución total pasa a calcularse como:
--   kilos_devueltos = kilos_rechazados + kilos_primera_devueltos
ALTER TABLE contenedor_rendimientos
  ADD COLUMN IF NOT EXISTS kilos_rechazados numeric(10,2) DEFAULT 0;

-- Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contenedor_rendimientos'
  AND column_name = 'kilos_rechazados';
