-- Arregla el "canceling statement due to statement timeout" en Recepciones
-- de raíz. El índice de fecha/id (supabase-recepciones-indice-fecha.sql) ya
-- ayudó, pero el problema real es el TAMAÑO: la tabla trae ~23MB en fotos
-- guardadas dentro de estibas (fotoPesoBruto) y en
-- fotos_comparacion_proveedor, y la pantalla de Recepciones carga TODAS las
-- recepciones cada vez que se abre o cambia algo — eso es lo que se está
-- demorando/cancelando, no el orden.
--
-- Esta vista expone los mismos datos que usa la lista y los informes, pero
-- sin las fotos pesadas. Los datos reales NO se tocan ni se borran — las
-- fotos siguen intactas en la tabla `recepciones`; solo se dejan de traer
-- en la carga masiva de la lista. Cuando se abre una recepción puntual para
-- editar, el sistema trae esa fila completa (con fotos) directamente por id,
-- que es rápido porque es solo una fila.
--
-- Seguro de correr más de una vez. Ejecutar en Supabase SQL Editor.

CREATE OR REPLACE VIEW recepciones_lista AS
SELECT
  r.id, r.remision, r.fecha, r.tipo, r.placa, r.conductor, r.cedula_conductor,
  r.origen, r.proveedor, r.lote, r.cajas_lote, r.supervisor, r.hora_inicio,
  r.hora_fin, r.observaciones, r.total,
  COALESCE((
    SELECT jsonb_agg((e.value - 'fotoPesoBruto') ORDER BY e.ordinality)
    FROM jsonb_array_elements(COALESCE(r.estibas, '[]'::jsonb)) WITH ORDINALITY AS e
  ), '[]'::jsonb) AS estibas,
  '[]'::jsonb AS fotos_comparacion_proveedor
FROM recepciones r;

-- Sin RLS activo todavía en este proyecto (igual que el resto de tablas,
-- pendiente aparte), así que basta con exponer la vista al rol que usa la
-- app (anon vía la clave pública).
GRANT SELECT ON recepciones_lista TO anon, authenticated;

-- Fuerza a PostgREST a recargar el esquema para que la vista quede
-- disponible de inmediato (si no, puede tardar un par de minutos en verse).
NOTIFY pgrst, 'reload schema';

-- Verificar: debe traer todas las filas, rápido, sin fotos pesadas.
SELECT id, remision, fecha, jsonb_array_length(estibas) AS num_estibas
FROM recepciones_lista ORDER BY fecha DESC, id DESC LIMIT 5;
