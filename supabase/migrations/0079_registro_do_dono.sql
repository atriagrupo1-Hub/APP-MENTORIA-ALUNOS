-- Registro só do Dono: começa do zero, guarda a origem de cada ação e as
-- entradas no painel (para o tempo de uso). Só o Dono lê e apaga.

alter table public.historico_acoes
  add column if not exists ref_tipo text,
  add column if not exists ref_id text,
  add column if not exists contexto text;

-- Começa do zero (pedido do Dono).
delete from public.historico_acoes;

drop policy if exists historico_le on public.historico_acoes;
create policy historico_le on public.historico_acoes for select
  using (eh_dono() or (eh_equipe() and aluna_id is not null));
drop policy if exists historico_apaga on public.historico_acoes;
create policy historico_apaga on public.historico_acoes for delete using (eh_dono());

-- Entradas no painel. O navegador só manda sinais; quem grava é o banco.
create table if not exists public.sessoes_painel (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.profiles(id) on delete cascade,
  inicio timestamptz not null default now(),
  ultimo_sinal timestamptz not null default now()
);
create index if not exists sessoes_painel_perfil on public.sessoes_painel (perfil_id, inicio desc);
alter table public.sessoes_painel enable row level security;
drop policy if exists sessoes_le on public.sessoes_painel;
create policy sessoes_le on public.sessoes_painel for select using (eh_dono());
drop policy if exists sessoes_apaga on public.sessoes_painel;
create policy sessoes_apaga on public.sessoes_painel for delete using (eh_dono());

-- Sinal de vida do painel aberto: continua a sessão se o último sinal foi
-- há menos de 3 minutos; senão abre uma nova. Devolve o id da sessão.
create or replace function public.sinal_painel(p_sessao uuid default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  if p_sessao is not null then
    update sessoes_painel set ultimo_sinal = now()
     where id = p_sessao and perfil_id = auth.uid() and ultimo_sinal > now() - interval '3 minutes'
     returning id into v_id;
    if v_id is not null then return v_id; end if;
  end if;
  insert into sessoes_painel (perfil_id) values (auth.uid()) returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.sinal_painel(uuid) from public, anon;
grant execute on function public.sinal_painel(uuid) to authenticated;

grant delete on public.historico_acoes to authenticated;
grant select, delete on public.sessoes_painel to authenticated;
