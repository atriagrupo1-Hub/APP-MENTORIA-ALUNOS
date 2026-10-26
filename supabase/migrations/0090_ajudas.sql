-- Textos das interrogações (?) do painel que o dono editou ou removeu.
-- Sem linha aqui, vale o texto que vem no painel.
create table if not exists public.ajudas (
  chave text primary key check (length(chave) between 2 and 120),
  texto text check (texto is null or length(texto) <= 1200),
  removida boolean not null default false,
  atualizada_em timestamptz not null default now(),
  atualizada_por uuid references public.profiles(id) on delete set null
);
alter table public.ajudas enable row level security;
drop policy if exists ajudas_le on public.ajudas;
create policy ajudas_le on public.ajudas for select using (eh_equipe());
drop policy if exists ajudas_dono on public.ajudas;
create policy ajudas_dono on public.ajudas for all using (eh_dono()) with check (eh_dono());
grant select, insert, update, delete on public.ajudas to authenticated;
revoke all on public.ajudas from anon;
