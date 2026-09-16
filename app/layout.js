import './globals.css';
import { AuthProvider } from '../lib/AuthProvider';

export const metadata = {
  title: 'Werewolf & Undercover — Party Games',
  description: 'Main Werewolf dan Undercover online atau pass-and-play, dengan akun & statistik via Supabase.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <AuthProvider>
          <main className="wrap">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
