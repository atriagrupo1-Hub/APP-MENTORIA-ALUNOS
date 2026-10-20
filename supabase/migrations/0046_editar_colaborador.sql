-- =====================================================================
-- 0046 — Editar alguém da equipe
--
-- Nome, login, papel e código, de uma vez, pela mesma regra de quem
-- mexe em quem (`pode_gerir`): o dono em todos menos nele; o
-- administrador só no suporte. Cada um edita o próprio nome, login e
-- código, mas não o próprio papel. Só o dono faz alguém administrador.
-- =====================================================================

create or replace function editar_colaborador(
  p_id uuid, p_nome text, p_login text, p_papel papel_usuario, p_codigo text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_nome  text := btrim(coalesce(p_nome, ''));
  v_login text := regexp_replace(lower(btrim(coalesce(p_login, ''))), '\s+', ' ', 'g');
  v_atual papel_usuario;
  v_gere  boolean := pode_gerir(p_id);
begin
  select papel into v_atual from profiles where id = p_id and papel in ('dono', 'admin', 'suporte');
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

  if p_papel is distinct from v_atual then
    if not v_gere then raise exception 'sem_permissao'; end if;
    if p_papel not in ('admin', 'suporte') then raise exception 'papel_invalido'; end if;
    if p_papel = 'admin' and not eh_dono() then raise exception 'sem_permissao'; end if;
  end if;

  if coalesce(p_codigo, '') <> '' then
    if p_codigo !~ '^[0-9]{4,6}$' then raise exception 'codigo_invalido'; end if;
    update credenciais
       set codigo = p_codigo, codigo_definido_em = now(),
           tentativas_erradas = 0, travada_ate = null
     where aluna_id = p_id and codigo <> p_codigo;
  end if;

  update profiles
     set nome = v_nome, login = v_login, papel = coalesce(p_papel, v_atual)
   where id = p_id;
end;
$$;

revoke execute on function editar_colaborador(uuid, text, text, papel_usuario, text) from public, anon;
grant execute on function editar_colaborador(uuid, text, text, papel_usuario, text) to authenticated;
