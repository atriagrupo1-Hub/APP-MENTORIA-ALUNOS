-- =====================================================================
-- 0044 — Desfazer edições no painel
--
-- Remover continua definitivo. Toda outra alteração pode voltar (até as
-- cinco últimas, pelo botão Desfazer do painel). Para isso faltavam:
--
-- · voltar a ficha da aluna exatamente como estava — inclusive de uma
--   aluna antiga, ainda sem celular, que `salvar_ficha_aluna` recusaria;
-- · apagar um contato registrado por engano.
-- =====================================================================

create or replace function restaurar_ficha_aluna(
  p_aluna uuid, p_nome text, p_login text, p_codigo text,
  p_entrada date, p_acesso_ate timestamptz, p_celular text, p_email text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
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
$$;
revoke execute on function restaurar_ficha_aluna(uuid, text, text, text, date, timestamptz, text, text) from public, anon;
grant execute on function restaurar_ficha_aluna(uuid, text, text, text, date, timestamptz, text, text) to authenticated;

grant delete on contatos_aluna to authenticated;
create policy contatos_apaga on contatos_aluna for delete to authenticated using (eh_equipe());
