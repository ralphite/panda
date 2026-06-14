import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{vue,ts}', './.storybook/**/*.{ts,vue}'],
  theme: {
    extend: {
      colors: {
        panda: {
          ink: '#171717',
          muted: '#6b7280',
          line: '#d7dde7',
          panel: '#ffffff',
          app: '#eef2f6',
          accent: '#2563eb',
        },
      },
      boxShadow: {
        panel: '0 1px 2px rgba(15, 23, 42, 0.06), 0 10px 30px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;

