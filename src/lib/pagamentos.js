import { supabase } from './supabase';

export const PRAZOS = [
    { id: 'mensal', label: '30 dias', renova: 'a cada 30 dias' },
    { id: 'semestral', label: '6 meses', renova: 'a cada 6 meses' },
    { id: 'anual', label: '1 ano', renova: 'a cada ano' },
];

export const brl = (centavos) => (Number(centavos) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Mensagem de erro de uma Edge Function (o corpo traz { error })
async function erroDaFuncao(error) {
    if ([401, 403].includes(error.context?.status)) return 'Sua sessão expirou. Saia e entre novamente.';
    try { const j = await error.context?.json?.(); if (j?.error) return j.error; } catch { /* mantém a mensagem padrão */ }
    return error.message;
}

// Chama a função `pagamentos` (checkout, portal, set_price, remove_price)
export async function pagamentos(action, payload = {}) {
    const { data, error } = await supabase.functions.invoke('pagamentos', { body: { action, ...payload } });
    if (error) throw new Error(await erroDaFuncao(error));
    if (data?.error) throw new Error(data.error);
    return data;
}

// Cadastro público: função `signup` (o sign up nativo do Supabase fica desligado)
export async function cadastrar({ nome_completo, email, telefone, cpf, password, site, aceito, termos_versao, captcha_token }) {
    const { data, error } = await supabase.functions.invoke('signup', { body: { nome_completo, email, telefone, cpf, password, site, aceito, termos_versao, captcha_token } });
    if (error) throw new Error(await erroDaFuncao(error));
    if (data?.error) throw new Error(data.error);
    return data;
}

export async function carregarCatalogo() {
    const { data, error } = await supabase.rpc('catalogo_cursos');
    if (error) throw new Error(error.message);
    return data || [];
}

export async function minhasAssinaturas() {
    const { data, error } = await supabase
        .from('assinaturas')
        .select('id, curso_id, prazo, status, motivo, trial_fim, periodo_fim, cancela_no_fim, cursos(titulo)')
        .order('criado_em', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
}

export const STATUS_ASSINATURA = {
    active: 'Ativa',
    trialing: 'Em teste grátis',
    past_due: 'Pagamento pendente',
    canceled: 'Cancelada',
    unpaid: 'Não paga',
    incomplete: 'Aguardando pagamento',
    incomplete_expired: 'Expirada',
};

export async function meusPagamentosPix() {
    const { data, error } = await supabase
        .from('pagamentos_avulsos')
        .select('id, prazo, acesso_ate, pago_em, cursos(titulo)')
        .order('pago_em', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
}
