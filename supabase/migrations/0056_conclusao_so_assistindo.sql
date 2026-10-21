-- =====================================================================
-- 0056 — A aula só fica concluída quando foi assistida até o fim
--
-- Não existe botão de concluir: o app marca a conclusão sozinho quando o
-- vídeo termina. Aqui o banco confere isso: só aceita a conclusão se a
-- posição salva da aluna chegou ao fim do vídeo (últimos 15 s, ou 5%
-- nos vídeos longos). Sem duração conhecida, não conclui.
-- =====================================================================

create or replace function marcar_concluida(p_aula uuid, p_concluida boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dur integer;
  v_pos integer;
begin
  if not pode_ver_aula(p_aula) then return; end if;
  if p_concluida then
    select duracao_segundos into v_dur from aulas where id = p_aula;
    select posicao_segundos into v_pos from progresso where aluna_id = auth.uid() and aula_id = p_aula;
    if v_dur is null or v_pos is null or v_pos < v_dur - greatest(15, v_dur * 0.05) then return; end if;
  end if;
  insert into progresso (aluna_id, aula_id, concluida_em, atualizada_em)
  values (auth.uid(), p_aula, case when p_concluida then now() end, now())
  on conflict (aluna_id, aula_id) do update
    set concluida_em = case when p_concluida then coalesce(progresso.concluida_em, now()) end,
        atualizada_em = now();
end;
$$;
