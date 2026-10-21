-- =====================================================================
-- 0047 — O que a maquete da aula pede e o banco ainda não tinha
--
-- * Resumo e Exercício da aula: as abas "Resumo" e "Exercícios" da
--   tela da aula. Texto livre, escrito no painel. Vazio = "em breve".
-- * Curtir comentário: o coração com a contagem embaixo de cada um.
-- * Denunciar comentário: vai para as sugestões do painel, onde a
--   equipe já lê o que chega das alunas. Não esconde nada sozinho.
-- =====================================================================

alter table aulas add column if not exists resumo text;
alter table aulas add column if not exists exercicio text;

create table if not exists curtidas_comentario (
  aluna_id      uuid not null references profiles(id) on delete cascade,
  comentario_id uuid not null references comentarios(id) on delete cascade,
  criada_em     timestamptz not null default now(),
  primary key (aluna_id, comentario_id)
);
alter table curtidas_comentario enable row level security;
-- Sem política: só as funções abaixo leem e escrevem.

create or replace function alternar_curtida_comentario(p_comentario uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_aula uuid; v_existe boolean;
begin
  select aula_id into v_aula from comentarios where id = p_comentario and status = 'publicado';
  if v_aula is null or not pode_ver_aula(v_aula) then return false; end if;
  select exists (select 1 from curtidas_comentario where aluna_id = auth.uid() and comentario_id = p_comentario)
    into v_existe;
  if v_existe then
    delete from curtidas_comentario where aluna_id = auth.uid() and comentario_id = p_comentario;
    return false;
  end if;
  insert into curtidas_comentario (aluna_id, comentario_id) values (auth.uid(), p_comentario);
  return true;
end;
$$;
revoke execute on function alternar_curtida_comentario(uuid) from public, anon;
grant execute on function alternar_curtida_comentario(uuid) to authenticated;

create or replace function denunciar_comentario(p_comentario uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_c comentarios; v_nome text;
begin
  select * into v_c from comentarios where id = p_comentario and status = 'publicado';
  if not found or not pode_ver_aula(v_c.aula_id) then raise exception 'sem_permissao'; end if;
  select nome into v_nome from profiles where id = auth.uid();
  insert into sugestoes (texto, autor_id, autor_nome)
  values ('Denúncia de comentário: "' || left(v_c.texto, 300) || '"', auth.uid(), coalesce(v_nome, 'Aluna'));
end;
$$;
revoke execute on function denunciar_comentario(uuid) from public, anon;
grant execute on function denunciar_comentario(uuid) to authenticated;

drop function if exists comentarios_da_aula(uuid);
create function comentarios_da_aula(p_aula uuid)
returns table(id uuid, aula_id uuid, texto text, posicao_segundos integer, criado_em timestamptz,
              autora_nome text, minha boolean, resposta_a uuid, eh_instrutor boolean,
              curtidas integer, curti boolean)
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
         (select count(*)::integer from curtidas_comentario k where k.comentario_id = c.id),
         exists (select 1 from curtidas_comentario k where k.comentario_id = c.id and k.aluna_id = auth.uid())
  from comentarios c
  left join profiles p      on p.id = c.autora_id
  left join comentarios pai on pai.id = c.resposta_a
  where c.aula_id = p_aula
    and c.status = 'publicado'
    and (c.resposta_a is null or pai.status = 'publicado')
    and (pode_ver_aula(p_aula) or eh_equipe())
  order by coalesce(pai.criado_em, c.criado_em) desc,
           c.resposta_a nulls first,
           c.criado_em asc;
$$;
revoke execute on function comentarios_da_aula(uuid) from public, anon;
grant execute on function comentarios_da_aula(uuid) to authenticated;
