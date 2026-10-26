-- Suporte com permissões (0093).
--
-- Cada membro do Suporte tem a lista do que pode fazer (profiles.permissoes)
-- e as abas que não abre (abas_bloqueadas). Equipe e Configurações nunca
-- abrem para o Suporte. Quem confere é o banco: pode('acao') vale para dono
-- e administração sempre; para o Suporte, só com a permissão marcada e a aba
-- liberada. As funções que mudam dados passam a perguntar pode(); nas tabelas
-- do catálogo um gatilho confere coluna por coluna (estado, data, edição).

alter table public.profiles add column if not exists permissoes text[] not null default '{}';

create or replace function public.permissoes_validas()
returns text[] language sql immutable as $$
  select array['al_cadastrar','al_editar','al_codigo','al_liberar','al_tirar','al_validade','al_bloquear','al_excluir',
               'eng_contato','com_responder','com_aprovar','com_ocultar','com_restaurar',
               'cur_estado','cur_datas','cur_editar','cur_excluir','cat_estado','cat_editar'];
$$;

create or replace function public.aba_liberada(p_aba text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from profiles
     where id = auth.uid() and (
       (papel = 'dono' and not dono_principal and p_aba = any(abas_bloqueadas))
       or (papel = 'suporte' and (p_aba = any(abas_bloqueadas) or p_aba in ('equipe', 'config')))));
$$;

