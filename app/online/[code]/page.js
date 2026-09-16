'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Topbar from '../../../components/Topbar';
import { useRoomChannel } from '../../../lib/useRoomChannel';

const PHASE_LABEL = { lobby: 'Lobby', night: '🌙 Malam — semua tutup mata', day: '☀️ Siang — diskusi', discuss: '💬 Sesi Bicara', vote: '🗳️ Voting', ended: '🏁 Selesai' };

export default function RoomPage() {
  return (
    <Suspense fallback={<><Topbar /><div className="card center">Memuat…</div></>}>
      <RoomPageInner />
    </Suspense>
  );
}

function RoomPageInner() {
  const { code } = useParams();
  const router = useRouter();
  const params = useSearchParams();
  const roomCode = (code || '').toString().toUpperCase();

  const isCreating = params.get('create') === '1';
  const gameType = params.get('gameType') || 'werewolf';
  const name = params.get('name') || 'Player';
  const userId = params.get('userId') || null;
  const avatarColor = params.get('avatarColor') || '#6C5CE7';

  const initialized = useRef(false);
  const { room, myRole, seerResult, ended, error, isHost, becomeHost, joinAsPlayer, sendAction, mrWhiteChance } = useRoomChannel(roomCode);

  const [selectedTarget, setSelectedTarget] = useState(null);
  const [clueText, setClueText] = useState('');
  const [mrWhiteGuess, setMrWhiteGuess] = useState('');

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (isCreating) becomeHost(gameType, name, userId, avatarColor);
    else joinAsPlayer(name, userId, avatarColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setSelectedTarget(null); }, [room?.phase]);

  if (!room) {
    return (<><Topbar /><div className="card center"><p>Menghubungkan ke room {roomCode}…</p></div></>);
  }

  if (ended) return <EndedView room={room} ended={ended} onHome={() => router.push('/')} />;

  const me = room.players.find((p) => p.clientId === (typeof window !== 'undefined' ? sessionStorage.getItem('pg_client_id') : null));
  const amAlive = me ? me.alive : true;

  return (
    <>
      <Topbar />
      {room.phase === 'lobby' ? (
        <LobbyView room={room} isHost={isHost} error={error} onStart={() => sendAction('start', { mrWhite: true })} onLeave={() => { sendAction('leave'); router.push('/'); }} />
      ) : (
        <>
          <div className={`phase-banner ${room.phase}`}>{PHASE_LABEL[room.phase] || room.phase} {room.round ? `• Ronde ${room.round}` : ''}</div>

          {myRole && <RoleCard gameType={room.gameType} myRole={myRole} seerResult={seerResult} />}

          {mrWhiteChance && myRole?.role === 'Mr. White' && (
            <div className="card">
              <h3>🤍 Kesempatan Mr. White!</h3>
              <p className="small">Kamu baru saja dieliminasi. Tebak kata milik Civilian untuk menang seketika.</p>
              <input value={mrWhiteGuess} onChange={(e) => setMrWhiteGuess(e.target.value)} placeholder="Tebakan kata…" />
              <button className="btn" onClick={() => { if (mrWhiteGuess.trim()) { sendAction('mrWhiteGuess', { guess: mrWhiteGuess.trim() }); setMrWhiteGuess(''); } }}>Kirim Tebakan</button>
            </div>
          )}

          {room.gameType === 'werewolf'
            ? <WerewolfPhase room={room} amAlive={amAlive} myRole={myRole} isHost={isHost} selectedTarget={selectedTarget} setSelectedTarget={setSelectedTarget} sendAction={sendAction} />
            : <UndercoverPhase room={room} amAlive={amAlive} isHost={isHost} selectedTarget={selectedTarget} setSelectedTarget={setSelectedTarget} sendAction={sendAction} clueText={clueText} setClueText={setClueText} mrWhiteGuess={mrWhiteGuess} setMrWhiteGuess={setMrWhiteGuess} />}

          <div className="card">
            <h3>Riwayat</h3>
            <div className="log-box">{room.logs.map((l, i) => <div className="log-line" key={i}>{l.text}</div>)}</div>
          </div>
        </>
      )}
    </>
  );
}

