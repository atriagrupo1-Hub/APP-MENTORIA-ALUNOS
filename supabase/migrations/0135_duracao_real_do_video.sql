-- Duração das aulas vem sempre do vídeo, nunca digitada.
-- 1) Medidas lidas do próprio vídeo (manifesto do Cloudflare Stream) em 13/11/2026.
update aulas set duracao_segundos = 2433 where id = '2518cba3-2c84-410c-b1cb-957be2211601'; -- Boas-vindas e diagnóstico / 1 (estava 660)
update aulas set duracao_segundos = 3724 where id = '0af76225-08da-4d30-885b-3efabded15fe'; -- Encontrando a origem dos bloqueios / 2 (estava 780)
-- 2) Trocou ou colocou o vídeo da aula: a duração antiga é apagada e o app da aluna grava a real
--    assim que o vídeo abre (registrar_duracao). Sem duração, a aula não conclui por tempo.
create or replace function public.duracao_zera_ao_trocar_video() returns trigger
 language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' or new.video_ref is distinct from old.video_ref then
    update aulas set duracao_segundos = null where id = new.aula_id;
  end if;
  return new;
end;
$$;
drop trigger if exists duracao_zera_ao_trocar_video on public.aula_midia;
create trigger duracao_zera_ao_trocar_video after insert or update of video_ref on public.aula_midia
  for each row execute function public.duracao_zera_ao_trocar_video();
