-- =====================================================================
-- 0052 — Início da área da aluna montado pelo painel
--
-- Tudo o que o Início do primeiro acesso mostra passa a vir do banco:
--   * Configurações gerais: o nome no cabeçalho ("Mentoria" / "Área de
--     Alunos") e a lista de versículos (um por dia, em sequência);
--   * curso da mentoria: o rótulo ("Sua mentoria") e o nome curto
--     ("Bênçãos Ilimitadas");
--   * módulo: a capa deitada (16:9) do "Comece por aqui";
--   * Destaques do Início: os cartões depois de "Também para você".
-- Lê quem tem conta ativa e a equipe; grava o administrador.
-- =====================================================================

alter table configuracoes add column if not exists marca_titulo text not null default 'Mentoria';
alter table configuracoes add column if not exists marca_sub    text not null default 'Área de Alunos';

alter table produtos add column if not exists rotulo_inicio text;
alter table produtos add column if not exists nome_curto    text;

alter table modulos add column if not exists capa_horizontal_path text;

create table if not exists versiculos (
  id         uuid primary key default gen_random_uuid(),
  texto      text not null check (length(btrim(texto)) between 2 and 600),
  referencia text not null check (length(btrim(referencia)) between 2 and 80),
  ordem      integer not null default 0,
  criado_em  timestamptz not null default now()
);
alter table versiculos enable row level security;
drop policy if exists "versiculos: leitura" on versiculos;
create policy "versiculos: leitura" on versiculos for select using (conta_ativa() or eh_equipe());
drop policy if exists "versiculos: admin" on versiculos;
create policy "versiculos: admin" on versiculos for all using (eh_admin()) with check (eh_admin());

create table if not exists destaques_inicio (
  id            uuid primary key default gen_random_uuid(),
  imagem_path   text,
  rotulo        text not null,
  titulo        text not null,
  descricao     text not null default '',
  botao         text not null,
  destino       text not null default 'presentes' check (destino in ('presentes', 'categoria')),
  categoria_id  uuid references categorias(id) on delete set null,
  categoria_nome text,
  icone         text not null default 'estrela' check (icone in ('estrela', 'presente', 'filme', 'video', 'livro', 'som')),
  cor           text not null default 'dourado' check (cor in ('dourado', 'violeta', 'verde', 'azul', 'vermelho')),
  ordem         integer not null default 0,
  visivel       boolean not null default true,
  criado_em     timestamptz not null default now()
);
alter table destaques_inicio enable row level security;
drop policy if exists "destaques: leitura" on destaques_inicio;
create policy "destaques: leitura" on destaques_inicio for select using (conta_ativa() or eh_equipe());
drop policy if exists "destaques: admin" on destaques_inicio;
create policy "destaques: admin" on destaques_inicio for all using (eh_admin()) with check (eh_admin());

-- Dados iniciais: os da maquete aprovada.
insert into versiculos (texto, referencia, ordem)
select v.t, v.r, v.o from (values
  ('Não vos conformeis com este mundo, mas transformai-vos pela renovação do vosso entendimento.', 'Romanos 12:2', 1),
  ('Se alguém está em Cristo, nova criatura é; as coisas velhas já passaram; eis que tudo se fez novo.', '2 Coríntios 5:17', 2),
  ('Eu bem sei os pensamentos que tenho a vosso respeito, diz o Senhor; pensamentos de paz e não de mal, para vos dar o fim que esperais.', 'Jeremias 29:11', 3),
  ('Porque, como imaginou na sua alma, assim é.', 'Provérbios 23:7', 4),
  ('Eis que faço uma coisa nova; agora sairá à luz; porventura não a percebeis?', 'Isaías 43:19', 5),
  ('Posso todas as coisas naquele que me fortalece.', 'Filipenses 4:13', 6),
  ('Fazei prova de mim, diz o Senhor dos Exércitos, se eu não vos abrir as janelas do céu e não derramar sobre vós uma bênção.', 'Malaquias 3:10', 7),
  ('Assim também a fé, se não tiver as obras, é morta em si mesma.', 'Tiago 2:17', 8),
  ('A morte e a vida estão no poder da língua.', 'Provérbios 18:21', 9),
  ('Tudo o que pedirdes, orando, crede que o recebereis, e tê-lo-eis.', 'Marcos 11:24', 10),
  ('Àquele que é poderoso para fazer tudo muito mais abundantemente além daquilo que pedimos ou pensamos.', 'Efésios 3:20', 11),
  ('Os que esperam no Senhor renovarão as suas forças; subirão com asas como águias.', 'Isaías 40:31', 12),
  ('Tudo o que é verdadeiro, tudo o que é amável, tudo o que é de boa fama, nisso pensai.', 'Filipenses 4:8', 13),
  ('Amado, desejo que te vá bem em todas as coisas e que tenhas saúde, assim como bem vai a tua alma.', '3 João 1:2', 14)
) as v(t, r, o)
where not exists (select 1 from versiculos);

insert into destaques_inicio (imagem_path, rotulo, titulo, descricao, botao, destino, categoria_nome, icone, cor, ordem)
select d.* from (values
  ('/inicio/jornada.png', 'Mestres espirituais', 'Mestres espirituais secretos', 'Coleção de vídeos gravados e escondidos em VHS, que nunca foram ao ar na internet.', 'Ver os vídeos ocultos', 'categoria', 'Mestres espirituais', 'estrela', 'violeta', 1),
  ('/inicio/presentes.png', 'Seus presentes', 'Acesse seus presentes', 'Materiais especiais, bônus e conteúdos exclusivos para acelerar sua transformação.', 'Ver presentes', 'presentes', null, 'presente', 'verde', 2),
  (null, 'Documentários', 'Assista aos documentários', 'Histórias reais e conteúdos que aprofundam a sua jornada, para assistir com calma.', 'Ver documentários', 'categoria', 'Documentários', 'filme', 'azul', 3)
) as d(imagem_path, rotulo, titulo, descricao, botao, destino, categoria_nome, icone, cor, ordem)
where not exists (select 1 from destaques_inicio);

update produtos set rotulo_inicio = coalesce(rotulo_inicio, 'Sua mentoria'), nome_curto = coalesce(nome_curto, 'Bênçãos Ilimitadas')
 where id = (select produto_jornada from configuracoes limit 1);

update modulos set capa_horizontal_path = coalesce(capa_horizontal_path, '/capas/modulo-0-horizontal.webp')
 where produto_id = (select produto_jornada from configuracoes limit 1) and numero = 0;
