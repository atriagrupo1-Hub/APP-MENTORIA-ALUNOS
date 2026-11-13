-- Aula de vídeo conclui faltando até 3 minutos para o fim (metade da aula, se ela tiver menos de 6 min).
-- O que já foi concluído nunca volta a travar (concluida_em não é apagado).
create or replace function public.marcar_concluida(p_aula uuid, p_concluida boolean)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_dur integer;
  v_pos integer;
begin
  if not pode_ver_aula(p_aula) then return; end if;
  if p_concluida and not exists (select 1 from aulas where id = p_aula and tipo = 'pdf') then
    select duracao_segundos into v_dur from aulas where id = p_aula;
    select posicao_segundos into v_pos from progresso where aluna_id = auth.uid() and aula_id = p_aula;
    if v_dur is null or v_pos is null or v_pos < v_dur - least(180, v_dur / 2) then return; end if;
  end if;
  insert into progresso (aluna_id, aula_id, concluida_em, atualizada_em)
  values (auth.uid(), p_aula, case when p_concluida then now() end, now())
  on conflict (aluna_id, aula_id) do update
    set concluida_em = case when p_concluida then coalesce(progresso.concluida_em, now()) end,
        atualizada_em = now();
end;
$function$;

-- Duração lida do próprio vídeo: grava quando não há, e corrige quando a cadastrada está errada (diferença > 5% e > 10 s).
create or replace function public.registrar_duracao(p_aula uuid, p_segundos integer)
 returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if p_segundos is null or p_segundos < 30 or p_segundos > 36000 then return; end if;
  if not pode_ver_aula(p_aula) then return; end if;
  update aulas set duracao_segundos = p_segundos
   where id = p_aula
     and (duracao_segundos is null
          or abs(duracao_segundos - p_segundos) > greatest(10, duracao_segundos * 0.05));
end;
$function$;

-- Correção: Aula 2 de "DESCOBRINDO O VERDADEIRO BLOQUEIO" tinha 1380 s cadastrados; o vídeo termina em 976 s.
update aulas a set duracao_segundos = 976
  from modulos m
 where m.id = a.modulo_id and m.titulo = 'DESCOBRINDO O VERDADEIRO BLOQUEIO' and a.numero = 2 and a.duracao_segundos = 1380;

-- Quem já chegou à reta final (regra nova) de qualquer aula de vídeo fica com a aula concluída.
update progresso p set concluida_em = now()
  from aulas a
 where a.id = p.aula_id and p.concluida_em is null and a.tipo is distinct from 'pdf'
   and a.duracao_segundos is not null and p.posicao_segundos >= a.duracao_segundos - least(180, a.duracao_segundos / 2);
