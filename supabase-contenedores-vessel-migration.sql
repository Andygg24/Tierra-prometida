-- Migración: agregar columna vessel (motonave) a contenedores
-- Se captura al crear/editar el contenedor en Logística, así queda
-- disponible para la Carta de Responsabilidad y otros documentos sin
-- tener que volver a escribirla en el Packing List.
ALTER TABLE contenedores
  ADD COLUMN IF NOT EXISTS vessel text;

-- Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contenedores'
  AND column_name = 'vessel';
