-- Estilo da tela Perfil (0101): fundo, textos, botões e o card dos avisos.
alter table public.configuracoes add column if not exists estilo_perfil jsonb;
alter table public.configuracoes drop constraint if exists configuracoes_estilo_perfil_objeto;
alter table public.configuracoes add constraint configuracoes_estilo_perfil_objeto check (estilo_perfil is null or (jsonb_typeof(estilo_perfil) = 'object' and octet_length(estilo_perfil::text) <= 8000));
