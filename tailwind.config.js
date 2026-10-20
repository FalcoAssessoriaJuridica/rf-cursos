/** @type {import('tailwindcss').Config} */
// Cores vêm de variáveis CSS (index.css) para que o tema claro/escuro troque tudo de uma vez.
// `white`/`black` também são variáveis: no tema claro viram tinta/papel, então utilitários como
// text-white/60, bg-black/40 e border-white/10 se adaptam sem mexer nas telas.
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        white: v('white'),
        black: v('black'),
        background: v('bg'),
        surface: v('surface'),
        panel: v('panel'),
        primary: v('primary'),
        'primary-hover': v('primary-hover'),
        text: v('text'),
        'text-muted': v('muted'),
        dim: v('dim'),
        border: v('border'),
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-gold': 'linear-gradient(135deg, #D4AF37 0%, #FDE68A 100%)',
      },
    },
  },
  plugins: [],
}
