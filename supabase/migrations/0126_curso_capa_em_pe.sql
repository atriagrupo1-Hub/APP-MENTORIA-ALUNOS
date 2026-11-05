-- Capa em pé do curso (2:3, 1024 × 1536). A deitada (16:9) continua em capa_path.
-- No e-book, capa_path já é a capa em pé; esta coluna fica vazia.
alter table public.produtos add column if not exists capa_vertical_path text;
