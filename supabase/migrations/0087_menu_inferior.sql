-- Configurações → Menu inferior: botões (ordem, nome, ícone, cor, visível,
-- links extras), estilo, cores e tamanho dos ícones da barra da aluna.
alter table public.configuracoes
  add column if not exists menu_botoes jsonb,
  add column if not exists menu_estilo text not null default 'padrao',
  add column if not exists menu_cores jsonb,
  add column if not exists menu_tamanho text not null default 'medio';
alter table public.configuracoes drop constraint if exists menu_cfg_valida;
alter table public.configuracoes add constraint menu_cfg_valida check (
  menu_estilo in ('padrao', 'claro', 'moldura', 'minimalista') and menu_tamanho in ('pequeno', 'medio', 'grande')
  and (menu_botoes is null or (jsonb_typeof(menu_botoes) = 'array' and jsonb_array_length(menu_botoes) <= 12))
  and (menu_cores is null or jsonb_typeof(menu_cores) = 'object'));
