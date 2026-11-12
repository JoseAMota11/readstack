import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { MessageProvider } from '@/context/message.context';
import ReviewDraftCleanup from '@/components/review-draft-cleanup';
import { ThemeProvider } from '@/context/theme.context';
import AntdReact19Patch from '@/components/antd-react19-patch';

// Runs before paint. If hydration fails, reveal the page rather than hiding it indefinitely.
const themeBootstrap = `(function(){var root=document.documentElement;var stored;try{stored=localStorage.getItem('theme')}catch(e){}var dark=stored==='dark'||(!stored&&window.matchMedia('(prefers-color-scheme: dark)').matches);root.classList.toggle('dark',dark);root.setAttribute('data-theme-pending','');setTimeout(function(){root.removeAttribute('data-theme-pending')},3000)})()`;

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'ReadStack',
  description: 'ReadStack es una aplicación para catalogar, organizar y reseñar tus libros. Construye tu biblioteca personal y lleva un registro de tus lecturas.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AntdReact19Patch />
        <AntdRegistry>
          <ThemeProvider>
            <ReviewDraftCleanup />
            <MessageProvider>{children}</MessageProvider>
          </ThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
