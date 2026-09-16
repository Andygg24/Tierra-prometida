-- Migración: cajas empacadas de un lote (Recepciones → Verificación de Estibas)
-- El supervisor puede escribirlo a mano o dejar que el sistema lo calcule
-- sumando, en Packing List, todas las filas de calibre marcadas con este
-- mismo lote (en cualquier contenedor al que haya ido esa remisión).
-- Ejecutar en Supabase SQL Editor

ALTER TABLE recepciones ADD COLUMN IF NOT EXISTS cajas_lote numeric;

-- Verificar
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'recepciones' ORDER BY ordinal_position;
