-- Migración: agregar columna kilos_primera_devueltos a contenedor_rendimientos
-- Dato informativo: de los kg devueltos, cuántos eran limón de primera ya
-- procesado y apto para exportación (se devolvió por falta de espacio, no
-- por calidad). No afecta ningún cálculo de rendimiento ni merma.
ALTER TABLE contenedor_rendimientos
  ADD COLUMN IF NOT EXISTS kilos_primera_devueltos numeric(10,2) DEFAULT 0;

-- Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contenedor_rendimientos'
  AND column_name = 'kilos_primera_devueltos';
