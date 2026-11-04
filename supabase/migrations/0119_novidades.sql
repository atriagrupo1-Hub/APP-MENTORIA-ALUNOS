-- Botão "Novidades" no topo do painel (0119): o dono liga ou desliga. Começa desligado.
alter table public.configuracoes add column if not exists novidades_ativas boolean not null default false;
