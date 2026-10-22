-- Três estados no painel para curso, módulo e aula, com as colunas que já
-- existem: Ativo = publicado e sem bloqueio; Bloqueado = publicado e
-- bloqueado_geral (aparece, sem acesso); Desativado = não publicado (as
-- políticas de leitura já escondem da aluna).
-- Na sequência das aulas, uma aula bloqueada pela equipe não prende a
-- seguinte (como a desativada, que já era pulada).
CREATE OR REPLACE FUNCTION public.aula_anterior_concluida(p_aluna uuid, p_aula uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select exists (
      select 1 from progresso p
      where p.aluna_id = p_aluna and p.aula_id = ant.id and p.concluida_em is not null
    )
    from aulas a
    join aulas ant on ant.modulo_id = a.modulo_id and ant.publicado and not ant.bloqueado_geral and ant.id <> a.id
                  and (ant.ordem, ant.numero) < (a.ordem, a.numero)
    where a.id = p_aula
    order by ant.ordem desc, ant.numero desc
    limit 1
  ), true);
$function$;
