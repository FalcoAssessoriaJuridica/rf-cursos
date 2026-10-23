-- Sincronia da partitura com o vídeo da aula. Rodar no SQL Editor do Supabase (depois do 0006). Idempotente.
--
-- Cada vínculo partitura <-> aula pode dizer em que segundo do vídeo começa o 1º tempo do compasso 1 (sync_inicio),
-- em que andamento o professor tocou (sync_bpm, em semínimas por minuto) e se o exercício se repete até o fim do vídeo.
-- sync_inicio vazio = sem sincronia (a partitura toca sozinha, como antes).
alter table public.partitura_vinculos
  add column if not exists sync_inicio numeric,
  add column if not exists sync_bpm    numeric,
  add column if not exists sync_loop   boolean not null default true;

notify pgrst, 'reload schema';
