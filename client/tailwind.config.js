/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,css}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      /* Apple Fitness–style neon on true black + #1C1C1E surfaces */
      colors: {
        fit: {
          bg: '#000000',
          surface: '#1C1C1E',
          muted: '#8E8E93',
          lime: '#A4FF00',
          rose: '#FF2D55',
          cyan: '#00BDFF',
          purple: '#AF52DE'
        }
      },
      borderRadius: {
        '4xl': '1.75rem'
      },
      boxShadow: {
        surface: '0 1px 0 0 rgb(255 255 255 / 0.04)',
        lift: '0 8px 32px -8px rgb(0 0 0 / 0.55)'
      }
    }
  },
  plugins: []
};
