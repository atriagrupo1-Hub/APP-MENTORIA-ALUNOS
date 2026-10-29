-- Título da Mensagem de destaque (0109): o texto em cima da mensagem do dia; vazio não aparece.
alter table public.configuracoes add column if not exists vers_titulo text not null default 'Versículo de hoje';
alter table public.configuracoes drop constraint if exists configuracoes_vers_titulo_tamanho;
alter table public.configuracoes add constraint configuracoes_vers_titulo_tamanho check (char_length(vers_titulo) <= 40);
