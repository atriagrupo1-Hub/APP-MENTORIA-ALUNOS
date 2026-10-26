-- Configurações → Aparência: tema, cores, fontes, imagens (logo, fundos,
-- ícone) e recursos visuais da área da aluna. Lido também antes do login.
alter table public.configuracoes add column if not exists aparencia jsonb;
alter table public.configuracoes drop constraint if exists aparencia_valida;
alter table public.configuracoes add constraint aparencia_valida check (aparencia is null or jsonb_typeof(aparencia) = 'object');
