
export const metadata = { title: 'TrimZi', description: 'Premium grooming, booked in minutes.' }
import './globals.css';
import React from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
