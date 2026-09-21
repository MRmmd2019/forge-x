import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'AutoForge — Deterministic Cloudflare Worker Compiler',
  description: 'Deterministic build engine and developer workbench converting web projects into single standalone worker.js for Cloudflare Workers.',
  openGraph: {
    title: 'AutoForge — Deterministic Cloudflare Worker Compiler',
    description: 'Deterministic build engine and developer workbench converting web projects into single standalone worker.js for Cloudflare Workers.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AutoForge — Deterministic Cloudflare Worker Compiler',
    description: 'Deterministic build engine and developer workbench converting web projects into single standalone worker.js for Cloudflare Workers.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
