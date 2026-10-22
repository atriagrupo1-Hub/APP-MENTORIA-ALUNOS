-- Número do módulo e da aula escolhido no painel (0 a 999), sem repetir
-- dentro do curso / do módulo. A ordem segue o número: escolheu 20 com
-- dez módulos, ele vai para o fim; escolheu 0, vai para o começo.
-- Antes o número era recalculado pela posição; agora é o contrário.

drop trigger if exists modulos_numerados on public.modulos;
drop trigger if exists aulas_numeradas on public.aulas;

alter table public.modulos alter column numero drop default;
alter table public.aulas alter column numero drop default;
alter table public.modulos drop constraint if exists modulos_numero_faixa;
alter table public.modulos add constraint modulos_numero_faixa check (numero between 0 and 999) not valid;
alter table public.aulas drop constraint if exists aulas_numero_faixa;
alter table public.aulas add constraint aulas_numero_faixa check (numero between 0 and 999) not valid;

-- Sem número: o próximo da sequência.
create or replace function public.numero_do_novo_modulo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.numero is null then
    select coalesce(max(numero) + 1, (select coalesce(inicio, 1) from produtos where id = new.produto_id), 1)
      into new.numero from modulos where produto_id is not distinct from new.produto_id;
  end if;
  new.ordem := coalesce(new.ordem, 0);  -- o gatilho de depois acerta pela ordem do número
  return new;
end $$;
drop trigger if exists modulos_numero_novo on public.modulos;
create trigger modulos_numero_novo before insert on public.modulos for each row execute function public.numero_do_novo_modulo();

create or replace function public.numero_da_nova_aula() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.numero is null then
    select coalesce(max(numero) + 1, 1) into new.numero from aulas where modulo_id = new.modulo_id;
  end if;
  new.ordem := coalesce(new.ordem, 0);
  return new;
end $$;
drop trigger if exists aulas_numero_nova on public.aulas;
create trigger aulas_numero_nova before insert on public.aulas for each row execute function public.numero_da_nova_aula();

-- A ordem acompanha o número.
create or replace function public.ordem_pelo_numero_modulos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update modulos m set ordem = x.o
    from (select id, (row_number() over (partition by produto_id order by numero, criado_em, id) - 1)::int as o from modulos) x
   where m.id = x.id and m.ordem is distinct from x.o;
  return null;
end $$;
drop trigger if exists modulos_ordem_pelo_numero on public.modulos;
create trigger modulos_ordem_pelo_numero after insert or delete or update of numero, produto_id on public.modulos
  for each statement execute function public.ordem_pelo_numero_modulos();

create or replace function public.ordem_pelo_numero_aulas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update aulas a set ordem = x.o
    from (select id, (row_number() over (partition by modulo_id order by numero, criada_em, id) - 1)::int as o from aulas) x
   where a.id = x.id and a.ordem is distinct from x.o;
  return null;
end $$;
drop trigger if exists aulas_ordem_pelo_numero on public.aulas;
create trigger aulas_ordem_pelo_numero after insert or delete or update of numero, modulo_id on public.aulas
  for each statement execute function public.ordem_pelo_numero_aulas();

-- Arrastar ou subir/descer: os mesmos números, redistribuídos na nova ordem.
create or replace function public.ordenar_lista(p_tabela text, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_nums smallint[];
begin
  if not eh_admin() then raise exception 'sem_permissao'; end if;
  if p_tabela not in ('categorias', 'produtos', 'modulos', 'conteudos') then
    raise exception 'tabela_invalida';
  end if;
  if p_tabela = 'modulos' then
    select array_agg(numero order by numero) into v_nums from modulos where id = any(p_ids);
    update modulos t set numero = v_nums[x.i], ordem = x.i - 1
      from unnest(p_ids) with ordinality as x(id, i) where t.id = x.id;
    return;
  end if;
  execute format(
    'update %I t set ordem = x.i - 1 from unnest($1) with ordinality as x(id, i) where t.id = x.id',
    p_tabela
  ) using p_ids;
end $$;

create or replace function public.ordenar_aulas(p_modulo uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_nums smallint[];
begin
  if not eh_admin() then raise exception 'sem_permissao'; end if;
  if exists (
    select 1 from unnest(p_ids) as x(id)
    where not exists (select 1 from aulas a where a.id = x.id and a.modulo_id = p_modulo)
  ) then
    raise exception 'aula_de_outro_modulo';
  end if;
  select array_agg(numero order by numero) into v_nums from aulas where id = any(p_ids);
  update aulas t set numero = v_nums[x.i], ordem = x.i - 1
    from unnest(p_ids) with ordinality as x(id, i) where t.id = x.id;
end $$;

-- Cópia de módulo no mesmo curso: ganha o próximo número livre.
CREATE OR REPLACE FUNCTION public.duplicar_modulo(p_modulo uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mod record;
  v_novo uuid;
  v_aula record;
  v_nova_aula uuid;
begin
  if not eh_admin() then raise exception 'sem_permissao'; end if;
  select * into v_mod from modulos where id = p_modulo;
  if not found then raise exception 'modulo_inexistente'; end if;
  insert into modulos (numero, titulo, intro, capa_path, cor_destaque, ordem, publicado, bloqueado_geral, titulo_na_arte, produto_id, capa_horizontal_path, rotulo, rotulo_aula)
  values (null, v_mod.titulo || ' (cópia)', v_mod.intro, v_mod.capa_path, v_mod.cor_destaque,
          (select coalesce(max(ordem), 0) + 1 from modulos where produto_id = v_mod.produto_id),
          v_mod.publicado, v_mod.bloqueado_geral, v_mod.titulo_na_arte, v_mod.produto_id, v_mod.capa_horizontal_path, v_mod.rotulo, v_mod.rotulo_aula)
  returning id into v_novo;
  for v_aula in select * from aulas where modulo_id = p_modulo order by ordem loop
    insert into aulas (modulo_id, numero, titulo, ordem, duracao_segundos, capa_path, comentarios_ativos, publicado, bloqueado_geral, texto, liberada_geral, resumo, exercicio)
    values (v_novo, v_aula.numero, v_aula.titulo, v_aula.ordem, v_aula.duracao_segundos, v_aula.capa_path, v_aula.comentarios_ativos, v_aula.publicado, v_aula.bloqueado_geral, v_aula.texto, false, v_aula.resumo, v_aula.exercicio)
    returning id into v_nova_aula;
    insert into aula_midia (aula_id, video_provider, video_ref) select v_nova_aula, video_provider, video_ref from aula_midia where aula_id = v_aula.id;
    insert into conteudos (produto_id, modulo_id, aula_id, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado)
    select produto_id, v_novo, v_nova_aula, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado from conteudos where aula_id = v_aula.id;
  end loop;
  return v_novo;
end;
$function$;
