-- Migración: permitir varias fotos por factura de Caja Menor
-- Ejecutar en Supabase SQL Editor

ALTER TABLE caja_menor_facturas
  ADD COLUMN IF NOT EXISTS fotos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Migra la foto única existente (columna "foto") a la nueva lista "fotos",
-- sin perder lo ya guardado. La columna "foto" se deja intacta (no se borra).
UPDATE caja_menor_facturas
SET fotos = jsonb_build_array(foto)
WHERE foto IS NOT NULL
  AND (fotos IS NULL OR fotos = '[]'::jsonb);

-- Verificar
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'caja_menor_facturas'
ORDER BY ordinal_position;
