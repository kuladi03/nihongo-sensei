/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Washi Paper Theme
        washi: {
          base: '#FAF8F5',
          sub: '#F5F3EF',
          card: '#FFFFFF',
          border: '#E5E0D8',
          hover: '#ECE7DF',
          muted: '#9CA3AF',
        },
        // Sumi Ink Scale
        sumi: {
          900: '#1F2421',
          800: '#2D322E',
          700: '#3D4440',
          600: '#5C635F',
          500: '#7E8782',
          400: '#A4ADA8',
          300: '#CCD3CE',
        },
        // Ai-iro Indigo
        aii: {
          DEFAULT: '#2B4C7E',
          light: '#EAF0F8',
          dark: '#1C3355',
          border: '#BED0E8',
        },
        // Matcha Green
        matcha: {
          DEFAULT: '#4A7C59',
          light: '#EDF5EF',
          dark: '#355940',
          border: '#C5DEC9',
          50: '#ECFDF5',
          100: '#D1FAE5',
          400: '#34D399',
          500: '#4A7C59',
          600: '#355940',
          700: '#233E2B',
        },
        // Torii Vermilion / Amber for Phonetic Traps
        torii: {
          DEFAULT: '#D94E34',
          light: '#FDF0ED',
          dark: '#A63620',
          border: '#F6C6BC',
        },
        trap: {
          400: '#F59E0B',
          500: '#D97706',
          600: '#B45309',
          danger: '#D94E34',
        },
        // Sakura Blossom
        sakura: {
          DEFAULT: '#E88D98',
          light: '#FBF0F2',
          dark: '#BA5D69',
          border: '#F7D6DB',
          400: '#F472B6',
          500: '#EC4899',
          600: '#DB2777',
        },
        // Warm Gold
        gold: {
          DEFAULT: '#C9972C',
          light: '#FCF8ED',
          dark: '#936D1C',
          border: '#F2DEAF',
          400: '#FBBF24',
          500: '#C9972C',
          600: '#936D1C',
        },
        // Legacy ink fallback for safety
        ink: {
          950: '#FAF8F5',
          900: '#FFFFFF',
          800: '#F5F3EF',
          700: '#E5E0D8',
          600: '#5C635F',
          500: '#7E8782',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        japanese: ['"Noto Sans JP"', 'sans-serif'],
        serifJp: ['"Noto Serif JP"', 'serif'],
        marathi: ['"Noto Sans Devanagari"', 'sans-serif'],
      },
      boxShadow: {
        'washi': '0 2px 10px -2px rgba(31, 36, 33, 0.05), 0 1px 3px 0 rgba(31, 36, 33, 0.03)',
        'washi-md': '0 8px 24px -4px rgba(31, 36, 33, 0.08), 0 2px 6px -1px rgba(31, 36, 33, 0.04)',
        'washi-lg': '0 16px 36px -6px rgba(31, 36, 33, 0.1), 0 4px 12px -2px rgba(31, 36, 33, 0.05)',
      }
    },
  },
  plugins: [],
}
