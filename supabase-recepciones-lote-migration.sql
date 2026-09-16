-- Migración: número de lote por remisión
-- El lote se asigna a la remisión completa (recepciones), en cualquier
-- momento (no necesariamente al recibir el camión). Packing List Fase 1
-- luego lo referencia por calibre para saber cuántas cajas de cada
-- calibre pertenecen a cada lote.
-- Ejecutar en Supabase SQL Editor

ALTER TABLE recepciones ADD COLUMN IF NOT EXISTS lote text;

-- Verificar
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'recepciones' ORDER BY ordinal_position;
