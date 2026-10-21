-- =====================================================================
-- 0055 — Comentários com o perfil de quem escreveu
--
-- 1) A cor que a aluna escolhe no Perfil passa a morar no banco
--    (`profiles.cor_nome`), gravada só por ela via `salvar_minha_cor`.
-- 2) `comentarios_do_conteudo` substitui a leitura dos comentários na
--    tela da aula: traz também a foto e a cor de quem escreveu (só
--    quando o nome é visível) e os comentários da própria aluna que
--    ainda aguardam aprovação (só ela vê). Mesmas regras de acesso.
-- =====================================================================

alter table profiles add column if not exists cor_nome text
  check (cor_nome is null or cor_nome ~ '^#[0-9a-fA-F]{6}$');

create or replace function salvar_minha_cor(p_cor text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_cor is not null and p_cor !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'cor_invalida';
  end if;
  update profiles set cor_nome = p_cor where id = auth.uid();
end;
$$;
revoke execute on function salvar_minha_cor(text) from public, anon;
grant execute on function salvar_minha_cor(text) to authenticated;

create or replace function minha_cor()
returns text
language sql stable security definer set search_path = public as $$
  select cor_nome from profiles where id = auth.uid();
$$;
revoke execute on function minha_cor() from public, anon;
grant execute on function minha_cor() to authenticated;

create or replace function comentarios_do_conteudo(p_aula uuid)
returns table(id uuid, aula_id uuid, texto text, posicao_segundos integer, criado_em timestamptz,
              autora_nome text, minha boolean, resposta_a uuid, eh_instrutor boolean,
              autora_foto text, autora_cor text, pendente boolean)
language sql stable security definer set search_path = public as $$
  select c.id,
         c.aula_id,
         c.texto,
         c.posicao_segundos,
         c.criado_em,
         case when c.nome_visivel then p.nome end,
         c.autora_id = auth.uid(),
         c.resposta_a,
         coalesce(p.papel in ('dono','admin','suporte'), false),
         case when c.nome_visivel then f.foto end,
         case when c.nome_visivel then p.cor_nome end,
         c.status <> 'publicado'
  from comentarios c
  left join profiles p      on p.id = c.autora_id
  left join fotos_aluna f   on f.aluna_id = c.autora_id
  left join comentarios pai on pai.id = c.resposta_a
  where c.aula_id = p_aula
    and (c.status = 'publicado' or (c.autora_id = auth.uid() and c.status = 'pendente'))
    and (c.resposta_a is null or pai.status = 'publicado')
    and (pode_ver_aula(p_aula) or eh_equipe())
  order by coalesce(pai.criado_em, c.criado_em) desc,
           c.resposta_a nulls first,
           c.criado_em asc;
$$;
revoke execute on function comentarios_do_conteudo(uuid) from public, anon;
grant execute on function comentarios_do_conteudo(uuid) to authenticated;
