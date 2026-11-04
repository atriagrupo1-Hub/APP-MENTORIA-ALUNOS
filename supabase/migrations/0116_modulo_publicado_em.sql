-- Módulo (0116): data em que foi publicado. Gravada pelo banco quando o módulo passa a publicado
-- (sai do rascunho ou de oculto). Em teste só no Módulo 0 do Bênçãos: só ele começa com a data de criação.
alter table public.modulos add column if not exists publicado_em timestamptz;
update public.modulos set publicado_em = criado_em where id = '76e20306-7f78-4502-8633-918f3e2d5f07' and publicado_em is null;

create or replace function public.modulos_marca_publicacao() returns trigger language plpgsql as $$
begin
  if new.publicado and not new.rascunho
     and (tg_op = 'INSERT' or not (old.publicado and not old.rascunho)) then
    new.publicado_em := now();
  end if;
  return new;
end $$;
drop trigger if exists modulos_marca_publicacao on public.modulos;
create trigger modulos_marca_publicacao before insert or update of publicado, rascunho on public.modulos
  for each row execute function public.modulos_marca_publicacao();
