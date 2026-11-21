-- 0142 — Etiquetas de alunos (ação em lote "Pôr etiqueta" na aba Alunos).
-- Uma etiqueta é só um texto curto por aluno; a equipe vê, quem edita aluno põe e tira.

create table if not exists public.etiquetas_aluna (
  aluna_id uuid not null references public.profiles(id) on delete cascade,
  etiqueta text not null check (char_length(etiqueta) between 1 and 40),
  autor_id uuid default auth.uid(),
  criada_em timestamptz not null default now(),
  primary key (aluna_id, etiqueta)
);

alter table public.etiquetas_aluna enable row level security;

create policy etiquetas_le on public.etiquetas_aluna for select to authenticated using (public.eh_equipe());
create policy etiquetas_poe on public.etiquetas_aluna for insert to authenticated with check (public.pode('al_editar'));
create policy etiquetas_tira on public.etiquetas_aluna for delete to authenticated using (public.pode('al_editar'));

grant select, insert, delete on public.etiquetas_aluna to authenticated;
