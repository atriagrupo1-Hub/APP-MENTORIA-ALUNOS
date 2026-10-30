-- Card de cada curso (0112): estilo próprio, texto em cima do nome e texto do botão (vazio = o de Configurações → Cursos).
alter table public.produtos add column if not exists estilo jsonb;
alter table public.produtos add column if not exists card_rotulo text;
alter table public.produtos add column if not exists card_botao text;
alter table public.produtos drop constraint if exists produtos_card_textos;
alter table public.produtos add constraint produtos_card_textos check ((card_rotulo is null or char_length(card_rotulo) <= 40) and (card_botao is null or char_length(card_botao) <= 30) and (estilo is null or (jsonb_typeof(estilo) = 'object' and octet_length(estilo::text) <= 8000)));
