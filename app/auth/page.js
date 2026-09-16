'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Topbar from '../../components/Topbar';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthProvider';

export default function AuthPage() {
  const router = useRouter();
  const { setGuestName, guestName, user } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [guest, setGuest] = useState(guestName || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(''); setLoading(true);
    try {
      if (mode === 'register') {
        if (username.trim().length < 3) throw new Error('Username minimal 3 karakter.');
        const { error: err } = await supabase.auth.signUp({
          email, password,
          options: { data: { username: username.trim() } },
        });
        if (err) throw err;
        router.push('/');
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        router.push('/');
      }
    } catch (e) {
      setError(e.message || 'Terjadi kesalahan.');
    } finally {
      setLoading(false);
    }
  }

  function continueGuest() {
    setGuestName(guest.trim() || 'Tamu');
    router.push('/');
  }

  if (user) {
    return (
      <>
        <Topbar />
        <div className="card center">
          <p>Kamu sudah login.</p>
          <button className="btn secondary" onClick={async () => { await supabase.auth.signOut(); router.refresh(); }}>Logout</button>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar />
      <div className="card">
        <h2>{mode === 'login' ? 'Masuk' : 'Daftar Akun'}</h2>
        <p className="small">Bikin akun (via Supabase Auth) biar statistik &amp; history permainanmu tersimpan. Atau lanjut sebagai tamu.</p>
        {error && <div className="error-box">{error}</div>}

        {mode === 'register' && (
          <>
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username tampil" />
          </>
        )}
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@contoh.com" type="email" />
        <label>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 karakter" type="password" />

        <div className="btn-row">
          <button className="btn" onClick={submit} disabled={loading}>{loading ? 'Memproses…' : (mode === 'login' ? 'Masuk' : 'Daftar')}</button>
          <button className="btn secondary" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}
          </button>
        </div>

        <div className="mt16">
          <label>Atau main sebagai tamu (tanpa statistik tersimpan)</label>
          <input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Nama tamu" />
          <button className="btn ghost" onClick={continueGuest}>Lanjut sebagai Tamu</button>
        </div>
      </div>
    </>
  );
}
