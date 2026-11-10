/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#07070d',
        ink: { 900: '#0b0b14', 800: '#10101c', 700: '#171726', 600: '#20203a' },
        volt: { DEFAULT: '#8b5cf6', soft: '#a78bfa', deep: '#6d28d9' },
        pulse: { DEFAULT: '#22d3ee', soft: '#67e8f9', deep: '#0891b2' },
        arc: '#3b82f6',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        volt: '0 0 32px -4px rgba(139, 92, 246, 0.55)',
        pulse: '0 0 32px -4px rgba(34, 211, 238, 0.5)',
      },
      keyframes: {
        scan: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100%)' } },
        flicker: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.55' } },
      },
      animation: { scan: 'scan 2.4s linear infinite', flicker: 'flicker 1.6s ease-in-out infinite' },
    },
  },
  plugins: [],
}
