-- Configurações → Início: o que aparece abaixo da mensagem de boas-vindas
-- (nenhum, imagem, vídeo ou os cartões de destaque) e o estilo da seção.
alter table public.configuracoes
  add column if not exists inicio_banner text not null default 'card',
  add column if not exists inicio_banner_imagem text,
  add column if not exists inicio_banner_video text,
  add column if not exists inicio_estilo text not null default 'padrao';
alter table public.configuracoes drop constraint if exists inicio_banner_valido;
alter table public.configuracoes add constraint inicio_banner_valido check (inicio_banner in ('nenhum', 'imagem', 'video', 'card'));
alter table public.configuracoes drop constraint if exists inicio_estilo_valido;
alter table public.configuracoes add constraint inicio_estilo_valido check (inicio_estilo in ('padrao', 'moldura', 'minimalista'));
update public.configuracoes set inicio_banner = case when exibir_destaques is false then 'nenhum' else 'card' end;
