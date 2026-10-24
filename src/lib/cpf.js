// CPF: só dígitos para guardar; máscara para exibir; validação pelos dígitos verificadores (não prova que o CPF existe).
export const soDigitos = (v = '') => String(v).replace(/\D/g, '');

export const maskCpf = (v = '') => {
    const d = soDigitos(v).slice(0, 11);
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
};

export function cpfValido(v) {
    const d = soDigitos(v);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const dv = (len) => {
        let soma = 0;
        for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i);
        const r = (soma * 10) % 11;
        return r === 10 ? 0 : r;
    };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
