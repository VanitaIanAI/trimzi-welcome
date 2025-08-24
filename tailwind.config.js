
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}","./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brown: { DEFAULT: '#8B5E3C', dark: '#71492F', light: '#C9B6A9' },
        brass: '#CBA052',
        charcoal: '#1F2430',
        ivory: '#F7F3EE',
        border: '#E6E1DB',
        muted: '#5E6168',
        slate: '#5D7FA1'
      },
      boxShadow: {
        card: '0 8px 24px rgba(20,27,45,0.06)',
        cardHover: '0 12px 28px rgba(20,27,45,0.10)'
      },
      borderRadius: {
        card: '12px'
      }
    }
  },
  plugins: []
}