function LobbyView({ room, isHost, error, onStart, onLeave }) {
  return (
    <>
      <div className="card center">
        <p className="small">Kode Room — bagikan ke teman</p>
        <div className="code-display">{room.code}</div>
        <p className="small mt8">{room.gameType === 'werewolf' ? '🐺 Werewolf' : '🕵️ Undercover'}</p>
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="card">
        <h2>Pemain ({room.players.length})</h2>
        <div className="player-list">
          {room.players.map((p) => (
            <div className="player-row" key={p.clientId}>
              <span className="pname"><span className="avatar" style={{ background: p.avatarColor }}>{p.name[0]?.toUpperCase()}</span>{p.name} {p.isHost ? '👑' : ''}</span>
            </div>
          ))}
        </div>
        <p className="small mt16">Minimal 3 pemain untuk mulai.</p>
        {isHost
          ? <button className="btn good" onClick={onStart} disabled={room.players.length < 3}>Mulai Permainan</button>
          : <p className="center small">Menunggu host memulai permainan…</p>}
        <button className="btn ghost mt8" onClick={onLeave}>Keluar Room</button>
      </div>
    </>
  );
}

function RoleCard({ gameType, myRole, seerResult }) {
  if (gameType === 'werewolf') {
    return (
      <div className="role-card">
        <span className={`tag ${myRole.team === 'werewolf' ? 'werewolf' : 'villager'}`}>{myRole.team === 'werewolf' ? 'Tim Werewolf' : 'Tim Warga'}</span>
        <div className="role-name">{myRole.role}</div>
        <p>{myRole.desc}</p>
        {myRole.teammates?.length > 0 && <p className="small">Rekan werewolf: {myRole.teammates.join(', ')}</p>}
        {seerResult && <div className="info-box">Hasil intip: <b>{seerResult.targetName}</b> adalah {seerResult.isWerewolf ? '🐺 WEREWOLF!' : '✅ bukan werewolf.'}</div>}
      </div>
    );
  }
  const isMrWhite = myRole.role === 'Mr. White';
  return (
    <div className="role-card">
      <span className={`tag ${myRole.role === 'Civilian' ? 'civilian' : (isMrWhite ? 'mrwhite' : 'undercover')}`}>{myRole.role}</span>
      <div className="word">{myRole.word || '???'}</div>
      <p>{isMrWhite ? 'Kamu tidak dapat kata! Dengarkan clue orang lain dan berbaur.' : 'Beri clue satu kata/frasa singkat tanpa menyebut kata ini langsung.'}</p>
    </div>
  );
}

function WerewolfPhase({ room, amAlive, myRole, isHost, selectedTarget, setSelectedTarget, sendAction }) {
  if (room.phase === 'night') {
    if (!amAlive) return <div className="card center"><p>Kamu sudah gugur. Menunggu malam berakhir…</p></div>;
    const role = myRole?.role;
    if (!['Werewolf', 'Seer', 'Doctor', 'Guard'].includes(role)) {
      return <div className="card center"><p>🌙 Kamu tidur nyenyak. Menunggu Werewolf, Seer &amp; role malam lain beraksi…</p></div>;
    }
    const label = role === 'Werewolf' ? 'Pilih korban:' : role === 'Seer' ? 'Intip peran pemain:' : 'Lindungi pemain:';
    return (
      <div className="card">
        <h3>{label}</h3>
        <div className="player-list">
          {room.players.filter((p) => p.alive).map((p) => (
            <div key={p.clientId} className={`player-row clickable ${selectedTarget === p.clientId ? 'selected' : ''}`} onClick={() => setSelectedTarget(p.clientId)}>
              <span className="pname">{p.name}</span>{selectedTarget === p.clientId ? '✅' : ''}
            </div>
          ))}
        </div>
        <button className="btn mt16" disabled={!selectedTarget} onClick={() => { sendAction('nightAction', { role, targetClientId: selectedTarget }); setSelectedTarget(null); }}>Konfirmasi</button>
      </div>
    );
  }
  if (room.phase === 'day') {
    return (
      <div className="card">
        <p>Diskusikan siapa yang dicurigai sebagai werewolf.</p>
        {isHost ? <button className="btn bad" onClick={() => sendAction('toVote')}>Mulai Voting</button> : <p className="small center">Menunggu host membuka voting…</p>}
      </div>
    );
  }
  if (room.phase === 'vote') return <VoteUI room={room} amAlive={amAlive} selectedTarget={selectedTarget} setSelectedTarget={setSelectedTarget} sendAction={sendAction} />;
  return null;
}

