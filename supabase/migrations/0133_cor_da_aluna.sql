-- A 0081 trocou salvar_minha_cor para a equipe e as alunas perderam a escolha
-- da cor no app ("Não conseguimos salvar a cor"). Agora vale para as duas:
-- equipe grava cor_perfil (uma ou duas cores); aluna grava cor_nome (uma cor).
create or replace function public.salvar_minha_cor(p_cor text) returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'sem_permissao'; end if;
  if eh_equipe() then
    if p_cor is not null and lower(p_cor) !~ '^#[0-9a-f]{6}(,#[0-9a-f]{6})?$' then raise exception 'cor_invalida'; end if;
    update profiles set cor_perfil = lower(p_cor) where id = auth.uid();
  else
    if p_cor is not null and lower(p_cor) !~ '^#[0-9a-f]{6}$' then raise exception 'cor_invalida'; end if;
    update profiles set cor_nome = lower(p_cor) where id = auth.uid() and papel = 'aluna';
  end if;
end;
$$;
