/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{svelte,js,ts}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#22d3ee'
        }
      }
    }
  },
  plugins: []
};
