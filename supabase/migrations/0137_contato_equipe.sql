-- Equipe: celular, e-mail (opcionais) e observação do membro, salvos no perfil.
alter table public.profiles add column if not exists observacao text;

create or replace function public.salvar_contato_colaborador(p_id uuid, p_celular text, p_email text, p_obs text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_cel text := nullif(regexp_replace(coalesce(p_celular, ''), '\D', '', 'g'), '');
        v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
        v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
begin
  if not exists (select 1 from profiles where id = p_id and papel in ('dono', 'admin', 'suporte')) then
    raise exception 'colaborador_nao_encontrado';
  end if;
  if not (p_id = auth.uid() or pode_gerir(p_id)) then raise exception 'sem_permissao'; end if;
  if v_cel is not null and length(v_cel) not between 10 and 13 then raise exception 'celular_invalido'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
  if v_obs is not null and length(v_obs) > 300 then raise exception 'observacao_longa'; end if;
  update profiles set celular = v_cel, email = v_email, observacao = v_obs where id = p_id;
end $$;

create or replace function public.contatos_equipe()
returns table(id uuid, celular text, email text, observacao text)
language sql stable security definer set search_path to 'public' as $$
  select p.id, p.celular, p.email, p.observacao from profiles p
  where p.papel in ('dono', 'admin', 'suporte') and eh_equipe();
$$;

revoke all on function public.salvar_contato_colaborador(uuid, text, text, text) from public, anon;
grant execute on function public.salvar_contato_colaborador(uuid, text, text, text) to authenticated;
revoke all on function public.contatos_equipe() from public, anon;
grant execute on function public.contatos_equipe() to authenticated;
