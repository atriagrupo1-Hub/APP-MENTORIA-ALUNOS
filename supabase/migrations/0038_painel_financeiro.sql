-- 0038_painel_financeiro
--
-- O Painel Financeiro da Mentoria (repositório PAINEL-FINANCEIRO-MENTORIA)
-- guardava tudo no localStorage: cada navegador tinha a sua cópia, o que
-- um lançava o outro não via, e limpar o navegador apagava o financeiro.
-- Ele passa a guardar aqui, usando o mesmo login da equipe deste app.
--
-- Uma linha por chave, com o mesmo texto que antes ia para o
-- localStorage. O painel continua dono do formato do que guarda; o banco
-- só garante quem lê e quem escreve. Modelar parcelas e pagamentos em
-- tabelas próprias fica para quando o painel mudar de forma: hoje isso
-- obrigaria a reescrever a regra financeira dele, que está validada.
--
-- Acesso: dono e admin da equipe (eh_admin()). Suporte e aluna não
-- alcançam nada, nem para ler.

create table if not exists public.financeiro_dados (
  chave          text primary key check (chave ~ '^painel-[a-z0-9-]{1,80}$'),
  valor          text not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);

comment on table public.financeiro_dados is
  'Dados do Painel Financeiro da Mentoria: uma linha por chave do antigo localStorage do painel. Só dono e admin.';

alter table public.financeiro_dados enable row level security;

-- Nada herdado: no Supabase o anon ganha privilégio em toda tabela nova
-- pelo default privilege da plataforma (ver 0035_fechar_o_anon).
revoke all on public.financeiro_dados from public, anon, authenticated;
grant select, insert, update, delete on public.financeiro_dados to authenticated;
grant select, insert, update, delete on public.financeiro_dados to service_role;

drop policy if exists financeiro_equipe_admin on public.financeiro_dados;
create policy financeiro_equipe_admin on public.financeiro_dados
  for all to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

-- Quem gravou e quando: carimbado pelo banco, não pelo navegador.
create or replace function public.financeiro_carimbar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

revoke execute on function public.financeiro_carimbar() from public, anon, authenticated;

drop trigger if exists financeiro_carimbar on public.financeiro_dados;
create trigger financeiro_carimbar
  before insert or update on public.financeiro_dados
  for each row execute function public.financeiro_carimbar();

-- Quem está entrando no painel: devolve a linha só para dono e admin.
-- Vazio para qualquer outro, e o painel recusa a entrada.
create or replace function public.financeiro_eu()
returns table (id uuid, nome text, login text, papel text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nome, p.login, p.papel::text
    from public.profiles p
   where p.id = auth.uid()
     and public.eh_admin();
$$;

revoke execute on function public.financeiro_eu() from public, anon;
grant execute on function public.financeiro_eu() to authenticated;
