-- Configurações → Início (0095): a divisória "Também para você" do Início da aluna.
-- {exibir, texto, cor (do texto), linha (cor das linhas)}; vazio = como sempre foi.
alter table public.configuracoes add column if not exists inicio_divisor jsonb not null default '{}'::jsonb;
