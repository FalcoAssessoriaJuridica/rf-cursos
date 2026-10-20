// Enquadramento da capa: posição (x/y em %, ponto de foco) + zoom.
// A mesma função é usada no editor e em todos os lugares onde a capa aparece,
// então o recorte exibido é exatamente o que foi ajustado.
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function coverValue(course = {}) {
    return {
        x: Number(course.capa_posicao_x ?? 50),
        y: Number(course.capa_posicao_y ?? 50),
        zoom: Number(course.capa_zoom) || 1,
    };
}

// `scale` (propriedade individual) compõe com o `transform` do Tailwind, então o zoom no hover continua funcionando.
export function coverStyle(course = {}) {
    const { x, y, zoom } = coverValue(course);
    return {
        objectPosition: `${x}% ${y}%`,
        transformOrigin: `${x}% ${y}%`,
        scale: zoom !== 1 ? String(zoom) : undefined,
    };
}
