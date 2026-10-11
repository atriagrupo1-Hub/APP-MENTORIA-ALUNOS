-- =====================================================================
-- 0042 — Celular obrigatório na ficha da aluna
--
-- É pelo celular que a aluna é acompanhada. A ficha só salva com DDD e
-- os nove números (onze dígitos). A versão de seis argumentos, sem
-- celular, deixa de ser chamável pelo navegador: continua existindo só
-- para a de oito usar por dentro.
-- =====================================================================

create or replace function salvar_ficha_aluna(
  p_aluna uuid, p_nome text, p_login text, p_codigo text,
  p_entrada date, p_validade date, p_celular text, p_email text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_celular text := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
  v_email   text := lower(btrim(coalesce(p_email, '')));
begin
  if v_celular !~ '^[0-9]{11}$' then
    raise exception 'celular_invalido';
  end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalido';
  end if;

  perform salvar_ficha_aluna(p_aluna, p_nome, p_login, p_codigo, p_entrada, p_validade);

  update profiles
     set celular = v_celular, email = nullif(v_email, '')
   where id = p_aluna;
end;
$$;

revoke execute on function salvar_ficha_aluna(uuid, text, text, text, date, date) from public, anon, authenticated;
