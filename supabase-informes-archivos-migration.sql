-- Migración: guarda los archivos que suben operarios/supervisores en el
-- módulo Informes (Word, PDF, HTML, CSV, imágenes) — antes solo vivían en
-- memoria del navegador y se perdían al recargar la página.
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS informes_archivos (
  id         bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  nombre     text NOT NULL,
  tipo       text,     -- MIME type del archivo
  tamano_kb  numeric,
  contenido  text NOT NULL,  -- archivo completo como data URL base64, para poder descargarlo íntegro después
  subido_por text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_informes_archivos_created_at ON informes_archivos(created_at DESC);

ALTER TABLE informes_archivos DISABLE ROW LEVEL SECURITY;
ALTER TABLE informes_archivos REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'informes_archivos'
ORDER BY ordinal_position;
