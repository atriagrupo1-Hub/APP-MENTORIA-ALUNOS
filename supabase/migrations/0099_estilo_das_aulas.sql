-- Estilo da tela da aula (0099): escolhido uma vez em Configurações → Aulas e
-- vale para todas as aulas (vídeo, botões, cards, textos, ícones…).
alter table public.configuracoes add column if not exists estilo_aula jsonb;
alter table public.configuracoes drop constraint if exists configuracoes_estilo_aula_objeto;
alter table public.configuracoes add constraint configuracoes_estilo_aula_objeto check (estilo_aula is null or (jsonb_typeof(estilo_aula) = 'object' and octet_length(estilo_aula::text) <= 8000));
