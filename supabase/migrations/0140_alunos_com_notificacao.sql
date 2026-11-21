-- 0140 — Quais alunos recebem notificação no celular (têm inscrição de push),
-- para a Visão geral e a Central de atenção. Só a equipe vê; devolve só os ids.

create or replace function public.alunos_com_notificacao()
returns setof uuid
language sql
stable security definer
set search_path to ''
as $$
  select distinct i.aluna_id from public.push_inscricoes i where public.eh_equipe();
$$;

revoke execute on function public.alunos_com_notificacao() from anon, public;
grant execute on function public.alunos_com_notificacao() to authenticated;
