-- Gerar capa com IA (0094): as orientações de estilo das capas, iguais para todas.
-- A equipe cola aqui o que já usa no projeto de capas; a função gerar-capa manda junto,
-- com as capas já feitas como modelo.
alter table public.configuracoes add column if not exists capa_guia text;