create or replace function public.pode(p_acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select eh_admin() or exists (
    select 1 from profiles
     where id = auth.uid() and papel = 'suporte' and status = 'ativa' and p_acao = any(permissoes)
       and aba_liberada(case split_part(p_acao, '_', 1) when 'al' then 'alunas' when 'eng' then 'engajamento'
             when 'com' then 'comentarios' when 'cur' then 'cursos' when 'cat' then 'layout' else '-' end));
$$;

-- Alguma permissão do grupo (cur, cat...): abre a escrita na tabela; o gatilho decide o resto.
create or replace function public.pode_grupo(p_grupo text)
returns boolean language sql stable security definer set search_path = public as $$
  select eh_admin() or exists (
    select 1 from profiles p, unnest(p.permissoes) x
     where p.id = auth.uid() and p.papel = 'suporte' and x like p_grupo || '\_%' and pode(x));
$$;

create or replace function public.definir_permissoes_suporte(p_id uuid, p_permissoes text[], p_abas_bloqueadas text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not pode_gerir(p_id) then raise exception 'Acesso bloqueado.'; end if;
  if not exists (select 1 from profiles where id = p_id and papel = 'suporte') then raise exception 'nao_e_suporte'; end if;
  update profiles
     set permissoes = array(select distinct x from unnest(coalesce(p_permissoes, '{}')) x where x = any(permissoes_validas())),
         abas_bloqueadas = array(select distinct x from unnest(coalesce(p_abas_bloqueadas, '{}')) x where x ~ '^[a-z]{2,20}$')
   where id = p_id;
end $$;

drop function if exists public.equipe_do_painel();
create function public.equipe_do_painel()
 returns table(id uuid, nome text, login text, papel papel_usuario, status status_conta, codigo text, criada_em timestamp with time zone, ultimo_acesso_em timestamp with time zone, sou_eu boolean, dono_principal boolean, pode_adicionar boolean, pode_remover boolean, pode_codigo boolean, pode_nome boolean, cor_perfil text, abas_bloqueadas text[], permissoes text[])
 language sql stable security definer set search_path to 'public' as $$
  select p.id, p.nome, p.login, p.papel, p.status,
         case when p.id = auth.uid() or pode_gerir(p.id) then c.codigo end,
         p.criada_em, p.ultimo_acesso_em,
         p.id = auth.uid(),
         p.dono_principal, p.pode_adicionar, p.pode_remover, p.pode_codigo, p.pode_nome, p.cor_perfil, p.abas_bloqueadas, p.permissoes
  from profiles p
  left join credenciais c on c.aluna_id = p.id
  where eh_admin()
    and p.papel in ('dono', 'admin', 'suporte')
  order by case when p.dono_principal then 0 when p.papel = 'dono' then 1 when p.papel = 'admin' then 2 else 3 end, p.nome;
$$;
grant execute on function public.equipe_do_painel() to authenticated;

-- Catálogo: o Suporte escreve só o que a permissão dele cobre.
create or replace function public.conferir_permissao_catalogo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  g text := tg_argv[0];
  principal boolean := tg_argv[1] = 'principal';
  k text;
begin
  if auth.uid() is null or eh_admin() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if not pode(g || '_editar') then raise exception 'Acesso bloqueado.'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if not pode(case when g = 'cur' and principal then 'cur_excluir' else g || '_editar' end) then raise exception 'Acesso bloqueado.'; end if;
    return old;
  end if;
  for k in select e.key from jsonb_each(to_jsonb(new)) e where e.value is distinct from (to_jsonb(old) -> e.key) loop
    if k ~ '^(atualizad|editad|modificad)' then continue; end if;
    if not pode(case
         when k in ('publicado', 'bloqueado_geral', 'bloqueada_geral', 'liberada_geral', 'liberada_em') then g || '_estado'
         when k = 'libera_em' and g = 'cur' then 'cur_datas'
         else g || '_editar' end) then
      raise exception 'Acesso bloqueado.';
    end if;
  end loop;
  return new;
end $$;

do $$
declare t text[];
begin
  foreach t slice 1 in array array[
    ['produtos','cur','principal','catalogo_produtos_escrita'], ['modulos','cur','principal','catalogo_modulos_escrita'],
    ['aulas','cur','principal','catalogo_aulas_escrita'], ['conteudos','cur','filho','catalogo_conteudos_escrita'],
    ['aula_midia','cur','filho','midia_aula_admin'], ['aula_materiais','cur','filho','catalogo_materiais_escrita'],
    ['aulas_ao_vivo','cur','filho','catalogo_ao_vivo_escrita'], ['ao_vivo_midia','cur','filho','midia_ao_vivo_admin'],
    ['categorias','cat','principal','catalogo_categorias_escrita'], ['categorias_aba','cat','principal','categorias_aba_escrita'],
    ['categoria_itens','cat','filho','categoria_itens_escrita'], ['presentes','cat','principal','catalogo_presentes_escrita'],
    ['presente_midia','cat','filho','midia_presente_admin']]
  loop
    execute format('alter policy %I on public.%I using (pode_grupo(%L)) with check (pode_grupo(%L))', t[4], t[1], t[2], t[2]);
    execute format('drop trigger if exists conferir_permissao on public.%I', t[1]);
    execute format('create trigger conferir_permissao before insert or update or delete on public.%I for each row execute function public.conferir_permissao_catalogo(%L, %L)', t[1], t[2], t[3]);
  end loop;
end $$;

-- A equipe inteira enxerga o catálogo no painel (antes só a administração via o que não está publicado).
alter policy catalogo_categorias_leitura on public.categorias using (conta_ativa() or eh_equipe());
alter policy categorias_aba_leitura on public.categorias_aba using (conta_ativa() or eh_equipe());
alter policy categoria_itens_leitura on public.categoria_itens using (conta_ativa() or eh_equipe());
alter policy catalogo_presentes_leitura on public.presentes using ((publicado and conta_ativa()) or eh_equipe());
alter policy catalogo_materiais_leitura on public.aula_materiais using (pode_ver_aula(aula_id) or eh_equipe());
alter policy catalogo_ao_vivo_leitura on public.aulas_ao_vivo using (conta_ativa() or eh_equipe());

-- Comentários e contatos.
alter policy comentarios_remove on public.comentarios using (pode('com_ocultar'));
alter policy contatos_insere on public.contatos_aluna with check (pode('eng_contato') and eh_aluna(aluna_id));
alter policy contatos_apaga on public.contatos_aluna using (pode('eng_contato'));

-- Arquivos do catálogo (capas, materiais, áudios).
alter policy capas_escrita on storage.objects with check (bucket_id = 'capas' and (pode_grupo('cur') or pode_grupo('cat')));
alter policy capas_atualiza on storage.objects using (bucket_id = 'capas' and (pode_grupo('cur') or pode_grupo('cat'))) with check (bucket_id = 'capas' and (pode_grupo('cur') or pode_grupo('cat')));
alter policy capas_remove on storage.objects using (bucket_id = 'capas' and (pode_grupo('cur') or pode_grupo('cat')));
alter policy materiais_escrita on storage.objects with check (bucket_id = 'materiais' and pode_grupo('cur'));
alter policy materiais_atualiza on storage.objects using (bucket_id = 'materiais' and pode_grupo('cur')) with check (bucket_id = 'materiais' and pode_grupo('cur'));
alter policy materiais_remove on storage.objects using (bucket_id = 'materiais' and pode_grupo('cur'));
alter policy audios_escrita on storage.objects with check (bucket_id = 'audios' and pode_grupo('cur'));
alter policy audios_atualiza on storage.objects using (bucket_id = 'audios' and pode_grupo('cur')) with check (bucket_id = 'audios' and pode_grupo('cur'));
alter policy audios_remove on storage.objects using (bucket_id = 'audios' and pode_grupo('cur'));

-- Funções que mudam dados: cada uma com a sua permissão.
CREATE OR REPLACE FUNCTION public.definir_status_aluna(p_aluna uuid, p_status status_conta)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (pode('al_bloquear')) then raise exception 'Acesso bloqueado.'; end if;
  if not eh_aluna(p_aluna) then raise exception 'alvo_nao_e_aluna'; end if;

  update profiles set status = p_status where id = p_aluna;
  if not found then raise exception 'aluna_nao_encontrada'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.definir_validade(p_aluna uuid, p_validade timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (pode('al_validade')) then raise exception 'Acesso bloqueado.'; end if;
  if not eh_aluna(p_aluna) then raise exception 'alvo_nao_e_aluna'; end if;
  update profiles set acesso_ate = p_validade where id = p_aluna;
end;
$function$;

CREATE OR REPLACE FUNCTION public.renovar_acesso(p_aluna uuid, p_dias integer DEFAULT 0, p_meses integer DEFAULT 0, p_anos integer DEFAULT 0)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nova timestamptz;
begin
  if not (pode('al_validade')) then raise exception 'Acesso bloqueado.'; end if;
  if p_dias < 0 or p_meses < 0 or p_anos < 0 then raise exception 'prazo_negativo'; end if;
  if p_dias = 0 and p_meses = 0 and p_anos = 0 then raise exception 'prazo_vazio'; end if;
  update profiles
     set acesso_ate = greatest(coalesce(acesso_ate, now()), now())
                    + make_interval(years => p_anos, months => p_meses, days => p_dias),
         renovada_em = now(),
         renovacoes = renovacoes + 1
   where id = p_aluna and papel = 'aluna'
   returning acesso_ate into v_nova;
  if not found then raise exception 'aluna_inexistente'; end if;
  return v_nova;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lote_renovar(p_alunas uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_n integer := 0; v_id uuid; v_nova timestamptz;
begin
  if not (pode('al_validade')) then raise exception 'Acesso bloqueado.'; end if;
  foreach v_id in array coalesce(p_alunas, '{}') loop
    continue when not eh_aluna(v_id);
    v_nova := renovar_acesso(v_id, 0, 0, 1);
    insert into historico_acoes (aluna_id, texto)
    values (v_id, 'Acesso renovado em lote até ' || to_char(v_nova at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.estender_acesso(p_aluna uuid, p_dias integer DEFAULT 0, p_meses integer DEFAULT 0, p_anos integer DEFAULT 0)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nova timestamptz;
begin
  if not (pode('al_validade')) then raise exception 'Acesso bloqueado.'; end if;
  if p_dias < 0 or p_meses < 0 or p_anos < 0 then
    raise exception 'prazo_negativo';
  end if;
  if p_dias = 0 and p_meses = 0 and p_anos = 0 then
    raise exception 'prazo_vazio';
  end if;

  update profiles
     set acesso_ate = greatest(coalesce(acesso_ate, now()), now())
                    + make_interval(years => p_anos, months => p_meses, days => p_dias)
   where id = p_aluna
   returning acesso_ate into v_nova;

  if not found then
    raise exception 'aluna_inexistente';
  end if;
  return v_nova;
end;
$function$;

CREATE OR REPLACE FUNCTION public.definir_acesso(p_aluna uuid, p_dias integer DEFAULT 0, p_meses integer DEFAULT 0, p_anos integer DEFAULT 0)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nova timestamptz;
begin
  if not (pode('al_validade')) then raise exception 'Acesso bloqueado.'; end if;
  if p_dias < 0 or p_meses < 0 or p_anos < 0 then
    raise exception 'prazo_negativo';
  end if;

  if p_dias = 0 and p_meses = 0 and p_anos = 0 then
    update profiles set acesso_ate = null where id = p_aluna returning acesso_ate into v_nova;
  else
    update profiles
       set acesso_ate = criada_em
                      + make_interval(years => p_anos, months => p_meses, days => p_dias)
     where id = p_aluna
     returning acesso_ate into v_nova;
  end if;

  if not found then
    raise exception 'aluna_inexistente';
  end if;
  return v_nova;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lote_liberar_modulo(p_alunas uuid[], p_modulo uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_titulo text; v_produto uuid; v_n integer := 0; v_id uuid;
begin
  if not (pode('al_liberar')) then raise exception 'Acesso bloqueado.'; end if;
  select titulo, produto_id into v_titulo, v_produto from modulos where id = p_modulo;
  if v_titulo is null then raise exception 'modulo_inexistente'; end if;

  foreach v_id in array coalesce(p_alunas, '{}') loop
    continue when not eh_aluna(v_id);
    if not exists (select 1 from acessos where aluna_id = v_id and escopo = 'produto' and produto_id = v_produto) then
      insert into acessos (aluna_id, escopo, modulo_id, concedido_por)
      values (v_id, 'modulo', p_modulo, auth.uid())
      on conflict (aluna_id, modulo_id) where escopo = 'modulo' do nothing;
    end if;
    insert into historico_acoes (aluna_id, texto) values (v_id, 'Módulo liberado em lote: ' || v_titulo);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.salvar_cronograma(p_aluna uuid, p_modulos uuid[], p_dias integer[], p_aulas uuid[], p_datas date[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  i integer;
  v_coberta boolean;
begin
  if not (pode('al_liberar')) then raise exception 'Acesso bloqueado.'; end if;
  if not eh_aluna(p_aluna) then raise exception 'alvo_nao_e_aluna'; end if;
  if coalesce(array_length(p_modulos, 1), 0) <> coalesce(array_length(p_dias, 1), 0)
     or coalesce(array_length(p_aulas, 1), 0) <> coalesce(array_length(p_datas, 1), 0) then
    raise exception 'listas_desencontradas';
  end if;
  if exists (select 1 from unnest(coalesce(p_dias, '{}')) d where d is null or d < 0 or d > 3650) then
    raise exception 'dias_invalidos';
  end if;

  delete from cronograma_modulo where aluna_id = p_aluna;
  insert into cronograma_modulo (aluna_id, modulo_id, dias)
  select p_aluna, x.m, x.d
  from unnest(coalesce(p_modulos, '{}'), coalesce(p_dias, '{}')) as x(m, d)
  join modulos mo on mo.id = x.m;

  for i in 1 .. coalesce(array_length(p_aulas, 1), 0) loop
    if p_datas[i] is not null then
      insert into acessos (aluna_id, escopo, aula_id, abre_em, concedido_por)
      values (p_aluna, 'aula', p_aulas[i],
              p_datas[i]::timestamp at time zone 'America/Sao_Paulo', auth.uid())
      on conflict (aluna_id, aula_id) where escopo = 'aula'
      do update set abre_em = excluded.abre_em;
    else
      -- Sem data: se algo acima libera, a linha avulsa sobra e sai; se
      -- não, ela é a liberação, e só perde a data.
      select exists (
        select 1 from aulas a
        join modulos m on m.id = a.modulo_id
        left join produtos pr on pr.id = m.produto_id
        join acessos ac on ac.aluna_id = p_aluna
         and (   (ac.escopo = 'modulo'    and ac.modulo_id    = m.id)
              or (ac.escopo = 'produto'   and ac.produto_id   = m.produto_id)
              or (ac.escopo = 'categoria' and ac.categoria_id = pr.categoria_id)
              or (ac.escopo = 'acervo'    and m.produto_id is not null))
        where a.id = p_aulas[i]
      ) into v_coberta;
      if v_coberta then
        delete from acessos
         where aluna_id = p_aluna and escopo = 'aula' and aula_id = p_aulas[i];
      else
        update acessos set abre_em = null
         where aluna_id = p_aluna and escopo = 'aula' and aula_id = p_aulas[i];
      end if;
    end if;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gerar_cronograma(p_aluna uuid, p_modulos uuid[], p_intervalo integer DEFAULT 5, p_inicio timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total integer;
begin
  if not (pode('al_liberar')) then raise exception 'Acesso bloqueado.'; end if;
  if p_intervalo < 0 or p_intervalo > 365 then
    raise exception 'intervalo_invalido';
  end if;
  if not exists (select 1 from profiles where id = p_aluna) then
    raise exception 'aluna_inexistente';
  end if;

  delete from acessos where aluna_id = p_aluna and escopo = 'aula';

  insert into acessos (aluna_id, escopo, aula_id, abre_em, concedido_por)
  select p_aluna, 'aula', ordenadas.id,
         case when p_intervalo = 0 then null
              else p_inicio + make_interval(days => (ordenadas.posicao * p_intervalo)::int)
         end,
         auth.uid()
  from (
    select a.id,
           (row_number() over (order by m.ordem, a.ordem, a.numero) - 1) as posicao
    from aulas a
    join modulos m on m.id = a.modulo_id
    where m.id = any(p_modulos) and a.publicado
  ) as ordenadas;

  get diagnostics v_total = row_count;
  return v_total;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gerar_cronograma_de_aulas(p_aluna uuid, p_aulas uuid[], p_intervalo integer DEFAULT 5, p_inicio timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total integer;
begin
  if not (pode('al_liberar')) then raise exception 'Acesso bloqueado.'; end if;
  if p_intervalo < 0 or p_intervalo > 365 then
    raise exception 'intervalo_invalido';
  end if;
  if not exists (select 1 from profiles where id = p_aluna) then
    raise exception 'aluna_inexistente';
  end if;

  delete from acessos where aluna_id = p_aluna and escopo = 'aula';

  insert into acessos (aluna_id, escopo, aula_id, abre_em, concedido_por)
  select p_aluna, 'aula', ordenadas.id,
         case when p_intervalo = 0 then null
              else p_inicio + make_interval(days => (ordenadas.posicao * p_intervalo)::int)
         end,
         auth.uid()
  from (
    select a.id,
           (row_number() over (order by m.ordem, a.ordem, a.numero) - 1) as posicao
    from aulas a
    join modulos m on m.id = a.modulo_id
    where a.id = any(p_aulas) and a.publicado
  ) as ordenadas;

  get diagnostics v_total = row_count;
  return v_total;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gerar_cronograma_lote(p_alunas uuid[], p_modulos uuid[], p_intervalo integer DEFAULT 5, p_inicio timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_aluna uuid;
  v_total integer := 0;
begin
  if not (pode('al_liberar')) then raise exception 'Acesso bloqueado.'; end if;
  foreach v_aluna in array p_alunas loop
    v_total := v_total + gerar_cronograma(v_aluna, p_modulos, p_intervalo, p_inicio);
  end loop;
  return v_total;
end;
$function$;

CREATE OR REPLACE FUNCTION public.definir_abertura(p_aluna uuid, p_aula uuid, p_abre_em timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (pode('al_liberar')) then raise exception 'Acesso bloqueado.'; end if;

  insert into acessos (aluna_id, escopo, aula_id, abre_em, concedido_por)
  values (p_aluna, 'aula', p_aula, p_abre_em, auth.uid())
  on conflict (aluna_id, aula_id) where escopo = 'aula'
  do update set abre_em = excluded.abre_em;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remover_aula_da_aluna(p_aluna uuid, p_aula uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (pode('al_tirar')) then raise exception 'Acesso bloqueado.'; end if;
  delete from acessos
   where aluna_id = p_aluna and aula_id = p_aula and escopo = 'aula';
end;
$function$;

CREATE OR REPLACE FUNCTION public.remover_aluna(p_aluna uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (pode('al_excluir')) then raise exception 'Acesso bloqueado.'; end if;
  if not eh_aluna(p_aluna) then raise exception 'alvo_nao_e_aluna'; end if;

  delete from profiles where id = p_aluna;
  if not found then raise exception 'aluna_nao_encontrada'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.editar_aluna(p_aluna uuid, p_nome text, p_login text, p_celular text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nome text := btrim(p_nome);
  v_login text := lower(btrim(p_login));
  v_celular text := nullif(regexp_replace(coalesce(p_celular, ''), '\D', '', 'g'), '');
begin
  if not (pode('al_editar')) then raise exception 'Acesso bloqueado.'; end if;
  if v_nome = '' then
    raise exception 'nome_vazio';
  end if;
  if v_login = '' then
    raise exception 'login_vazio';
  end if;
  if exists (select 1 from profiles p where p.login = v_login and p.id <> p_aluna) then
    raise exception 'login_em_uso';
  end if;

  update profiles
     set nome = v_nome, login = v_login, celular = v_celular
   where id = p_aluna and papel = 'aluna';

  if not found then
    raise exception 'aluna_nao_encontrada';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.definir_bloqueio_aula(p_aula uuid, p_bloqueada boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (pode('cur_estado')) then raise exception 'Acesso bloqueado.'; end if;
  update aulas
     set bloqueado_geral = p_bloqueada,
         liberada_geral = case when p_bloqueada then false else liberada_geral end
   where id = p_aula;
  if not found then raise exception 'aula_inexistente'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.definir_liberada_geral(p_aula uuid, p_liberada boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (pode('cur_estado')) then raise exception 'Acesso bloqueado.'; end if;
  update aulas
     set liberada_geral = p_liberada,
         bloqueado_geral = case when p_liberada then false else bloqueado_geral end
   where id = p_aula;
  if not found then raise exception 'aula_inexistente'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.liberar_aula_para_todas(p_aula uuid, p_abre_em timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(liberadas integer, ja_tinham integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_novas integer;
  v_total integer;
begin
  if not (pode('cur_estado')) then raise exception 'Acesso bloqueado.'; end if;
  if not exists (select 1 from aulas where id = p_aula) then
    raise exception 'aula_inexistente';
  end if;

  select count(*) into v_total from profiles where papel = 'aluna';

  insert into acessos (aluna_id, escopo, aula_id, abre_em, concedido_por)
  select p.id, 'aula', p_aula, p_abre_em, auth.uid()
  from profiles p
  where p.papel = 'aluna'
  on conflict (aluna_id, aula_id) where escopo = 'aula'
  do nothing;

  get diagnostics v_novas = row_count;
  return query select v_novas, v_total - v_novas;
end;
$function$;

CREATE OR REPLACE FUNCTION public.liberar_presente_para_todas(p_presente uuid)
 RETURNS TABLE(liberados integer, ja_tinham integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_novas integer;
  v_total integer;
  v_categoria uuid;
begin
  if not (pode('cat_estado')) then raise exception 'Acesso bloqueado.'; end if;

  select categoria_id into v_categoria from presentes where id = p_presente;
  if v_categoria is null then
    raise exception 'presente_inexistente';
  end if;

  select count(*) into v_total from profiles where papel = 'aluna';

  insert into acessos (aluna_id, escopo, presente_id, concedido_por)
  select p.id, 'presente', p_presente, auth.uid()
  from profiles p
  where p.papel = 'aluna'
    and not exists (
      select 1 from acessos ac
      where ac.aluna_id = p.id
        and (ac.escopo = 'acervo'
          or (ac.escopo = 'categoria' and ac.categoria_id = v_categoria)
          or (ac.escopo = 'presente'  and ac.presente_id  = p_presente))
    )
  on conflict (aluna_id, presente_id) where escopo = 'presente'
  do nothing;

  get diagnostics v_novas = row_count;
  return query select v_novas, v_total - v_novas;
end;
$function$;

CREATE OR REPLACE FUNCTION public.duplicar_aula(p_aula uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_aula record;
  v_nova uuid;
begin
  if not (pode('cur_editar')) then raise exception 'Acesso bloqueado.'; end if;
  select * into v_aula from aulas where id = p_aula;
  if not found then raise exception 'aula_inexistente'; end if;
  insert into aulas (modulo_id, numero, titulo, ordem, duracao_segundos, capa_path, comentarios_ativos, publicado, bloqueado_geral, texto, liberada_geral, resumo, exercicio, rotulo, tipo, arquivo_path, botao_ebook, botao_ebook_cor)
  values (v_aula.modulo_id, null, v_aula.titulo || ' (cópia)', 0, v_aula.duracao_segundos, v_aula.capa_path, v_aula.comentarios_ativos, v_aula.publicado, v_aula.bloqueado_geral, v_aula.texto, false, v_aula.resumo, v_aula.exercicio, v_aula.rotulo, v_aula.tipo, v_aula.arquivo_path, v_aula.botao_ebook, v_aula.botao_ebook_cor)
  returning id into v_nova;
  insert into aula_midia (aula_id, video_provider, video_ref) select v_nova, video_provider, video_ref from aula_midia where aula_id = p_aula;
  perform copiar_conteudos_da_aula(p_aula, v_nova, (select m.produto_id from modulos m where m.id = v_aula.modulo_id));
  return v_nova;
end $function$;

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
  if not (pode('cur_editar')) then raise exception 'Acesso bloqueado.'; end if;
  select * into v_mod from modulos where id = p_modulo;
  if not found then raise exception 'modulo_inexistente'; end if;
  insert into modulos (numero, titulo, intro, capa_path, cor_destaque, ordem, publicado, bloqueado_geral, titulo_na_arte, produto_id, capa_horizontal_path, rotulo, rotulo_aula)
  values (null, v_mod.titulo || ' (cópia)', v_mod.intro, v_mod.capa_path, v_mod.cor_destaque,
          (select coalesce(max(ordem), 0) + 1 from modulos where produto_id = v_mod.produto_id),
          v_mod.publicado, v_mod.bloqueado_geral, v_mod.titulo_na_arte, v_mod.produto_id, v_mod.capa_horizontal_path, v_mod.rotulo, v_mod.rotulo_aula)
  returning id into v_novo;
  for v_aula in select * from aulas where modulo_id = p_modulo order by ordem loop
    insert into aulas (modulo_id, numero, titulo, ordem, duracao_segundos, capa_path, comentarios_ativos, publicado, bloqueado_geral, texto, liberada_geral, resumo, exercicio, rotulo, tipo, arquivo_path, botao_ebook, botao_ebook_cor)
    values (v_novo, v_aula.numero, v_aula.titulo, v_aula.ordem, v_aula.duracao_segundos, v_aula.capa_path, v_aula.comentarios_ativos, v_aula.publicado, v_aula.bloqueado_geral, v_aula.texto, false, v_aula.resumo, v_aula.exercicio, v_aula.rotulo, v_aula.tipo, v_aula.arquivo_path, v_aula.botao_ebook, v_aula.botao_ebook_cor)
    returning id into v_nova_aula;
    insert into aula_midia (aula_id, video_provider, video_ref) select v_nova_aula, video_provider, video_ref from aula_midia where aula_id = v_aula.id;
    perform copiar_conteudos_da_aula(v_aula.id, v_nova_aula, v_mod.produto_id);
  end loop;
  return v_novo;
end;
$function$;

CREATE OR REPLACE FUNCTION public.duplicar_produto(p_produto uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_novo uuid;
  v_mod record;
  v_novo_mod uuid;
  v_aula record;
  v_nova_aula uuid;
begin
  if not (pode('cur_editar')) then raise exception 'Acesso bloqueado.'; end if;
  insert into produtos (categoria_id, titulo, descricao, capa_path, ordem, publicado, bloqueado_geral, fundacao, aviso_material, inicio, rotulo_inicio, nome_curto)
  select categoria_id, titulo || ' (cópia)', descricao, capa_path, (select coalesce(max(ordem), 0) + 1 from produtos), false, bloqueado_geral, fundacao, aviso_material, inicio, rotulo_inicio, nome_curto
  from produtos where id = p_produto
  returning id into v_novo;
  if v_novo is null then raise exception 'produto_inexistente'; end if;

  for v_mod in select * from modulos where produto_id = p_produto order by ordem loop
    insert into modulos (numero, titulo, intro, capa_path, cor_destaque, ordem, publicado, bloqueado_geral, titulo_na_arte, produto_id, capa_horizontal_path, rotulo, rotulo_aula)
    values (v_mod.numero, v_mod.titulo, v_mod.intro, v_mod.capa_path, v_mod.cor_destaque, v_mod.ordem, v_mod.publicado, v_mod.bloqueado_geral, v_mod.titulo_na_arte, v_novo, v_mod.capa_horizontal_path, v_mod.rotulo, v_mod.rotulo_aula)
    returning id into v_novo_mod;
    for v_aula in select * from aulas where modulo_id = v_mod.id order by ordem loop
      insert into aulas (modulo_id, numero, titulo, ordem, duracao_segundos, capa_path, comentarios_ativos, publicado, bloqueado_geral, texto, liberada_geral, resumo, exercicio, rotulo, tipo, arquivo_path, botao_ebook, botao_ebook_cor)
      values (v_novo_mod, v_aula.numero, v_aula.titulo, v_aula.ordem, v_aula.duracao_segundos, v_aula.capa_path, v_aula.comentarios_ativos, v_aula.publicado, v_aula.bloqueado_geral, v_aula.texto, false, v_aula.resumo, v_aula.exercicio, v_aula.rotulo, v_aula.tipo, v_aula.arquivo_path, v_aula.botao_ebook, v_aula.botao_ebook_cor)
      returning id into v_nova_aula;
      insert into aula_midia (aula_id, video_provider, video_ref) select v_nova_aula, video_provider, video_ref from aula_midia where aula_id = v_aula.id;
      perform copiar_conteudos_da_aula(v_aula.id, v_nova_aula, v_novo);
    end loop;
    insert into conteudos (produto_id, modulo_id, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado)
    select v_novo, v_novo_mod, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado from conteudos where modulo_id = v_mod.id and aula_id is null;
  end loop;
  insert into conteudos (produto_id, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado)
  select v_novo, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado from conteudos where produto_id = p_produto and modulo_id is null and aula_id is null and presente_id is null;
  return v_novo;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ordenar_aulas(p_modulo uuid, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_nums smallint[];
begin
  if not (pode('cur_editar')) then raise exception 'Acesso bloqueado.'; end if;
  if exists (
    select 1 from unnest(p_ids) as x(id)
    where not exists (select 1 from aulas a where a.id = x.id and a.modulo_id = p_modulo)
  ) then
    raise exception 'aula_de_outro_modulo';
  end if;
  select array_agg(numero order by numero) into v_nums from aulas where id = any(p_ids);
  update aulas t set numero = v_nums[x.i], ordem = x.i - 1
    from unnest(p_ids) with ordinality as x(id, i) where t.id = x.id;
end $function$;

CREATE OR REPLACE FUNCTION public.copiar_conteudos_da_aula(p_de uuid, p_para uuid, p_produto uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v record; v_novo uuid; v_mapa jsonb := '{}'::jsonb;
begin
  if not (pode('cur_editar')) then raise exception 'Acesso bloqueado.'; end if;
  for v in select * from conteudos where aula_id = p_de order by (pai_id is not null), ordem loop
    insert into conteudos (produto_id, aula_id, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado, opcao, cor, capa_path, titulo_tela, instrucoes, pai_id)
    values (p_produto, p_para, v.tipo, v.titulo, v.texto, v.arquivo_path, v.url, v.video_provider, v.video_ref, v.ordem, v.publicado, v.opcao, v.cor, v.capa_path, v.titulo_tela, v.instrucoes,
            case when v.pai_id is null then null else (v_mapa ->> v.pai_id::text)::uuid end)
    returning id into v_novo;
    v_mapa := v_mapa || jsonb_build_object(v.id::text, v_novo);
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.descartar_rascunho(p_produto uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (pode('cur_editar')) then raise exception 'Acesso bloqueado.'; end if;

  if coalesce((select publicado from produtos where id = p_produto), false) then
    raise exception 'produto_publicado';
  end if;

  if exists (
    select 1 from acessos a
    where a.produto_id = p_produto
       or a.modulo_id in (select id from modulos where produto_id = p_produto)
       or a.aula_id in (
            select au.id from aulas au
            join modulos m on m.id = au.modulo_id
            where m.produto_id = p_produto
          )
  ) or exists (
    select 1 from progresso p
    join aulas au on au.id = p.aula_id
    join modulos m on m.id = au.modulo_id
    where m.produto_id = p_produto
  ) or exists (
    select 1 from comentarios c
    join aulas au on au.id = c.aula_id
    join modulos m on m.id = au.modulo_id
    where m.produto_id = p_produto
  ) then
    raise exception 'produto_em_uso';
  end if;

  delete from conteudos where produto_id = p_produto;
  delete from aulas
    where modulo_id in (select id from modulos where produto_id = p_produto);
  delete from modulos where produto_id = p_produto;
  delete from presentes where produto_id = p_produto;
  delete from produtos where id = p_produto;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remover_produto(p_produto uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (pode('cur_excluir')) then raise exception 'Acesso bloqueado.'; end if;
  delete from modulos where produto_id = p_produto;
  delete from produtos where id = p_produto;
  if not found then raise exception 'produto_inexistente'; end if;
  update configuracoes set produto_jornada = null where produto_jornada = p_produto;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ordenar_lista(p_tabela text, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_nums smallint[];
begin
  if not (case when p_tabela in ('categorias', 'categorias_aba') then pode('cat_editar') else pode('cur_editar') end) then raise exception 'Acesso bloqueado.'; end if;
  if p_tabela not in ('categorias', 'produtos', 'modulos', 'conteudos', 'categorias_aba') then
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
end $function$;

CREATE OR REPLACE FUNCTION public.restaurar_ficha_aluna(p_aluna uuid, p_nome text, p_login text, p_codigo text, p_entrada date, p_acesso_ate timestamp with time zone, p_celular text, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (pode('al_editar')) then raise exception 'Acesso bloqueado.'; end if;
  if not eh_aluna(p_aluna) then raise exception 'alvo_nao_e_aluna'; end if;
  if exists (select 1 from profiles where login = lower(p_login) and id <> p_aluna) then
    raise exception 'login_em_uso';
  end if;

  update profiles
     set nome = p_nome, login = lower(p_login), entrada = p_entrada, acesso_ate = p_acesso_ate,
         celular = nullif(p_celular, ''), email = nullif(p_email, '')
   where id = p_aluna;

  update credenciais
     set codigo = p_codigo, codigo_definido_em = now(), tentativas_erradas = 0, travada_ate = null
   where aluna_id = p_aluna and codigo <> p_codigo;
end;
$function$;

CREATE OR REPLACE FUNCTION public.salvar_foto_aluna(p_aluna uuid, p_foto text, p_original text, p_ajuste jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (p_aluna = auth.uid() or pode('al_editar')) then raise exception 'Acesso bloqueado.'; end if;
  if p_foto is null then
    delete from fotos_aluna where aluna_id = p_aluna;
    return;
  end if;
  if p_foto !~ '^data:image/(jpeg|png|webp);base64,' or length(p_foto) > 300000 then raise exception 'foto_invalida'; end if;
  if p_original is not null and (p_original !~ '^data:image/(jpeg|png|webp);base64,' or length(p_original) > 3000000) then
    raise exception 'foto_invalida';
  end if;
  insert into fotos_aluna (aluna_id, foto, original, ajuste, atualizada_em, atualizada_por)
  values (p_aluna, p_foto, p_original, p_ajuste, now(), auth.uid())
  on conflict (aluna_id) do update
    set foto = excluded.foto, original = excluded.original, ajuste = excluded.ajuste,
        atualizada_em = now(), atualizada_por = auth.uid();
end;
$function$;

CREATE OR REPLACE FUNCTION public.salvar_ficha_aluna(p_aluna uuid, p_nome text, p_login text, p_codigo text, p_entrada date, p_validade date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nome  text := btrim(coalesce(p_nome, ''));
  v_login text := regexp_replace(lower(btrim(coalesce(p_login, ''))), '\s+', ' ', 'g');
begin
  if not (pode('al_editar') or pode('al_codigo') or pode('al_validade')) then raise exception 'Acesso bloqueado.'; end if;
  if not eh_admin() then
    if exists (select 1 from profiles where id = p_aluna and (nome is distinct from btrim(coalesce(p_nome, '')) or login is distinct from regexp_replace(lower(btrim(coalesce(p_login, ''))), '\s+', ' ', 'g'))) and not pode('al_editar') then raise exception 'Acesso bloqueado.'; end if;
    if exists (select 1 from credenciais where aluna_id = p_aluna and codigo is distinct from p_codigo) and not pode('al_codigo') then raise exception 'Acesso bloqueado.'; end if;
    if exists (select 1 from profiles where id = p_aluna and (entrada is distinct from p_entrada or (acesso_ate at time zone 'America/Sao_Paulo')::date is distinct from p_validade)) and not pode('al_validade') then raise exception 'Acesso bloqueado.'; end if;
  end if;
  if not eh_aluna(p_aluna) then raise exception 'alvo_nao_e_aluna'; end if;
  if length(v_nome) not between 2 and 80 then raise exception 'nome_invalido'; end if;
  if length(v_login) not between 2 and 40
     or v_login !~ '^[a-z0-9._-]+( [a-z0-9._-]+)*$' then
    raise exception 'login_invalido';
  end if;
  if coalesce(p_codigo, '') !~ '^[0-9]{4}$' then raise exception 'codigo_invalido'; end if;
  if p_entrada is null or p_validade is null then raise exception 'data_vazia'; end if;
  if p_validade < p_entrada then raise exception 'validade_antes_da_entrada'; end if;
  if exists (select 1 from profiles where login = v_login and id <> p_aluna) then
    raise exception 'login_em_uso';
  end if;

  update profiles
     set nome = v_nome, login = v_login, entrada = p_entrada,
         acesso_ate = ((p_validade + 1)::timestamp at time zone 'America/Sao_Paulo') - interval '1 second'
   where id = p_aluna;

  update credenciais
     set codigo = p_codigo,
         codigo_definido_em = now(),
         tentativas_erradas = 0,
         travada_ate = null
   where aluna_id = p_aluna and codigo <> p_codigo;
end;
$function$;

CREATE OR REPLACE FUNCTION public.salvar_liberacao(p_aluna uuid, p_produtos uuid[], p_modulos uuid[], p_aulas uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_produtos uuid[] := coalesce(p_produtos, '{}');
  v_modulos  uuid[];
  v_aulas    uuid[];
  v_n        integer;
begin
  if not (pode('al_liberar') or pode('al_tirar')) then raise exception 'Acesso bloqueado.'; end if;
  if not eh_aluna(p_aluna) then raise exception 'alvo_nao_e_aluna'; end if;

  select coalesce(array_agg(m.id), '{}') into v_modulos
  from modulos m
  where m.id = any(coalesce(p_modulos, '{}'))
    and (m.produto_id is null or not m.produto_id = any(v_produtos));

  select coalesce(array_agg(a.id), '{}') into v_aulas
  from aulas a
  join modulos m on m.id = a.modulo_id
  where a.id = any(coalesce(p_aulas, '{}'))
    and not m.id = any(v_modulos)
    and (m.produto_id is null or not m.produto_id = any(v_produtos));

  delete from acessos
   where aluna_id = p_aluna and escopo = 'produto' and not produto_id = any(v_produtos);
  get diagnostics v_n = row_count; if v_n > 0 and not pode('al_tirar') then raise exception 'Acesso bloqueado.'; end if;
  insert into acessos (aluna_id, escopo, produto_id, concedido_por)
  select p_aluna, 'produto', p.id, auth.uid()
  from produtos p where p.id = any(v_produtos)
  on conflict (aluna_id, produto_id) where escopo = 'produto' do nothing;
  get diagnostics v_n = row_count; if v_n > 0 and not pode('al_liberar') then raise exception 'Acesso bloqueado.'; end if;

  delete from acessos
   where aluna_id = p_aluna and escopo = 'modulo' and not modulo_id = any(v_modulos);
  get diagnostics v_n = row_count; if v_n > 0 and not pode('al_tirar') then raise exception 'Acesso bloqueado.'; end if;
  insert into acessos (aluna_id, escopo, modulo_id, concedido_por)
  select p_aluna, 'modulo', m.id, auth.uid()
  from modulos m where m.id = any(v_modulos)
  on conflict (aluna_id, modulo_id) where escopo = 'modulo' do nothing;
  get diagnostics v_n = row_count; if v_n > 0 and not pode('al_liberar') then raise exception 'Acesso bloqueado.'; end if;

  -- Aula avulsa: fica a marcada, e a de data marcada que ainda tem algo
  -- acima dela liberado.
  delete from acessos ac
   where ac.aluna_id = p_aluna and ac.escopo = 'aula'
     and not ac.aula_id = any(v_aulas)
     and not (
       ac.abre_em is not null
       and exists (
         select 1 from aulas a join modulos m on m.id = a.modulo_id
         where a.id = ac.aula_id
           and (m.id = any(v_modulos) or m.produto_id = any(v_produtos))
       )
     );
  get diagnostics v_n = row_count; if v_n > 0 and not pode('al_tirar') then raise exception 'Acesso bloqueado.'; end if;
  insert into acessos (aluna_id, escopo, aula_id, concedido_por)
  select p_aluna, 'aula', a.id, auth.uid()
  from aulas a where a.id = any(v_aulas)
  on conflict (aluna_id, aula_id) where escopo = 'aula' do nothing;
  get diagnostics v_n = row_count; if v_n > 0 and not pode('al_liberar') then raise exception 'Acesso bloqueado.'; end if;

  return (select count(*)::integer from aberturas_da_aluna(p_aluna));
end;
$function$;

CREATE OR REPLACE FUNCTION public.moderar_comentario(p_comentario uuid, p_status status_comentario)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from comentarios where id = p_comentario) then raise exception 'comentario_nao_encontrado'; end if;
  if not pode(case when (select status from comentarios where id = p_comentario) = 'removido' then 'com_restaurar' when p_status = 'publicado' then 'com_aprovar' else 'com_ocultar' end) then raise exception 'Acesso bloqueado.'; end if;
  update comentarios
     set status = p_status, moderado_por = auth.uid(), moderado_em = now()
   where id = p_comentario;
  if not found then raise exception 'comentario_nao_encontrado'; end if;
  -- Aprovou o comentário: as respostas da equipe que esperavam a aprovação aparecem junto.
  if p_status = 'publicado' then
    update comentarios c set status = 'publicado'
      from profiles p
     where c.resposta_a = p_comentario and c.status = 'pendente'
       and p.id = c.autora_id and p.papel in ('dono', 'admin', 'suporte');
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.responder_comentario(p_comentario uuid, p_texto text, p_publicar boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pai comentarios%rowtype;
  v_id uuid;
  v_texto text := btrim(coalesce(p_texto, ''));
  v_status status_comentario;
begin
  if not pode('com_responder') then raise exception 'Acesso bloqueado.'; end if;
  if length(v_texto) not between 1 and 600 then raise exception 'texto_invalido'; end if;
  select * into v_pai from comentarios where id = p_comentario and resposta_a is null;
  if not found then raise exception 'comentario_nao_encontrado'; end if;
  if p_publicar and v_pai.status = 'pendente' and pode('com_aprovar') then
    update comentarios set status = 'publicado', moderado_por = auth.uid(), moderado_em = now() where id = p_comentario;
    v_pai.status := 'publicado';
  end if;
  -- A resposta só fica visível se o comentário estiver publicado.
  v_status := case when v_pai.status = 'publicado' then 'publicado' else 'pendente' end;
  select c.id into v_id
  from comentarios c
  join profiles p on p.id = c.autora_id
  where c.resposta_a = p_comentario
    and p.papel in ('dono', 'admin', 'suporte')
    and c.status <> 'removido'
  order by c.criado_em
  limit 1;
  if v_id is null then
    insert into comentarios (aula_id, autora_id, texto, posicao_segundos, status, resposta_a, nome_visivel)
    values (v_pai.aula_id, auth.uid(), v_texto, v_pai.posicao_segundos, v_status, p_comentario, true)
    returning id into v_id;
    -- O gatilho publica o que a equipe escreve; aqui a resposta espera a aprovação.
    if v_status = 'pendente' then update comentarios set status = 'pendente' where id = v_id; end if;
  else
    update comentarios set texto = v_texto, status = case when status = 'oculto' then status else v_status end where id = v_id;
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mudar_codigo(p_id uuid, p_codigo text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (p_id = auth.uid() or pode_gerir(p_id) or (pode('al_codigo') and eh_aluna(p_id))) then
    return false;
  end if;
  if eh_dono() and not dono_pode('codigo') and not eh_aluna(p_id) then return false; end if;
  if p_codigo !~ '^[0-9]{4,6}$' then return false; end if;
  update credenciais
     set codigo = p_codigo, codigo_definido_em = now(), tentativas_erradas = 0, travada_ate = null
   where aluna_id = p_id;
  return found;
end;
$function$;

alter table public.profiles drop constraint if exists permissoes_conhecidas;
alter table public.profiles add constraint permissoes_conhecidas check (permissoes <@ permissoes_validas());
