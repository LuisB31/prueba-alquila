/**
 * Configuración de Tailwind CSS.
 *
 * El sitio ya NO usa el CDN de Tailwind (que compila en el navegador y pesa
 * ~300 KB de JS). En su lugar se genera un CSS estático y minificado con:
 *
 *     npm run build:css
 *
 * Tailwind escanea el HTML y los módulos JS en busca de clases usadas, así que
 * escribe las clases completas (no las construyas con plantillas tipo
 * `bg-${color}-500`, porque no se detectarían).
 */
module.exports = {
  content: ['./frontend/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        primary: '#1E3A5F',    // Azul marino
        secondary: '#40E0D0',  // Turquesa
        accent: '#FF6B6B',     // Coral
        background: '#F8F9FA', // Blanco humo
        textdark: '#2D3436',   // Gris oscuro
        gold: '#FFD700',       // Dorado premium
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Poppins', 'sans-serif'],
      },
      scale: { 102: '1.02' },
    },
  },
  plugins: [],
};
