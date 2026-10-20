-- RASCUNHO — marca o administrador. Rodar UMA vez, depois de criar o usuário em Authentication > Users.
-- O papel fica em app_metadata (só o service_role altera; o próprio usuário não consegue se promover).
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
 where email = 'falco.adv@gmail.com';
