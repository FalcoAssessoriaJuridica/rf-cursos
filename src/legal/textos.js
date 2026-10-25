import { MARCA, RESPONSAVEL, dado } from './dados';

// Cada seção: { titulo, blocos: [string | { lista: string[] }] }. MINUTA para revisão jurídica do responsável.
const quem = () => `${dado(RESPONSAVEL.nome)}, inscrito(a) no CPF/CNPJ ${dado(RESPONSAVEL.documento)}, com endereço em ${dado(RESPONSAVEL.endereco)}`;

export const TERMOS = () => ({
    titulo: 'Termos de Uso',
    secoes: [
        {
            titulo: '1. Quem somos e aceite',
            blocos: [
                `A plataforma ${MARCA} é operada por ${quem()} ("nós"). Ao criar uma conta, assinar ou usar a plataforma, você ("aluno") declara que leu e aceita estes Termos de Uso e a Política de Privacidade.`,
                `Se não concordar, não utilize a plataforma.`,
            ],
        },
        {
            titulo: '2. O serviço',
            blocos: [
                `A ${MARCA} oferece cursos de música em vídeo, partituras, áudios e materiais de apoio, acessados pela internet, por curso contratado e pelo período pago.`,
                `O acesso é pessoal e limitado ao conteúdo dos cursos que você contratou e que estiverem com acesso ativo.`,
            ],
        },
        {
            titulo: '3. Cadastro e conta',
            blocos: [
                { lista: [
                    'Você deve informar dados verdadeiros e completos (nome, e-mail, CPF e, se quiser, telefone) e mantê-los atualizados.',
                    'É necessário ter 18 anos ou mais. Menores de 18 anos só podem usar a plataforma com a contratação e a supervisão de pai, mãe ou responsável legal.',
                    'Cada CPF pode ter uma única conta.',
                    'A conta é pessoal e intransferível. Não compartilhe sua senha. Você é responsável pelo que ocorrer na sua conta; se suspeitar de uso indevido, avise-nos imediatamente.',
                ] },
            ],
        },
        {
            titulo: '4. Planos, preços e pagamento',
            blocos: [
                `Cada curso tem preço próprio, exibido na página de Planos antes da contratação, em reais, para os prazos de 30 dias, 6 meses e 1 ano. Os pagamentos são processados pela Stripe; nós não armazenamos o número do seu cartão.`,
                { lista: [
                    'Cartão (assinatura): é uma assinatura recorrente. A cobrança se renova automaticamente ao fim de cada período (30 dias, 6 meses ou 1 ano, conforme o plano escolhido), no mesmo cartão, até que você cancele.',
                    'Pix (pagamento único): você paga uma única vez e recebe acesso pelo período escolhido a partir da confirmação do pagamento. Não há renovação automática; para continuar, é preciso pagar novamente, e o novo período é somado ao que restar do acesso.',
                    'Teste gratuito de 7 dias: disponível somente no plano de 30 dias pelo cartão, na primeira assinatura de cada curso, com cartão obrigatório e uma única vez por cartão. Se você não cancelar até o fim do teste, a primeira cobrança ocorre ao final dos 7 dias, pelo valor do plano exibido. Se o cartão já tiver sido usado em outro teste, a assinatura não é iniciada e nada é cobrado.',
                    'Cancelamento: você pode cancelar a assinatura a qualquer momento pela área "Meu perfil", em "Gerenciar pagamento e cancelamento". O cancelamento vale para as próximas cobranças, e o acesso continua até o fim do período já pago.',
                    'Falha de pagamento: se uma cobrança não for aprovada, o acesso é encerrado ao fim do período já pago, acrescido de uma tolerância curta, e pode ser retomado com a regularização do pagamento.',
                ] },
            ],
        },
        {
            titulo: '5. Direito de arrependimento e reembolso',
            blocos: [
                `Por se tratar de contratação à distância, você pode desistir da compra em até 7 (sete) dias corridos a contar da contratação, conforme o art. 49 do Código de Defesa do Consumidor, com a devolução integral do valor pago. Para isso, escreva para ${dado(RESPONSAVEL.email)} informando o e-mail da conta e o curso.`,
                `Passado esse prazo, o cancelamento interrompe as renovações futuras, sem reembolso do período já iniciado, ressalvados os casos em que a lei garanta o contrário. No teste gratuito não há cobrança a reembolsar.`,
            ],
        },
        {
            titulo: '6. Conteúdo e propriedade intelectual',
            blocos: [
                `Os vídeos, textos, áudios, arranjos, exercícios, partituras e demais materiais da plataforma são protegidos por direitos autorais. Você recebe uma licença pessoal, limitada, não exclusiva e intransferível para acessá-los para estudo próprio, durante o período contratado.`,
                { lista: [
                    'É proibido copiar, gravar, baixar para redistribuição, publicar, vender, compartilhar a conta ou de qualquer forma disponibilizar o conteúdo a terceiros.',
                    'Alguns materiais são de domínio público ou licenciados por terceiros (por exemplo, sob licenças Creative Commons); nesses casos, a indicação da obra e da licença acompanha o material, e o uso respeita os termos da licença.',
                ] },
            ],
        },
        {
            titulo: '7. Uso adequado e suspensão',
            blocos: [
                `Podemos suspender ou encerrar contas usadas para fraude, compartilhamento de credenciais, tentativa de burlar limites ou o teste gratuito, uso de meios automatizados, ou violação destes Termos, sem prejuízo dos direitos que a lei garante ao consumidor.`,
            ],
        },
        {
            titulo: '8. Disponibilidade e mudanças no serviço',
            blocos: [
                `Empregamos esforços razoáveis para manter a plataforma disponível, mas pode haver interrupções para manutenção ou por falhas de terceiros (internet, provedores de hospedagem, de pagamento ou de vídeo). Conteúdos podem ser atualizados, reorganizados ou substituídos, preservando a essência do curso contratado.`,
            ],
        },
        {
            titulo: '9. Responsabilidade',
            blocos: [
                `O conteúdo tem finalidade educacional e não garante resultado específico, que depende também da prática e do empenho do aluno. Na medida permitida pela lei e sem afastar os direitos do consumidor, não respondemos por danos decorrentes de uso indevido da conta pelo próprio aluno ou por falhas de serviços de terceiros fora do nosso controle.`,
            ],
        },
        {
            titulo: '10. Alterações destes Termos',
            blocos: [
                `Podemos atualizar estes Termos. Mudanças relevantes serão comunicadas na plataforma ou por e-mail e valem para os acessos e renovações posteriores. Registramos a versão dos Termos aceita por você no cadastro.`,
            ],
        },
        {
            titulo: '11. Contato, lei aplicável e foro',
            blocos: [
                `Dúvidas, solicitações e reclamações: ${dado(RESPONSAVEL.email)}.`,
                `Estes Termos são regidos pela lei brasileira. Fica eleito o foro do domicílio do consumidor para resolver qualquer controvérsia.`,
            ],
        },
    ],
});

