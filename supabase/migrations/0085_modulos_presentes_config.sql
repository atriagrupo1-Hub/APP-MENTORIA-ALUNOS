-- Configurações → Módulos e Presentes: título, estilo e layout das telas da aluna,
-- e ícone e cor de cada categoria (botões de Presentes).
alter table public.configuracoes
  add column if not exists modulos_titulo text not null default 'Todos os módulos',
  add column if not exists modulos_titulo_estilo text not null default 'padrao',
  add column if not exists modulos_progresso boolean not null default true,
  add column if not exists modulos_layout text not null default 'padrao',
  add column if not exists modulos_tamanho text not null default 'medio',
  add column if not exists presentes_titulo text not null default 'Presentes',
  add column if not exists presentes_titulo_estilo text not null default 'padrao',
  add column if not exists presentes_layout text not null default 'grandes',
  add column if not exists presentes_estilo text not null default 'padrao';
alter table public.configuracoes drop constraint if exists cfg_mod_pres_validos;
alter table public.configuracoes add constraint cfg_mod_pres_validos check (
  modulos_titulo_estilo in ('padrao', 'moldura', 'minimalista') and presentes_titulo_estilo in ('padrao', 'moldura', 'minimalista')
  and modulos_layout in ('padrao', 'moldura', 'minimalista') and modulos_tamanho in ('pequeno', 'medio', 'grande')
  and presentes_layout in ('grade2', 'grade3', 'lista', 'grandes') and presentes_estilo in ('padrao', 'borda', 'minimalista'));

alter table public.categorias_aba
  add column if not exists icone text,
  add column if not exists cor text;
alter table public.categorias_aba drop constraint if exists categoria_aba_icone_cor;
alter table public.categorias_aba add constraint categoria_aba_icone_cor check (
  (icone is null or icone in ('estrela', 'presente', 'filme', 'video', 'livro', 'som', 'lupa'))
  and (cor is null or cor in ('dourado', 'violeta', 'verde', 'azul', 'vermelho', 'turquesa')));
