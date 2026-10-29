-- Textos do app opcionais (0106): o que a equipe deixar vazio não aparece no app.
alter table public.configuracoes drop constraint if exists inicio_saudacao_valida;
alter table public.configuracoes add constraint configuracoes_inicio_saudacao_tamanho check (length(inicio_saudacao) <= 60);
