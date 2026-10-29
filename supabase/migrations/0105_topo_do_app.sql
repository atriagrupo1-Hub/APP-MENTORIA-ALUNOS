-- Topo do app (0105), igual em todas as telas: à esquerda a foto, "Bem-vindo," (editável)
-- e o nome da aluna (vem do cadastro); no meio a marca (texto ou logo) com cor e
-- fonte do título e do subtítulo; à direita a busca e os avisos.
alter table public.configuracoes add column if not exists topo_saudacao text not null default 'Bem-vindo(a)';
alter table public.configuracoes add column if not exists topo_estilo jsonb;
alter table public.configuracoes drop constraint if exists configuracoes_topo_valido;
alter table public.configuracoes add constraint configuracoes_topo_valido check (char_length(topo_saudacao) <= 40 and (topo_estilo is null or (jsonb_typeof(topo_estilo) = 'object' and octet_length(topo_estilo::text) <= 2000)));
-- O nome entra onde estiver {nome} (primeiro nome) ou {nome_completo}; sem isso, não aparece.
alter table public.configuracoes alter column topo_saudacao set default 'Bem-vindo(a), {nome_completo}';
