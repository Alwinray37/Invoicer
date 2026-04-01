/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Syne"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        ink: '#0e0e0e',
        paper: '#f5f2eb',
        accent: '#c8f04a',
        muted: '#8a8a7a',
        border: '#d8d4c8',
        card: '#faf8f3',
      },
    },
  },
  plugins: [],
}
