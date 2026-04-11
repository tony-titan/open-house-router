import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import AdGateProvider from '@/components/AdGateProvider';
import CookieConsent from '@/components/CookieConsent';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_ID;

export const metadata: Metadata = {
  title: 'Open House Router',
  description: 'Optimize your open house weekend with smart routing for your team',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className={inter.className}>
        <AdGateProvider>{children}</AdGateProvider>
        <CookieConsent />
        {adsenseId && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseId}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
