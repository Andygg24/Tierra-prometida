-- Código de lote de materia prima por recepción: MP-MEN01-AA-JJJ-NN
--   AA  = año (2 dígitos), JJJ = día juliano (001-366) del momento en que se
--   genera, NN = consecutivo del día (01, 02, ...).
-- Se genera desde Recepciones → "🏷️ QR del lote" y se elige en Packing List
-- Paso 1 para asignarlo a cada pallet. Es distinto de `lote`, que sigue
-- siendo el predio de origen.
--
-- Seguro de correr más de una vez. Ejecutar en Supabase SQL Editor.

ALTER TABLE recepciones ADD COLUMN IF NOT EXISTS codigo_lote text;

-- Evita que dos personas generen el mismo consecutivo a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS recepciones_codigo_lote_key ON recepciones (codigo_lote);

-- La vista liviana de la lista tiene que exponer la columna nueva
-- (CREATE OR REPLACE VIEW solo permite agregar columnas al final).
CREATE OR REPLACE VIEW recepciones_lista AS
SELECT
  r.id, r.remision, r.fecha, r.tipo, r.placa, r.conductor, r.cedula_conductor,
  r.origen, r.proveedor, r.lote, r.cajas_lote, r.supervisor, r.hora_inicio,
  r.hora_fin, r.observaciones, r.total,
  COALESCE((
    SELECT jsonb_agg((e.value - 'fotoPesoBruto') ORDER BY e.ordinality)
    FROM jsonb_array_elements(COALESCE(r.estibas, '[]'::jsonb)) WITH ORDINALITY AS e
  ), '[]'::jsonb) AS estibas,
  '[]'::jsonb AS fotos_comparacion_proveedor,
  r.codigo_lote
FROM recepciones r;

GRANT SELECT ON recepciones_lista TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- Verificar: debe aparecer la columna codigo_lote (vacía hasta que se genere).
SELECT id, remision, fecha, lote, codigo_lote FROM recepciones_lista ORDER BY fecha DESC, id DESC LIMIT 5;
