-- Ninguém da equipe muda o próprio nome ou login (só o dono principal).
create or replace function public.editar_colaborador(p_id uuid, p_nome text, p_login text, p_papel papel_usuario, p_codigo text)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_nome  text := btrim(coalesce(p_nome, ''));
  v_login text := regexp_replace(lower(btrim(coalesce(p_login, ''))), '\s+', ' ', 'g');
  v_atual profiles%rowtype;
  v_gere  boolean := pode_gerir(p_id);
begin
  select * into v_atual from profiles where id = p_id and papel in ('dono', 'admin', 'suporte');
  if not found then raise exception 'colaborador_nao_encontrado'; end if;
  if not (p_id = auth.uid() or v_gere) then raise exception 'sem_permissao'; end if;

  if length(v_nome) not between 2 and 80 then raise exception 'nome_invalido'; end if;
  if length(v_login) not between 2 and 40
     or v_login !~ '^[a-z0-9._-]+( [a-z0-9._-]+)*$' then
    raise exception 'login_invalido';
  end if;
  if exists (select 1 from profiles where login = v_login and id <> p_id) then
    raise exception 'login_em_uso';
  end if;
  if (v_nome <> v_atual.nome or v_login <> v_atual.login) then
    if p_id = auth.uid() and not eh_dono_principal() then raise exception 'sem_permissao'; end if;
    if eh_dono() and not dono_pode('nome') then raise exception 'sem_permissao'; end if;
  end if;

  if p_papel is distinct from v_atual.papel then
    if not v_gere then raise exception 'sem_permissao'; end if;
    if p_papel not in ('dono', 'admin', 'suporte') then raise exception 'papel_invalido'; end if;
    if (p_papel = 'dono' or v_atual.papel = 'dono') and not eh_dono_principal() then raise exception 'sem_permissao'; end if;
    if p_papel = 'admin' and not eh_dono() then raise exception 'sem_permissao'; end if;
  end if;

  if coalesce(p_codigo, '') <> '' then
    if p_codigo !~ '^[0-9]{4,6}$' then raise exception 'codigo_invalido'; end if;
    if eh_dono() and not dono_pode('codigo') and exists (select 1 from credenciais where aluna_id = p_id and codigo <> p_codigo) then
      raise exception 'sem_permissao';
    end if;
    update credenciais
       set codigo = p_codigo, codigo_definido_em = now(),
           tentativas_erradas = 0, travada_ate = null
     where aluna_id = p_id and codigo <> p_codigo;
  end if;

  update profiles
     set nome = v_nome, login = v_login, papel = coalesce(p_papel, v_atual.papel)
   where id = p_id;
end;
$function$;
