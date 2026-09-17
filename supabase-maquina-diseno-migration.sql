-- Guarda el diseño del plano de Máquina (posiciones de estaciones, personas,
-- objetos libres, la calibradora y las rutas de caminata) en Supabase en
-- vez de en el navegador de cada quien — así se ve igual para todos los que
-- entren al módulo, no solo en el dispositivo donde se editó.
--
-- Es una sola fila (id = 1) con un campo JSONB por cada pieza del diseño.
-- Seguro de correr más de una vez. Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS maquina_diseno (
  id              bigint PRIMARY KEY DEFAULT 1,
  calib_cfg       jsonb NOT NULL DEFAULT '{}'::jsonb,
  pos_custom      jsonb NOT NULL DEFAULT '{}'::jsonb,
  pos_personas    jsonb NOT NULL DEFAULT '{}'::jsonb,
  objetos         jsonb NOT NULL DEFAULT '[]'::jsonb,
  rutas_personas  jsonb NOT NULL DEFAULT '{}'::jsonb,
  actualizado_por text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO maquina_diseno (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Nota de seguridad: igual que el resto de tablas del proyecto, esta queda
-- sin RLS explícito por ahora (pendiente aparte, junto con las demás).

ALTER TABLE maquina_diseno REPLICA IDENTITY FULL;

-- Verificar
SELECT * FROM maquina_diseno WHERE id = 1;
