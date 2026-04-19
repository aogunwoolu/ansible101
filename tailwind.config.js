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
      keyframes: {
        'slide-in-right': {
          from: { transform: 'translateX(16px)', opacity: '0' },
          to:   { transform: 'translateX(0)',    opacity: '1' },
        },
        'slide-in-drawer': {
          from: { transform: 'translateX(100%)' },
          to:   { transform: 'translateX(0)' },
        },
        'slide-down': {
          from: { transform: 'translateY(-6px)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'fade-up': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to:   { transform: 'translateY(0)',   opacity: '1' },
        },
        'scale-in': {
          from: { transform: 'scale(0.96)', opacity: '0' },
          to:   { transform: 'scale(1)',    opacity: '1' },
        },
        'pop-in': {
          '0%':   { transform: 'scale(0.85)', opacity: '0' },
          '70%':  { transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
      },
      animation: {
        'slide-in-right':  'slide-in-right 200ms cubic-bezier(0.25,0.46,0.45,0.94) both',
        'slide-in-drawer': 'slide-in-drawer 280ms cubic-bezier(0.25,0.46,0.45,0.94) both',
        'slide-down':      'slide-down 150ms cubic-bezier(0.25,0.46,0.45,0.94) both',
        'fade-in':         'fade-in 180ms ease both',
        'fade-up':         'fade-up 200ms cubic-bezier(0.25,0.46,0.45,0.94) both',
        'scale-in':        'scale-in 180ms cubic-bezier(0.25,0.46,0.45,0.94) both',
        'pop-in':          'pop-in 220ms cubic-bezier(0.34,1.3,0.64,1) both',
      },
    },
  },
  plugins: [],
}
