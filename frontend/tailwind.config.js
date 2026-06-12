/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // --- Pure black & white tokens (neutral greys, no warmth) ---
        white: '#ffffff',
        ink: '#0a0a0a',          // primary text / black
        alt: '#f5f5f5',          // alt section / panel  -> bg-alt
        card: '#fafafa',         // neutral card         -> bg-card
        soft: '#6b6b6b',         // secondary text       -> text-soft
        faint: '#9a9a9a',        // faint hint text      -> text-faint
        brown: '#0a0a0a',        // (accent now black — no brown)
        btn: '#0a0a0a',          // primary button black
        line: '#e2e2e2',         // neutral divider
        'line-soft': '#f0f0f0',  // very soft divider

        // legacy aliases mapped to the monochrome palette.
        black: '#0a0a0a',
        clay: '#0a0a0a',
        paper: '#ffffff',
        cream: '#f5f5f5',
        'gray-light': '#f5f5f5',
        'gray-mid': '#6b6b6b',
        'gray-border': '#e2e2e2',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        body: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '6px',
      },
    },
  },
  plugins: [],
}
