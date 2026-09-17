-- Arregla el "canceling statement due to statement timeout" al cargar
-- Recepciones: la tabla ya pesa ~23MB (fotos guardadas dentro de estibas y
-- fotos_comparacion_proveedor) y el ORDER BY fecha,id sin índice obliga a
-- Postgres a ordenar todo ese peso en cada carga. Este índice deja que el
-- ordenamiento use el índice en vez de una ordenada completa en memoria.
-- Ejecutar en Supabase SQL Editor (seguro, no borra ni cambia datos).

CREATE INDEX IF NOT EXISTS idx_recepciones_fecha_id ON recepciones (fecha DESC, id DESC);

-- Verificar
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'recepciones';
