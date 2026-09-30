-- Migración: agregar columna precio_compra a contenedor_rendimientos
-- Precio de compra ($/kg) que se ingresa una sola vez por contenedor y se
-- aplica automáticamente a todos sus calibres (a menos que un calibre tenga
-- su propio precio puntual en calibres[].precio, que manda sobre este).
-- Usado por el Informe Gerencial de Rendimiento.
-- Ejecutar en Supabase SQL Editor

ALTER TABLE contenedor_rendimientos
  ADD COLUMN IF NOT EXISTS precio_compra numeric DEFAULT 0;

-- Verificar
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'contenedor_rendimientos'
ORDER BY ordinal_position;
