-- Configurações → Versículos: exibir ou não, como e onde aparece no Início,
-- e cada versículo pode ser escondido sem apagar.
alter table public.versiculos add column if not exists visivel boolean not null default true;
alter table public.configuracoes
  add column if not exists vers_exibir boolean not null default true,
  add column if not exists vers_estilo text not null default 'caixa',
  add column if not exists vers_posicao text not null default 'mensagem',
  add column if not exists vers_referencia boolean not null default true,
  add column if not exists vers_fundo text not null default 'escuro',
  add column if not exists vers_fonte text not null default 'serifa',
  add column if not exists vers_tamanho text not null default 'medio',
  add column if not exists vers_cores jsonb;
alter table public.configuracoes drop constraint if exists vers_cfg_valida;
alter table public.configuracoes add constraint vers_cfg_valida check (
  vers_estilo in ('caixa', 'simples') and vers_posicao in ('topo', 'mensagem', 'depois')
  and vers_fundo in ('claro', 'escuro', 'transparente') and vers_fonte in ('serifa', 'sem-serifa')
  and vers_tamanho in ('pequeno', 'medio', 'grande') and (vers_cores is null or jsonb_typeof(vers_cores) = 'object'));
