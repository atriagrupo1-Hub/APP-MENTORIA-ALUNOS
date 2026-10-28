-- Estilo do pop-up dos avisos (0102): o seletor completo (cor, degradê, contorno,
-- sombra, cantos, tamanho) para cada parte do pop-up "Ativar notificações".
alter table public.configuracoes add column if not exists estilo_notif jsonb;
alter table public.configuracoes drop constraint if exists configuracoes_estilo_notif_objeto;
alter table public.configuracoes add constraint configuracoes_estilo_notif_objeto check (estilo_notif is null or (jsonb_typeof(estilo_notif) = 'object' and octet_length(estilo_notif::text) <= 8000));
