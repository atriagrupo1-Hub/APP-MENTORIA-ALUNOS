-- Tipo do conteúdo escolhido ao criar o curso (01 · Dados iniciais).
alter table public.produtos add column if not exists tipo_conteudo text;
alter table public.produtos drop constraint if exists produtos_tipo_conteudo_ok;
alter table public.produtos add constraint produtos_tipo_conteudo_ok check (tipo_conteudo is null or tipo_conteudo in ('videoaula', 'ebook', 'audio', 'mentoria', 'curso'));
