-- Modo prévia do painel (/admin?previa=1): o painel em edição é publicado
-- neste depósito público e a tela recarrega sozinha a cada versão nova.
-- Só a conta de edição do Claude grava aqui; ninguém mais escreve.
insert into storage.buckets (id, name, public) values ('previa', 'previa', true)
  on conflict (id) do update set public = true;
drop policy if exists previa_escrita on storage.objects;
drop policy if exists previa_atualiza on storage.objects;
drop policy if exists previa_remove on storage.objects;
create policy previa_escrita on storage.objects for insert to authenticated
  with check (bucket_id = 'previa' and auth.uid() = '013cc974-2935-4cf4-bc25-487f84e60907'::uuid);
create policy previa_atualiza on storage.objects for update to authenticated
  using (bucket_id = 'previa' and auth.uid() = '013cc974-2935-4cf4-bc25-487f84e60907'::uuid)
  with check (bucket_id = 'previa' and auth.uid() = '013cc974-2935-4cf4-bc25-487f84e60907'::uuid);
create policy previa_remove on storage.objects for delete to authenticated
  using (bucket_id = 'previa' and auth.uid() = '013cc974-2935-4cf4-bc25-487f84e60907'::uuid);
drop policy if exists previa_leitura_editor on storage.objects;
create policy previa_leitura_editor on storage.objects for select to authenticated
  using (bucket_id = 'previa' and auth.uid() = '013cc974-2935-4cf4-bc25-487f84e60907'::uuid);
