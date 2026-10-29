-- Formato do card do módulo na tela Módulos (0108): capa ao lado (como era) ou capa em cima (igual ao card do Início).
alter table public.configuracoes add column if not exists modulos_formato text not null default 'lado';
alter table public.configuracoes drop constraint if exists configuracoes_modulos_formato_valido;
alter table public.configuracoes add constraint configuracoes_modulos_formato_valido check (modulos_formato in ('lado', 'cima'));
