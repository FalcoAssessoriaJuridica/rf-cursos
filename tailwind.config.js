/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#09090b', // Slightly lighter black for depth
        surface: '#18181b', // Cards/Modals
        primary: '#D4AF37', // Metallic Gold
        'primary-hover': '#B8962E',
        text: '#FAFAFA', // Off-white
        'text-muted': '#A1A1AA',
        border: '#27272A',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-gold': 'linear-gradient(135deg, #D4AF37 0%, #FCT658 100%)',
      },
    },
  },
  plugins: [],
}
