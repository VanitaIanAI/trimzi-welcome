export const metadata = {
  title: 'TrimZi',
  description: 'Barbering. Redefined.',
};

import './globals.css';
import React from 'react';
import { Poppins } from 'next/font/google';

// Strong display face for the brand
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-brand',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${poppins.variable} min-h-screen bg-ivory text-charcoal`}>
        {children}
      </body>
    </html>
  );
}