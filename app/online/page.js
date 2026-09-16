'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Topbar from '../../components/Topbar';
import { useAuth } from '../../lib/AuthProvider';
import { newRoomCode } from '../../lib/gameLogic';

export default function OnlineSetupPage() {
  return (
    <Suspense fallback={<><Topbar /><div className="card center">Memuat…</div></>}>
      <OnlineSetupInner />
    </Suspense>
  );
}

function OnlineSetupInner() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get('mode') === 'join' ? 'join' : 'create';
  const gameFromUrl = params.get('game') === 'undercover' ? 'undercover' : (params.get('game') === 'werewolf' ? 'werewolf' : null);
  const { displayName, user, avatarColor } = useAuth();

  const [gameType, setGameType] = useState(gameFromUrl || 'werewolf');
  const [name, setName] = useState(displayName);
  const [joinCode, setJoinCode] = useState('');

  const gameLabel = gameType === 'werewolf' ? { emoji: '🐺', name: 'Werewolf' } : { emoji: '🕵️', name: 'Undercover' };

  function go() {
    const n = name.trim() || 'Player';
    if (mode === 'create') {
      const code = newRoomCode();
      const qs = new URLSearchParams({ create: '1', gameType, name: n, userId: user?.id || '', avatarColor }).toString();
      router.push(`/online/${code}?${qs}`);
    } else {
      const code = joinCode.trim().toUpperCase();
      if (code.length < 4) return;
      const qs = new URLSearchParams({ create: '0', name: n, userId: user?.id || '', avatarColor }).toString();
      router.push(`/online/${code}?${qs}`);
    }
  }

  return (
    <>
      <Topbar />
      <div className={`card game-card ${gameType === 'werewolf' ? 'werewolf-card' : 'undercover-card'}`}>
        <div className="game-card-head">
          <span className="game-emoji">{gameLabel.emoji}</span>
          <div>
            <h2>{gameLabel.name}</h2>
            <p className="small">{mode === 'join' ? 'Gabung ke room yang sudah dibuat' : 'Buat room baru untuk dimainkan bareng teman'}</p>
          </div>
        </div>

        {mode === 'join' ? (
          <>
            <label className="mt16">Kode Room</label>
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Contoh: AB12CD" maxLength={6} />
          </>
        ) : (
          !gameFromUrl && (
            <>
              <label className="mt16">Pilih Permainan</label>
              <div className="btn-row mt8">
                <button className={`btn ${gameType === 'werewolf' ? '' : 'secondary'}`} onClick={() => setGameType('werewolf')}>🐺 Werewolf</button>
                <button className={`btn ${gameType === 'undercover' ? '' : 'secondary'}`} onClick={() => setGameType('undercover')}>🕵️ Undercover</button>
              </div>
            </>
          )
        )}

        <label className="mt16">Nama Kamu</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama tampil" />

        <div className="btn-row mt16">
          <button className="btn" onClick={go}>{mode === 'join' ? 'Gabung' : 'Buat Room'}</button>
          <button className="btn ghost" onClick={() => router.push('/')}>Batal</button>
        </div>
      </div>
    </>
  );
}