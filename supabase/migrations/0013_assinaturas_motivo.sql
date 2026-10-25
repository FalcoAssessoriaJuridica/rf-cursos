-- Motivo de uma assinatura não iniciada (ex.: o cartão já tinha sido usado em outro teste grátis). Gravado só pelo webhook. Reexecutável.
alter table public.assinaturas add column if not exists motivo text;
