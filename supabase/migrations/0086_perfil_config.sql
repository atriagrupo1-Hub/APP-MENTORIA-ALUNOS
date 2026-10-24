-- Configurações → Perfil: o que a tela Perfil da aluna mostra.
alter table public.configuracoes
  add column if not exists perfil_titulo text not null default 'Seu perfil',
  add column if not exists perfil_saudacao text not null default '{nome_completo}',
  add column if not exists perfil_imagem text not null default 'nenhum',
  add column if not exists perfil_texto text,
  add column if not exists perfil_layout text not null default 'padrao',
  add column if not exists perfil_botoes jsonb not null default '[
    {"id":"configurar","rotulo":"Configurar","desc":"Leva para as configurações da aluna","visivel":true},
    {"id":"onde_parei","rotulo":"Onde parei","desc":"Leva para o último conteúdo acessado","visivel":true},
    {"id":"sair","rotulo":"Sair da área de membros","desc":"Desloga a aluna da sua conta","visivel":true}]'::jsonb;
alter table public.configuracoes drop constraint if exists perfil_cfg_valida;
alter table public.configuracoes add constraint perfil_cfg_valida check (
  perfil_imagem in ('foto', 'icone', 'nenhum') and perfil_layout in ('padrao', 'moldura', 'minimalista')
  and jsonb_typeof(perfil_botoes) = 'array' and jsonb_array_length(perfil_botoes) <= 12);
