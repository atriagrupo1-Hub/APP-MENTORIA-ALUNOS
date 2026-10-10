-- Duas alunas e uma administradora sobre o catálogo real (migration
-- 0004). Nada de módulos inventados: os testes usam o Módulo 0 e o
-- Módulo 1 do próprio curso, para que a prova valha para o dado real.

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

insert into profiles (id, nome, login, papel) values
  ('11111111-1111-1111-1111-111111111111', 'Administradora', 'admin', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'Maria', 'maria', 'aluna'),
  ('33333333-3333-3333-3333-333333333333', 'Ana', 'ana', 'aluna');

insert into credenciais (aluna_id, codigo) values
  ('11111111-1111-1111-1111-111111111111', '482913'),
  ('22222222-2222-2222-2222-222222222222', '1234'),
  ('33333333-3333-3333-3333-333333333333', '5678');

-- Mídia em duas aulas: uma do Módulo 0 (que a Maria terá) e uma do
-- Módulo 1 (que ela não terá), para provar que o endereço do vídeo não
-- vaza do módulo bloqueado.
insert into aula_midia (aula_id, video_provider, video_ref)
select a.id, 'stream', 'uid-secreto-modulo-' || m.numero || '-aula-' || a.numero
from aulas a join modulos m on m.id = a.modulo_id
where (m.numero = 0 and a.numero = 1) or (m.numero = 1 and a.numero = 1);

-- Maria tem as aulas do Módulo 0, todas abertas. Ana não tem nada.
--
-- A liberação é sempre por aula (migration 0010): o módulo é o retrato
-- das aulas dela, não um registro próprio. `abre_em` nulo = já aberta.
insert into acessos (aluna_id, escopo, aula_id)
select '22222222-2222-2222-2222-222222222222', 'aula', a.id
from aulas a join modulos m on m.id = a.modulo_id
where m.numero = 0;

-- Um comentário da Maria na primeira aula do Módulo 0.
insert into comentarios (aula_id, autora_id, texto, posicao_segundos, status)
select a.id, '22222222-2222-2222-2222-222222222222', 'Comentario da Maria', 272, 'publicado'
from aulas a join modulos m on m.id = a.modulo_id
where m.numero = 0 and a.numero = 1;
