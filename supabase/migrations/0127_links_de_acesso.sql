-- Link do aplicativo enviado no acesso.
-- Geral: configuracoes.link_app (vazio = endereço atual do app).
-- Por aluna: aluna_link.link (vazio/sem linha = usa o geral).
alter table public.configuracoes add column if not exists link_app text;

create table if not exists public.aluna_link (
  aluna_id uuid primary key references public.profiles(id) on delete cascade,
  link text not null check (length(link) between 1 and 500),
  atualizado_em timestamptz not null default now()
);
alter table public.aluna_link enable row level security;
drop policy if exists aluna_link_le on public.aluna_link;
create policy aluna_link_le on public.aluna_link for select using (eh_equipe());
drop policy if exists aluna_link_insere on public.aluna_link;
create policy aluna_link_insere on public.aluna_link for insert with check (eh_equipe() and eh_aluna(aluna_id));
drop policy if exists aluna_link_muda on public.aluna_link;
create policy aluna_link_muda on public.aluna_link for update using (eh_equipe()) with check (eh_equipe() and eh_aluna(aluna_id));
drop policy if exists aluna_link_apaga on public.aluna_link;
create policy aluna_link_apaga on public.aluna_link for delete using (eh_equipe());
