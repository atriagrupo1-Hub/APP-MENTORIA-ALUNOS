-- Categoria (0123): "Texto em cima do nome" do card (ex.: "Categoria", "Coleção").
alter table public.categorias_aba add column if not exists card_rotulo text;
alter table public.categorias_aba drop constraint if exists categorias_aba_card_rotulo_tam;
alter table public.categorias_aba add constraint categorias_aba_card_rotulo_tam check (card_rotulo is null or char_length(card_rotulo) <= 40);
