-- La tabla solicitudes_planta (módulo Pedidos) nunca quedó registrada en
-- la publicación de tiempo real de Supabase, así que ni la lista de
-- Pedidos se actualizaba sola entre usuarios, ni la alerta en el título de
-- la pestaña ("alguien creó un pedido") llegaba a dispararse.
-- Ejecutar en Supabase SQL Editor.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'solicitudes_planta'
  ) then
    alter publication supabase_realtime add table solicitudes_planta;
  end if;
end $$;

-- Verificar
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'solicitudes_planta';
