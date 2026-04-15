/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#0f172a',       // slate-900
          panel: '#1e293b',    // slate-800
          border: '#334155',   // slate-700
          cyan: '#22d3ee',     // cyan-400
          amber: '#fbbf24',    // amber-400
          red: '#f87171',      // red-400
          green: '#4ade80',    // green-400
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
