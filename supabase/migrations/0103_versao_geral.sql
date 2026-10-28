-- Duas versões do app (0103): quem tem a mentoria vê a versão mentoria (a de
-- sempre); quem só tem outros produtos vê a versão geral, com aparência e
-- textos próprios. Quem decide é o banco, pelos acessos da própria aluna:
-- ter acesso a qualquer coisa do produto da mentoria (o produto inteiro, um
-- módulo ou uma aula dele). Dar ou tirar esse acesso no painel troca a versão.
alter table public.configuracoes add column if not exists versao_geral jsonb not null default '{}'::jsonb;
alter table public.configuracoes drop constraint if exists configuracoes_versao_geral_objeto;
alter table public.configuracoes add constraint configuracoes_versao_geral_objeto check (jsonb_typeof(versao_geral) = 'object' and octet_length(versao_geral::text) <= 60000);

create or replace function public.minha_versao()
returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then 'mentoria'
    when (select produto_jornada from configuracoes limit 1) is null then 'mentoria'
    when exists (
      select 1 from acessos a
      left join modulos m on m.id = a.modulo_id
      left join aulas au on au.id = a.aula_id
      left join modulos m2 on m2.id = au.modulo_id
      cross join (select produto_jornada p from configuracoes limit 1) j
      where a.aluna_id = auth.uid()
        and (a.produto_id = j.p or m.produto_id = j.p or m2.produto_id = j.p
             or a.categoria_id = (select categoria_id from produtos where id = j.p))
    ) then 'mentoria'
    when eh_equipe() then 'mentoria'
    else 'geral'
  end;
$$;
revoke all on function public.minha_versao() from public, anon;
grant execute on function public.minha_versao() to authenticated;