function UndercoverPhase({ room, amAlive, isHost, selectedTarget, setSelectedTarget, sendAction, clueText, setClueText, mrWhiteGuess, setMrWhiteGuess }) {
  if (room.phase === 'discuss') {
    return (
      <div className="card">
        <h3>💬 Giliran Bicara</h3>
        <p className="small">Ucapkan clue soal kata rahasiamu (tanpa menyebut kata itu langsung), lalu ketik di sini biar tercatat.</p>
        <div className="log-box mt8">{room.logs.filter((l) => l.text.includes(':')).map((l, i) => <div className="log-line" key={i}>{l.text}</div>)}</div>
        {amAlive ? (
          <>
            <input value={clueText} onChange={(e) => setClueText(e.target.value)} placeholder="Ketik clue kamu…" />
            <button className="btn" onClick={() => { if (clueText.trim()) { sendAction('clue', { text: clueText.trim() }); setClueText(''); } }}>Kirim Clue</button>
          </>
        ) : <p className="small">Kamu sudah gugur, hanya bisa menonton.</p>}
        {isHost && <button className="btn bad mt16" onClick={() => sendAction('toVote')}>Mulai Voting</button>}
      </div>
    );
  }
  if (room.phase === 'vote') return <VoteUI room={room} amAlive={amAlive} selectedTarget={selectedTarget} setSelectedTarget={setSelectedTarget} sendAction={sendAction} />;
  return null;
}

function VoteUI({ room, amAlive, selectedTarget, setSelectedTarget, sendAction }) {
  if (!amAlive) return <div className="card center"><p>Kamu sudah gugur, tidak bisa voting.</p></div>;
  return (
    <div className="card">
      <h3>🗳️ Vote siapa yang dieliminasi</h3>
      <div className="player-list">
        {room.players.filter((p) => p.alive).map((p) => (
          <div key={p.clientId} className={`player-row clickable ${selectedTarget === p.clientId ? 'selected' : ''}`} onClick={() => setSelectedTarget(p.clientId)}>
            <span className="pname">{p.name}</span>{selectedTarget === p.clientId ? '✅' : ''}
          </div>
        ))}
      </div>
      <button className="btn bad mt16" disabled={!selectedTarget} onClick={() => { sendAction('vote', { targetClientId: selectedTarget }); setSelectedTarget(null); }}>Vote</button>
    </div>
  );
}

function EndedView({ room, ended, onHome }) {
  return (
    <>
      <Topbar />
      <div className="card center">
        <h1>{['werewolf', 'undercover'].includes(ended.winnerSide) ? '💀' : '🎉'} Game Selesai</h1>
        <p>{ended.message}</p>
        {ended.word && <p className="small">Kata Civilian: <b>{ended.word.civilian}</b> | Kata Undercover: <b>{ended.word.undercover}</b></p>}
      </div>
      <div className="card">
        <h3>Hasil Akhir</h3>
        <div className="player-list">
          {ended.players.map((p, i) => (
            <div key={i} className={`player-row ${p.alive ? '' : 'dead'}`}>
              <span className="pname">{p.name} {p.won ? '🏆' : ''}</span>
              <span className={`tag ${(p.role || '').toLowerCase().replace(/[^a-z]/g, '')}`}>{p.role}</span>
            </div>
          ))}
        </div>
      </div>
      <button className="btn" onClick={onHome}>Kembali ke Menu</button>
    </>
  );
}