-- Vídeos que ensinam a aluna a acessar o app: { "android": caminho, "iphone": caminho } no depósito público "capas" (pasta acesso/).
-- Tutorial público, não é conteúdo pago.
alter table public.configuracoes add column if not exists acesso_videos jsonb not null default '{}'::jsonb;
