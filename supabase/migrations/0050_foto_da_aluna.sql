-- =====================================================================
-- 0050 — Foto da aluna
--
-- A equipe coloca a foto pelo painel (Alunas → ficha) e a aluna vê na
-- área de membros assim que entra; ela também pode trocar em Perfil →
-- Configurar. Antes a foto ficava só no aparelho dela.
--
-- `foto`: o recorte redondo pronto (JPEG pequeno, em data URL).
-- `original` e `ajuste`: a imagem inteira e o enquadramento (zoom e
-- posição), para "Ajustar" reabrir de onde parou.
-- Lê: a própria aluna e a equipe. Grava: só por `salvar_foto_aluna()`.
-- =====================================================================

create table if not exists fotos_aluna (
  aluna_id       uuid primary key references profiles(id) on delete cascade,
  foto           text not null,
  original       text,
  ajuste         jsonb,
  atualizada_em  timestamptz not null default now(),
  atualizada_por uuid references profiles(id) on delete set null
);
alter table fotos_aluna enable row level security;

drop policy if exists "foto: a própria e a equipe leem" on fotos_aluna;
create policy "foto: a própria e a equipe leem" on fotos_aluna
  for select to authenticated using (aluna_id = auth.uid() or eh_equipe());

create or replace function salvar_foto_aluna(p_aluna uuid, p_foto text, p_original text, p_ajuste jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (p_aluna = auth.uid() or eh_equipe()) then raise exception 'sem_permissao'; end if;
  if p_foto is null then
    delete from fotos_aluna where aluna_id = p_aluna;
    return;
  end if;
  if p_foto !~ '^data:image/(jpeg|png|webp);base64,' or length(p_foto) > 300000 then raise exception 'foto_invalida'; end if;
  if p_original is not null and (p_original !~ '^data:image/(jpeg|png|webp);base64,' or length(p_original) > 3000000) then
    raise exception 'foto_invalida';
  end if;
  insert into fotos_aluna (aluna_id, foto, original, ajuste, atualizada_em, atualizada_por)
  values (p_aluna, p_foto, p_original, p_ajuste, now(), auth.uid())
  on conflict (aluna_id) do update
    set foto = excluded.foto, original = excluded.original, ajuste = excluded.ajuste,
        atualizada_em = now(), atualizada_por = auth.uid();
end;
$$;
revoke execute on function salvar_foto_aluna(uuid, text, text, jsonb) from public, anon;
grant execute on function salvar_foto_aluna(uuid, text, text, jsonb) to authenticated;
