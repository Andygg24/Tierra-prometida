-- Migración: permite asignaciones "en reserva" (sin contenedor todavía) —
-- cuando de una estiba se usan menos canastillas de las asignadas/totales,
-- el excedente puede quedar reservado para asignarlo después a otro
-- contenedor, en vez de forzar a elegir uno de inmediato.
-- Ejecutar en Supabase SQL Editor

ALTER TABLE recepciones_asignaciones ALTER COLUMN contenedor_id DROP NOT NULL;

-- Verificar
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'recepciones_asignaciones'
ORDER BY ordinal_position;
