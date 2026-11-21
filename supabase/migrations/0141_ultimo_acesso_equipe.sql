-- 0141 — Último acesso da equipe também com e-mail e senha (0138).
-- Antes só o login por código (verificar_codigo) marcava o último acesso; agora o sinal
-- de vida do painel (a cada minuto, com a tela aberta) também marca, no máximo a cada 5 min.

create or replace function public.sinal_painel(p_sessao uuid default null::uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  update profiles set ultimo_acesso_em = now(), primeiro_acesso_em = coalesce(primeiro_acesso_em, now())
   where id = auth.uid() and (ultimo_acesso_em is null or ultimo_acesso_em < now() - interval '5 minutes');
  if p_sessao is not null then
    update sessoes_painel set ultimo_sinal = now()
     where id = p_sessao and perfil_id = auth.uid() and ultimo_sinal > now() - interval '3 minutes'
     returning id into v_id;
    if v_id is not null then return v_id; end if;
  end if;
  insert into sessoes_painel (perfil_id) values (auth.uid()) returning id into v_id;
  return v_id;
end;
$function$;
