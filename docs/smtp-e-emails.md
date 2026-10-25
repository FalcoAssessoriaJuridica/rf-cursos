# E-mails do sistema (SMTP próprio)

O envio padrão do Supabase aceita só poucos e-mails por hora e tem baixa entregabilidade. O "Esqueci minha senha" depende dele.
Solução: SMTP próprio, com um domínio autenticado (SPF e DKIM).

## Escolha: Resend (plano grátis: 3.000 e-mails/mês, 100/dia)
Alternativas equivalentes: Brevo (300/dia grátis) e Amazon SES (mais barato em volume, mais trabalhoso).

## Situação da sua conta Resend
O domínio **`falcotech.com.br` já está verificado** no Resend (SPF/DKIM prontos); não é preciso mexer no DNS. O remetente usa esse domínio.
O limite do plano grátis (100 e-mails/dia, 3.000/mês) é **da conta inteira**, dividido com os outros projetos que usam o mesmo Resend.

## Passo a passo
1. Resend → **API Keys → Create API key**: nome `RF Cursos (Supabase SMTP)`, permissão **Sending access**, domínio **falcotech.com.br**. Copiar a chave (`re_...`); ela aparece uma única vez e é a senha do SMTP. Não reutilizar as chaves de outros projetos: uma chave própria pode ser revogada sem afetar os demais.
2. Supabase → **Authentication → Emails → SMTP Settings** → ligar **Enable custom SMTP**:
   - Sender email: `nao-responda@falcotech.com.br`
   - Sender name: `RF Music Academy`
   - Host: `smtp.resend.com` · Port: `465` · Username: `resend` · Password: a chave `re_...`
3. Supabase → **Authentication → Rate Limits**: depois do SMTP próprio, aumentar "emails sent per hour" (ex.: 30).
4. Supabase → **Authentication → Emails → Templates → Reset Password**: colar o conteúdo de `docs/email-templates/redefinir-senha.html` e o assunto `Redefinir sua senha - RF Music Academy`.

## Teste
Em `/recuperar-senha`, peça o link para um e-mail seu (Gmail e outro provedor). Conferir: chegou na caixa de entrada (não no spam), o remetente é
"RF Music Academy", o botão leva a `/redefinir-senha` e a senha nova funciona. No Gmail, "Mostrar original" deve indicar SPF: PASS e DKIM: PASS.
