-- "Ver tudo": um cadastro de demonstração enxerga e abre todo o conteúdo
-- publicado (sem cadeado, sem data, sem ordem), sem mudar nada para as
-- outras alunas. Liga só em profiles.ver_tudo = true.
alter table public.profiles add column if not exists ver_tudo boolean not null default false;

create or replace function public.ver_tudo(p_aluna uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$ select coalesce((select ver_tudo from profiles where id = p_aluna), false) $$;
revoke all on function public.ver_tudo(uuid) from public, anon;
grant execute on function public.ver_tudo(uuid) to authenticated;

-- Guarda uma cópia de cada regra original com o sufixo __orig.
do $$
declare f text; def text;
begin
  foreach f in array array['abertura_da_aula','aberturas_da_aluna','aula_anterior_concluida','liberados_da_aluna','pode_ver_modulo','pode_ver_presente','pode_ver_produto','pode_ver_aula','pode_ver_ao_vivo','conteudo_trancado'] loop
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f;
    def := replace(def, 'FUNCTION public.' || f || '(', 'FUNCTION public.' || f || '__orig(');
    execute def;
    execute format('revoke all on function public.%I from public, anon', f || '__orig');
  end loop;
end $$;

create or replace function public.abertura_da_aula(p_aluna uuid, p_aula uuid)
returns table(abre_em timestamp with time zone)
language sql stable security definer set search_path to 'public'
as $$
  select o.abre_em from abertura_da_aula__orig(p_aluna, p_aula) o where not ver_tudo(p_aluna)
  union all
  select null::timestamptz from aulas a join modulos m on m.id = a.modulo_id
   where ver_tudo(p_aluna) and a.id = p_aula and a.publicado and not a.rascunho and m.publicado and not m.rascunho
$$;

create or replace function public.aberturas_da_aluna(p_aluna uuid)
returns table(aula_id uuid, modulo_id uuid, abre_em timestamp with time zone)
language sql stable security definer set search_path to 'public'
as $$
  select o.aula_id, o.modulo_id, o.abre_em from aberturas_da_aluna__orig(p_aluna) o where not ver_tudo(p_aluna)
  union all
  select a.id, a.modulo_id, null::timestamptz from aulas a join modulos m on m.id = a.modulo_id
   where ver_tudo(p_aluna) and a.publicado and not a.rascunho and m.publicado and not m.rascunho
$$;

create or replace function public.aula_anterior_concluida(p_aluna uuid, p_aula uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$ select ver_tudo(p_aluna) or aula_anterior_concluida__orig(p_aluna, p_aula) $$;

create or replace function public.liberados_da_aluna(p_aluna uuid)
returns table(tipo text, ref_id uuid)
language sql stable security definer set search_path to 'public'
as $$
  select o.tipo, o.ref_id from liberados_da_aluna__orig(p_aluna) o where not ver_tudo(p_aluna)
  union all
  select 'aula', a.id from aulas a join modulos m on m.id = a.modulo_id
   where ver_tudo(p_aluna) and a.publicado and not a.rascunho and m.publicado and not m.rascunho
  union all
  select 'presente', pr.id from presentes pr where ver_tudo(p_aluna) and pr.publicado
$$;

create or replace function public.pode_ver_modulo(p_modulo uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$ select ver_tudo(auth.uid()) or pode_ver_modulo__orig(p_modulo) $$;
create or replace function public.pode_ver_presente(p_presente uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$ select ver_tudo(auth.uid()) or pode_ver_presente__orig(p_presente) $$;
create or replace function public.pode_ver_produto(p_produto uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$ select ver_tudo(auth.uid()) or pode_ver_produto__orig(p_produto) $$;
create or replace function public.pode_ver_aula(p_aula uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$ select ver_tudo(auth.uid()) or pode_ver_aula__orig(p_aula) $$;
create or replace function public.pode_ver_ao_vivo(p_ao_vivo uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$ select ver_tudo(auth.uid()) or pode_ver_ao_vivo__orig(p_ao_vivo) $$;
create or replace function public.conteudo_trancado(p_conteudo uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$ select not ver_tudo(auth.uid()) and conteudo_trancado__orig(p_conteudo) $$;
