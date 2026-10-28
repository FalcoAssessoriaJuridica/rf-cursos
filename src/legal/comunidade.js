// Termo de consentimento do envio de vídeos na Comunidade MAC.
// TEXTO-BASE para revisão jurídica: confira o texto antes de confiar nele, principalmente as seções 4 (Google no exterior), 5 (prazo) e 7 (menores).
// Para mudar o texto de forma relevante: edite aqui E atualize a versão no banco, para todos aceitarem de novo:
//   update public.comunidades set termo_versao = '2026-11-v2' where slug = 'mac';
import { MARCA, RESPONSAVEL, dado } from './dados';

export const TERMO_COMUNIDADE = () => ({
    titulo: 'Termo de envio de vídeos na Comunidade MAC',
    secoes: [
        {
            titulo: '1. Quem cuida dos seus dados',
            blocos: [
                `A Comunidade MAC é um espaço gratuito do ${MARCA} para o Ministério Adoradores de Cristo. Quem decide como o seu vídeo é tratado é ${dado(RESPONSAVEL.nome)} (${dado(RESPONSAVEL.documento)}), pelo e-mail ${dado(RESPONSAVEL.email)}.`,
            ],
        },
        {
            titulo: '2. Para que usamos o seu vídeo',
            blocos: ['O professor assiste ao vídeo para avaliar a sua execução e orientar o seu estudo. Não usamos o vídeo para outra finalidade, não vendemos e não fazemos propaganda com ele.'],
        },
        {
            titulo: '3. Quem pode ver',
            blocos: [
                { lista: [
                    'Por padrão, só você e o professor.',
                    'Se você escolher "Toda a comunidade", os outros membros também assistem, e o seu primeiro nome e a inicial do sobrenome aparecem junto.',
                    'O recado que você escreve ao professor e as respostas dele continuam só entre vocês dois.',
                    'Você muda essa escolha quando quiser, em "Meus envios".',
                ] },
            ],
        },
        {
            titulo: '4. Onde o vídeo fica guardado',
            blocos: ['Os arquivos ficam numa pasta privada do Google Drive do professor, sem link público; só o aplicativo toca o vídeo, para quem tem permissão. O Google pode processar esses dados em servidores fora do Brasil.'],
        },
        {
            titulo: '5. Por quanto tempo',
            blocos: [
                'Cada vídeo é apagado automaticamente 90 dias depois do envio. O professor pode marcar um vídeo para guardar por mais tempo, por exemplo como material de ensino; nesse caso o app mostra o aviso "guardado" e você ainda pode apagar o vídeo quando quiser.',
            ],
        },
        {
            titulo: '6. Os seus direitos',
            blocos: [
                { lista: [
                    'Apagar qualquer vídeo seu, a qualquer momento, em "Meus envios".',
                    'Retirar o consentimento a qualquer momento: isso apaga todos os seus vídeos e impede novos envios até você aceitar o termo de novo.',
                    `Pedir informações ou a correção dos seus dados pelo e-mail ${dado(RESPONSAVEL.email)}. Você também pode recorrer à Autoridade Nacional de Proteção de Dados (ANPD).`,
                ] },
            ],
        },
        {
            titulo: '7. Menores de 18 anos',
            blocos: [
                'Quem tem menos de 18 anos só envia vídeos com a autorização de um responsável (pai, mãe ou responsável legal). O professor confirma essa autorização com o responsável antes de liberar o envio.',
                'O vídeo de um menor só fica visível para toda a comunidade se o responsável autorizar isso expressamente; caso contrário, fica só para o professor.',
            ],
        },
    ],
});

// Texto das caixas de confirmação da tela.
export const ACEITE_TERMO = 'Li o termo acima e concordo com o envio e o tratamento do meu vídeo nessas condições.';
export const AUTORIZA_COMPARTILHAR = 'Meu responsável também autoriza que meus vídeos possam ser vistos por toda a comunidade (opcional).';
