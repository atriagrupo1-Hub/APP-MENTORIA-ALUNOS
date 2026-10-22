-- Quando a aula foi liberada para todas: o painel mostra a data junto do
-- "Liberada para todas". Tirar a liberação apaga a data.
alter table public.aulas add column if not exists liberada_em timestamptz;
update public.aulas set liberada_em = coalesce(liberada_em, now()) where liberada_geral and liberada_em is null;

create or replace function public.data_da_liberacao_geral() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.liberada_geral and not coalesce(old.liberada_geral, false) then new.liberada_em := now();
  elsif not new.liberada_geral then new.liberada_em := null;
  end if;
  return new;
end $$;
drop trigger if exists aulas_data_liberacao_geral on public.aulas;
create trigger aulas_data_liberacao_geral before update of liberada_geral on public.aulas
  for each row execute function public.data_da_liberacao_geral();
