-- Estilo da tela inicial (0100): cores, contornos e sombras do que é fixo no
-- Início (topo, saudação, versículo, card "Sua mentoria", menu de baixo).
alter table public.configuracoes add column if not exists estilo_inicio jsonb;
alter table public.configuracoes drop constraint if exists configuracoes_estilo_inicio_objeto;
alter table public.configuracoes add constraint configuracoes_estilo_inicio_objeto check (estilo_inicio is null or (jsonb_typeof(estilo_inicio) = 'object' and octet_length(estilo_inicio::text) <= 8000));
