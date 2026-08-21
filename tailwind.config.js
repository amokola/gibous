/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        game: {
          paper: '#f2efe9',
          'paper-soft': '#fbfaf7',
          surface: '#ffffff',
          'ink-black': '#1a1a1a',
          'ink-blue': '#1a365d',
          'ink-red': '#9b2c2c',
          'note-yellow': '#fff9c4',
          'note-yellow-border': '#fbc02d',
          'note-blue': '#e8f0fb',
          'paper-rule': '#d1d5db',
          'success-bg': '#dcfce7',
          'success-text': '#166534',
          'warning-bg': '#fef3c7',
          'warning-text': '#854d0e',
          'danger-bg': '#fee2e2',
          'danger-text': '#991b1b',
          'info-bg': '#e0f2fe',
          'disc-red': '#ef4444',
          'disc-blue': '#3b82f6',
          bg: '#f2efe9',
          card: '#ffffff',
          cardHover: '#fbfaf7',
          border: '#1a1a1a',
          tileDark: '#eadbba',
          tileLight: '#faf6ee',
          tileHover: '#fef9c3',
        }
      },
      fontFamily: {
        sans: ['"Cabin Sketch"', 'cursive', 'system-ui', 'sans-serif'],
        display: ['"Cabin Sketch"', 'cursive', 'system-ui', 'sans-serif'],
        body: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        sketch: ['"Cabin Sketch"', 'cursive', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'sketch-xs': '1.5px 1.5px 0px 0px #1a1a1a',
        'sketch-sm': '2.5px 2.5px 0px 0px #1a1a1a',
        'sketch-md': '3.5px 3.5px 0px 0px #1a1a1a',
        'sketch-lg': '5px 5px 0px 0px #1a1a1a',
        'sketch-xl': '6px 6px 0px 0px #1a1a1a',
        'sketch-2xl': '8px 8px 0px 0px #1a1a1a',
      },
      animation: {
        'pulse-fast': 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-subtle': 'bounceSubtle 1s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(-6%)' },
          '50%': { transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        }
      }
    },
  },
  plugins: [],
}

