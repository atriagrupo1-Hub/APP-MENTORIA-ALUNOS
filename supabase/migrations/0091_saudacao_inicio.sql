-- Configurações → Início: a saudação do topo ("Bem-vindo(a), {nome}").
alter table public.configuracoes add column if not exists inicio_saudacao text not null default 'Bem-vindo(a), {nome}';
alter table public.configuracoes drop constraint if exists inicio_saudacao_valida;
alter table public.configuracoes add constraint inicio_saudacao_valida check (length(inicio_saudacao) between 1 and 60);
