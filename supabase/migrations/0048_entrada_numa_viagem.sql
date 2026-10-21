-- =====================================================================
-- 0048 — Entrar numa viagem só ao banco
--
-- A função `entrar` fazia quatro idas ao banco antes de emitir a sessão:
-- limite por IP, conferência do código, o e-mail da conta no Auth e a
-- limpeza do IP. Cada ida custa a distância até o banco. Aqui as quatro
-- viram uma, com as mesmas regras e na mesma ordem: o limite por IP vem
-- antes da conferência, e o código continua sendo conferido só pelo
-- `verificar_codigo()`.
--
-- Só a chave de serviço (a Edge Function) executa.
-- =====================================================================

create or replace function conferir_entrada(p_ip text, p_login text, p_codigo text)
returns table(aluna_id uuid, email text, erro text)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_id uuid;
begin
  if not registrar_tentativa_ip(p_ip) then
    return query select null::uuid, null::text, 'muitas_tentativas'::text; return;
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
    return query select null::uuid, null::text, 'acesso_invalido'::text; return;
  end if;

  perform limpar_tentativas_ip(p_ip);
  return query select v_id, (select u.email::text from auth.users u where u.id = v_id), null::text;
end;
$$;

revoke execute on function conferir_entrada(text, text, text) from public, anon, authenticated;
grant execute on function conferir_entrada(text, text, text) to service_role;
