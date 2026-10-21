-- =====================================================================
-- 0057 — Entrada: dizer onde a aluna errou
--
-- A equipe pediu que a tela aponte o campo errado: "nome não encontrado"
-- ou "código incorreto". `conferir_entrada` passa a devolver
-- 'nome_invalido' ou 'codigo_invalido' (antes, os dois viravam
-- 'acesso_invalido'). O limite por IP e a trava da conta depois de 5
-- erros continuam valendo, na mesma ordem.
--
-- Maiúsculas e minúsculas não importam no nome (já era assim) nem no
-- código; espaços nas pontas são ignorados.
-- =====================================================================

create or replace function verificar_codigo(p_login text, p_codigo text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_perfil profiles%rowtype;
  v_cred   credenciais%rowtype;
begin
  select * into v_perfil from profiles where login = lower(trim(p_login));
  if not found then
    return null;
  end if;

  select * into v_cred from credenciais where aluna_id = v_perfil.id;
  if not found then
    return null;
  end if;

  if v_cred.travada_ate is not null and v_cred.travada_ate > now() then
    raise exception 'conta_travada';
  end if;

  if v_cred.travada_ate is not null and v_cred.travada_ate <= now() then
    update credenciais
       set tentativas_erradas = 0, travada_ate = null
     where aluna_id = v_perfil.id;
    v_cred.tentativas_erradas := 0;
  end if;

  if v_perfil.status = 'bloqueada' then
    raise exception 'conta_bloqueada';
  end if;

  if lower(trim(v_cred.codigo)) <> lower(trim(coalesce(p_codigo, ''))) then
    update credenciais
       set tentativas_erradas = tentativas_erradas + 1,
           travada_ate = case when tentativas_erradas + 1 >= 5
                              then now() + interval '15 minutes' end
     where aluna_id = v_perfil.id;
    return null;
  end if;

  update credenciais
     set tentativas_erradas = 0, travada_ate = null
   where aluna_id = v_perfil.id;

  update profiles
     set ultimo_acesso_em = now(),
         primeiro_acesso_em = coalesce(primeiro_acesso_em, now())
   where id = v_perfil.id;

  return v_perfil.id;
end;
$$;

create or replace function conferir_entrada(p_ip text, p_login text, p_codigo text)
returns table(aluna_id uuid, email text, erro text)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_id uuid;
begin
  if not registrar_tentativa_ip(p_ip) then
    return query select null::uuid, null::text, 'muitas_tentativas'::text; return;
  end if;

  if not exists (select 1 from profiles p where p.login = lower(trim(p_login))) then
    return query select null::uuid, null::text, 'nome_invalido'::text; return;
  end if;

  begin
    v_id := verificar_codigo(p_login, p_codigo);
  exception when others then
    if sqlerrm like '%conta_travada%' then
      return query select null::uuid, null::text, 'conta_travada'::text; return;
    elsif sqlerrm like '%conta_bloqueada%' then
      return query select null::uuid, null::text, 'conta_bloqueada'::text; return;
    end if;
    raise;
  end;

  if v_id is null then
    return query select null::uuid, null::text, 'codigo_invalido'::text; return;
  end if;

  perform limpar_tentativas_ip(p_ip);
  return query select v_id, (select u.email::text from auth.users u where u.id = v_id), null::text;
end;
$$;

revoke execute on function conferir_entrada(text, text, text) from public, anon, authenticated;
grant execute on function conferir_entrada(text, text, text) to service_role;
