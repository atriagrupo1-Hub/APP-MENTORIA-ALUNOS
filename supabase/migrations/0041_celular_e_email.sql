-- =====================================================================
-- 0041 — Celular e e-mail na ficha da aluna
--
-- O celular já existia em `profiles`, mas o painel novo não tinha onde
-- escrever. O e-mail é novo: só contato, nunca usado para entrar — o
-- acesso continua sendo login e código.
--
-- A `salvar_ficha_aluna` de seis argumentos fica, para o painel que
-- ainda estiver aberto no navegador de alguém não quebrar até recarregar.
-- =====================================================================

alter table profiles add column if not exists email text;

/**
 * Celular e e-mail das alunas, para a aba Alunas. Fica separada da
 * `alunas_do_painel` para não ter de recriá-la.
 */
create or replace function contatos_das_alunas()
returns table (id uuid, celular text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.celular, p.email
  from profiles p
  where eh_equipe() and p.papel = 'aluna';
$$;

revoke execute on function contatos_das_alunas() from public, anon;
grant execute on function contatos_das_alunas() to authenticated;

/**
 * Salva a ficha com celular e e-mail. Os dois são opcionais: vazio
 * apaga. Celular guarda só os dígitos, com DDD.
 */
create or replace function salvar_ficha_aluna(
  p_aluna uuid, p_nome text, p_login text, p_codigo text,
  p_entrada date, p_validade date, p_celular text, p_email text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_celular text := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
  v_email   text := lower(btrim(coalesce(p_email, '')));
begin
  if v_celular <> '' and length(v_celular) not between 10 and 15 then
    raise exception 'celular_invalido';
  end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalido';
  end if;

  perform salvar_ficha_aluna(p_aluna, p_nome, p_login, p_codigo, p_entrada, p_validade);

  update profiles
     set celular = nullif(v_celular, ''), email = nullif(v_email, '')
   where id = p_aluna;
end;
$$;

revoke execute on function salvar_ficha_aluna(uuid, text, text, text, date, date, text, text) from public, anon;
grant execute on function salvar_ficha_aluna(uuid, text, text, text, date, date, text, text) to authenticated;
