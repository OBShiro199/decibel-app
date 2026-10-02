import { Inter } from 'next/font/google';

// Inter (variable) for the app, as in Linear's system. Variable weights allow 510 and 590.
// Loaded only by the app and onboarding layouts, so marketing pages don't download it.
export const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