export const PRIVACIDADE = () => ({
    titulo: 'Política de Privacidade',
    secoes: [
        {
            titulo: '1. Quem é o controlador',
            blocos: [
                `O controlador dos dados pessoais tratados na plataforma ${MARCA} é ${quem()}. Contato para assuntos de privacidade e para exercer seus direitos: ${dado(RESPONSAVEL.email)}.`,
                `Esta Política explica, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, "LGPD"), quais dados coletamos, para quê e quais são os seus direitos.`,
            ],
        },
        {
            titulo: '2. Dados que coletamos',
            blocos: [
                { lista: [
                    'Cadastro: nome completo, e-mail, CPF, telefone (opcional) e senha. A senha é guardada de forma protegida (criptografada) pelo serviço de autenticação; nós não a vemos.',
                    'Pagamento: os dados do cartão ou do Pix são informados diretamente à Stripe, que processa o pagamento. Nós não armazenamos o número do cartão. Recebemos da Stripe identificadores, a situação da assinatura, as datas e os valores e, para prevenção de fraude e do uso repetido do teste gratuito, um identificador irreversível do cartão.',
                    'Uso da plataforma: cursos contratados, prazos de acesso, progresso nas aulas, avaliações e preferências.',
                    'Dados técnicos: endereço IP, transformado em código irreversível, usado para limitar cadastros em massa; registros técnicos de acesso e de erros.',
                    'Armazenamento do navegador: guardamos no seu navegador as informações necessárias para manter você conectado e lembrar preferências, como o tema claro ou escuro.',
                ] },
            ],
        },
        {
            titulo: '3. Para que usamos e em que base legal',
            blocos: [
                { lista: [
                    'Executar o contrato: criar e manter sua conta, liberar o acesso aos cursos, cobrar e renovar assinaturas e prestar suporte (LGPD, art. 7º, V).',
                    'Cumprir obrigações legais e regulatórias: guarda de registros fiscais, contábeis e de pagamento (art. 7º, II).',
                    'Legítimo interesse: segurança da plataforma, prevenção a fraude e abuso, como a unicidade de CPF, o limite de cadastros e o controle de uso repetido do teste gratuito (art. 7º, IX).',
                    'Consentimento, quando necessário (por exemplo, comunicações promocionais, se houver), que você pode revogar a qualquer momento (art. 7º, I).',
                ] },
                `O CPF é usado para identificar o titular, evitar contas duplicadas e fraudes e, quando necessário, para fins fiscais. Atualmente não consultamos o CPF em bases externas.`,
            ],
        },
        {
            titulo: '4. Com quem compartilhamos',
            blocos: [
                `Compartilhamos dados apenas na medida necessária com prestadores que viabilizam o serviço, e não vendemos seus dados:`,
                { lista: [
                    'Stripe: processamento de pagamentos e assinaturas.',
                    'Supabase: banco de dados, autenticação e armazenamento de arquivos.',
                    'Provedor de hospedagem do site.',
                    'Google (Drive, YouTube) e outros serviços de vídeo: reprodução de vídeos e entrega de materiais das aulas.',
                    'Autoridades públicas, quando exigido por lei ou ordem judicial.',
                ] },
            ],
        },
        {
            titulo: '5. Transferência internacional',
            blocos: [
                `Alguns desses prestadores podem tratar dados fora do Brasil. Nesses casos, observamos as hipóteses e salvaguardas previstas na LGPD (art. 33) e exigimos padrões de segurança compatíveis.`,
            ],
        },
        {
            titulo: '6. Por quanto tempo guardamos',
            blocos: [
                `Mantemos os dados enquanto sua conta estiver ativa e, depois, pelo tempo necessário para cumprir obrigações legais, exercer direitos em processos e prevenir fraudes (em regra, até 5 anos para registros fiscais e de pagamento). Superado o prazo, os dados são eliminados ou anonimizados.`,
            ],
        },
        {
            titulo: '7. Seus direitos',
            blocos: [
                `Nos termos do art. 18 da LGPD, você pode solicitar: confirmação do tratamento; acesso aos dados; correção de dados incompletos, inexatos ou desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade; portabilidade; informação sobre os compartilhamentos; revogação do consentimento; e oposição a tratamentos baseados em legítimo interesse.`,
                `Para exercer esses direitos, escreva para ${dado(RESPONSAVEL.email)}. Responderemos em prazo razoável. Você também pode recorrer à Autoridade Nacional de Proteção de Dados (ANPD).`,
            ],
        },
        {
            titulo: '8. Segurança',
            blocos: [
                `Adotamos medidas técnicas e administrativas para proteger os dados: conexão criptografada, senhas protegidas, regras de acesso que limitam cada pessoa aos seus próprios dados e ao conteúdo que contratou, e controle do que cada administrador pode fazer. Nenhum sistema é totalmente imune a falhas; em caso de incidente que possa causar risco relevante, comunicaremos os titulares e a ANPD conforme a lei.`,
            ],
        },
        {
            titulo: '9. Crianças e adolescentes',
            blocos: [
                `A plataforma é destinada a maiores de 18 anos. Menores só devem usá-la com a contratação e o acompanhamento de pai, mãe ou responsável legal, que responde pelo tratamento dos dados do menor.`,
            ],
        },
        {
            titulo: '10. Armazenamento do navegador e ferramentas de terceiros',
            blocos: [
                `Usamos o armazenamento do próprio navegador para manter sua sessão e suas preferências. [Se houver ferramentas de análise de acesso ou de publicidade, informar aqui quais são e para quê.]`,
            ],
        },
        {
            titulo: '11. Alterações desta Política',
            blocos: [
                `Podemos atualizar esta Política. Mudanças relevantes serão comunicadas na plataforma ou por e-mail. A versão em vigor é a publicada nesta página.`,
            ],
        },
    ],
});
