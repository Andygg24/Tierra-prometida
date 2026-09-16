-- Migración: recepciones_asignaciones.contenedor_id debe apuntar al
-- contenedor de producción (tabla `contenedores`), no al booking de
-- Logística (`logistica_bookings`) — son entidades distintas, y Packing
-- List / Nómina / Asistencia QR trabajan sobre el contenedor de producción.
-- Sin este cambio, la base de datos rechaza (FK violation) cualquier
-- intento de asociar una remisión al contenedor correcto.
--
-- IMPORTANTE: antes de correr esto, asegúrate de haber borrado cualquier
-- fila vieja de recepciones_asignaciones que apunte a un booking (usa el
-- SELECT de diagnóstico de la conversación anterior) — si queda alguna,
-- este ALTER va a fallar con "violates foreign key constraint".
-- Ejecutar en Supabase SQL Editor

DO $$
DECLARE
  nombre_constraint text;
BEGIN
  SELECT tc.constraint_name INTO nombre_constraint
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'recepciones_asignaciones'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'contenedor_id'
  LIMIT 1;

  IF nombre_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE recepciones_asignaciones DROP CONSTRAINT %I', nombre_constraint);
  END IF;
END $$;

ALTER TABLE recepciones_asignaciones
  ADD CONSTRAINT recepciones_asignaciones_contenedor_id_fkey
  FOREIGN KEY (contenedor_id) REFERENCES contenedores(id) ON DELETE CASCADE;

-- Verificar
SELECT tc.constraint_name, ccu.table_name AS referencia_a
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_name = 'recepciones_asignaciones' AND tc.constraint_type = 'FOREIGN KEY';
