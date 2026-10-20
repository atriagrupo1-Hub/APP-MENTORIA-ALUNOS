-- =====================================================================
-- 0045 — Login "Angela F." e celular de fora do Brasil
--
-- · O login passa a ser o primeiro nome e a inicial do sobrenome,
--   separados por espaço: "angela f.". Continua guardado em minúsculas,
--   e a entrada já compara sem diferença de maiúscula.
-- · O celular aceita número de fora do Brasil: "+", o código do país e
--   o número, de 8 a 15 dígitos, guardado com o "+". O do Brasil segue
--   com DDD e nove números.
-- =====================================================================

create or replace function salvar_ficha_aluna(
  p_aluna uuid, p_nome text, p_login text, p_codigo text,
  p_entrada date, p_validade date
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_nome  text := btrim(coalesce(p_nome, ''));
  v_login text := regexp_replace(lower(btrim(coalesce(p_login, ''))), '\s+', ' ', 'g');
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
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
$$;

revoke execute on function salvar_ficha_aluna(uuid, text, text, text, date, date) from public, anon, authenticated;

create or replace function salvar_ficha_aluna(
  p_aluna uuid, p_nome text, p_login text, p_codigo text,
  p_entrada date, p_validade date, p_celular text, p_email text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_bruto   text := btrim(coalesce(p_celular, ''));
  v_celular text := case when left(v_bruto, 1) = '+' then '+' else '' end
                    || regexp_replace(v_bruto, '\D', '', 'g');
  v_email   text := lower(btrim(coalesce(p_email, '')));
begin
  if v_celular !~ '^[0-9]{11}$' and v_celular !~ '^\+[0-9]{8,15}$' then
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

revoke execute on function salvar_ficha_aluna(uuid, text, text, text, date, date, text, text) from public, anon;
grant execute on function salvar_ficha_aluna(uuid, text, text, text, date, date, text, text) to authenticated;
