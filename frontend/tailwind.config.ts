import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--canvas)',
        foreground: 'var(--text-primary)',
        surface: 'var(--surface)',
        'surface-raised': 'var(--surface-raised)',
        'surface-muted': 'var(--surface-muted)',
        accent: 'var(--accent)',
        'text-secondary': 'var(--text-secondary)',
        'border-subtle': 'var(--border-subtle)',
        'border-functional': 'var(--border-functional)',
        focus: 'var(--focus)',
      },
    },
  },
  plugins: [],
  important: true,
  darkMode: 'class',
};
export default config;
