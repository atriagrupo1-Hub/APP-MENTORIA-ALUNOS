-- Estilos visuais (0098): cor livre, degradê, contorno, sombra, tamanho e formato,
-- escolhidos no painel para cada categoria (card, botão, capa) e cada módulo
-- (card, capa, botão "Ver aulas", cards das aulas). Vazio = o visual padrão do app.
alter table public.categorias_aba add column if not exists estilo jsonb;
alter table public.modulos add column if not exists estilo jsonb;
alter table public.categorias_aba drop constraint if exists categorias_aba_estilo_objeto;
alter table public.categorias_aba add constraint categorias_aba_estilo_objeto check (estilo is null or (jsonb_typeof(estilo) = 'object' and octet_length(estilo::text) <= 4000));
alter table public.modulos drop constraint if exists modulos_estilo_objeto;
alter table public.modulos add constraint modulos_estilo_objeto check (estilo is null or (jsonb_typeof(estilo) = 'object' and octet_length(estilo::text) <= 4000));
