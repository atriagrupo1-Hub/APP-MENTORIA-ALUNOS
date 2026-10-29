-- Cabeçalho do app (0104): texto (título e subtítulo) ou logo.
alter table public.configuracoes add column if not exists marca_tipo text not null default 'texto';
alter table public.configuracoes add column if not exists marca_logo text;
alter table public.configuracoes drop constraint if exists configuracoes_marca_tipo_valido;
alter table public.configuracoes add constraint configuracoes_marca_tipo_valido check (marca_tipo in ('texto', 'logo'));
