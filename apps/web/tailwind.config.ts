import type { Config } from 'tailwindcss';
import preset from '@decibels/design-tokens';

const config: Config = {
  presets: [preset as unknown as Partial<Config>],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  plugins: [],
};

export default config;
