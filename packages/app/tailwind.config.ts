import type { Config } from 'tailwindcss'

export default <Config>{
  darkMode: 'class',
  content: [
    './app/**/*.{vue,ts,js}',
    './components/**/*.{vue,ts,js}',
    './layouts/**/*.{vue,ts,js}',
    './pages/**/*.{vue,ts,js}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#fff7fb',
          100: '#fed2e2',
          200: '#f3d9fb',
          300: '#e9a5f1',
          400: '#d5a0ff',
          500: '#c68efd',
          600: '#a97cf6',
          700: '#8f87f1',
          800: '#6b63c4',
          900: '#544c9f',
        },
        sidebar: {
          DEFAULT: '#1e293b',
          hover: '#334155',
          active: '#0f172a',
        },
      },
    },
  },
}
