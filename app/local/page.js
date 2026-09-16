'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Topbar from '../../components/Topbar';
import {
  WEREWOLF_ROLE_INFO, WEREWOLF_TOGGLE_ROLES, buildWerewolfRolesFromConfig, werewolfCheckWinner,
  buildUndercoverRoles, undercoverCheckWinner, pickWordPair, shuffle,
} from '../../lib/gameLogic';
import { saveGameResult } from '../../lib/saveGame';
import { useAuth } from '../../lib/AuthProvider';

export default function LocalPage() {
  return (
    <Suspense fallback={<><Topbar /><div className="card center">Memuat…</div></>}>
      <LocalPageInner />
    </Suspense>
  );
}

function LocalPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const gameFromUrl = params.get('game') === 'undercover' ? 'undercover' : (params.get('game') === 'werewolf' ? 'werewolf' : null);
  const { user } = useAuth();

  // stages: setup -> (werewolf only: assign -> announce) -> reveal -> play -> result
  const [stage, setStage] = useState('setup');
  const [gameType, setGameType] = useState(gameFromUrl || 'werewolf');
  const gameLabel = gameType === 'werewolf' ? { emoji: '🐺', name: 'Werewolf' } : { emoji: '🕵️', name: 'Undercover' };

  const [mrWhiteOn, setMrWhiteOn] = useState(true);
  const [names, setNames] = useState(['', '', '', '']);

  // werewolf role config
  const [wolfCount, setWolfCount] = useState(1);
  const [roleToggles, setRoleToggles] = useState({}); // { Seer: true, Doctor: false, ... }

  const [rolePool, setRolePool] = useState([]); // unshuffled multiset built from config, used in 'assign' stage
  const [assignMode, setAssignMode] = useState(null); // 'gacha' | 'manual'
  const [manualAssignment, setManualAssignment] = useState([]); // array parallel to finalNames, each is role or null

  const [players, setPlayers] = useState([]); // {name, role, alive, deathCause}
  const [wordPair, setWordPair] = useState(null);
  const [revealIndex, setRevealIndex] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // {winnerSide, message}
  const [saving, setSaving] = useState(false);

  const finalNames = useMemo(() => names.map((n, i) => n.trim() || `Pemain ${i + 1}`), [names]);

  function updateName(i, v) { const n = [...names]; n[i] = v; setNames(n); }
  function addPlayer() { setNames([...names, '']); }
  function removePlayer(i) { setNames(names.filter((_, idx) => idx !== i)); }
  function toggleRole(role) { setRoleToggles((t) => ({ ...t, [role]: !t[role] })); }

  const usedSlots = 1 * wolfCount + Object.values(roleToggles).filter(Boolean).length; // rough count (werewolf handled separately below)
  const specialCount = wolfCount + WEREWOLF_TOGGLE_ROLES.filter((r) => roleToggles[r]).length;
  const villagerCount = Math.max(0, finalNames.length - specialCount);

  function goToAssign() {
    if (finalNames.length < 3) { setError('Minimal 3 pemain.'); return; }
    if (specialCount > finalNames.length) { setError('Total role spesial melebihi jumlah pemain. Kurangi role atau tambah pemain.'); return; }
    setError('');

    const config = { werewolfCount: wolfCount };
    WEREWOLF_TOGGLE_ROLES.forEach((r) => { config[r.toLowerCase()] = !!roleToggles[r]; });
    // Build UNSHUFFLED pool for manual assignment transparency; gacha will shuffle at confirm time.
    const pool = [];
    for (let i = 0; i < wolfCount; i++) pool.push('Werewolf');
    WEREWOLF_TOGGLE_ROLES.forEach((r) => { if (roleToggles[r]) pool.push(r); });
    while (pool.length < finalNames.length) pool.push('Villager');
    setRolePool(pool.slice(0, finalNames.length));
    setManualAssignment(new Array(finalNames.length).fill(null));
    setAssignMode(null);
    setStage('assign');
  }

  function goToAssignUndercover() {
    if (finalNames.length < 3) { setError('Minimal 3 pemain.'); return; }
    setError('');
    const roles = buildUndercoverRoles(finalNames.length, mrWhiteOn);
    setWordPair(pickWordPair());
    setPlayers(finalNames.map((name, i) => ({ name, role: roles[i], alive: true })));
    setRevealIndex(0);
    setStage('reveal');
  }

  function confirmGacha() {
    const shuffled = shuffle(rolePool);
    setPlayers(finalNames.map((name, i) => ({ name, role: shuffled[i], alive: true })));
    setRevealIndex(0);
    setStage('announce');
  }

  function setManualSlot(idx, role) {
    setManualAssignment((arr) => { const c = [...arr]; c[idx] = role || null; return c; });
  }

  function remainingForSlot(idx) {
    const usedElsewhere = [...manualAssignment];
    usedElsewhere[idx] = null; // exclude current slot's own pick
    const pool = [...rolePool];
    usedElsewhere.forEach((r) => { if (r) { const pos = pool.indexOf(r); if (pos >= 0) pool.splice(pos, 1); } });
    return pool;
  }

  function confirmManual() {
    if (manualAssignment.some((r) => !r)) { setError('Semua pemain harus punya role sebelum lanjut.'); return; }
    setError('');
    setPlayers(finalNames.map((name, i) => ({ name, role: manualAssignment[i], alive: true })));
    setRevealIndex(0);
    setStage('announce');
  }

  function roleSummary() {
    const tally = {};
    rolePool.forEach((r) => { tally[r] = (tally[r] || 0) + 1; });
    return Object.entries(tally);
  }

  function markDead(idx, cause) { setPlayers((ps) => ps.map((p, i) => i === idx ? { ...p, alive: false, deathCause: cause } : p)); }
  function markAlive(idx) { setPlayers((ps) => ps.map((p, i) => i === idx ? { ...p, alive: true, deathCause: null } : p)); }

  async function checkWinner() {
    let winnerSide = null, message = '';

    if (gameType === 'werewolf') {
      // Special case: Tanner wins alone if eliminated specifically by DAY VOTE.
      const tannerVoted = players.find((p) => p.role === 'Tanner' && !p.alive && p.deathCause === 'vote');
      if (tannerVoted) {
        winnerSide = 'tanner';
        message = `Tanner (${tannerVoted.name}) berhasil dieksekusi lewat voting siang — Tanner MENANG SENDIRIAN! 🃏`;
      } else {
        winnerSide = werewolfCheckWinner(players);
        if (winnerSide === 'villager') message = 'Warga menang! Semua werewolf sudah gugur.';
        if (winnerSide === 'werewolf') message = 'Werewolf menang! Jumlah mereka menyamai warga.';
      }
    } else {
      winnerSide = undercoverCheckWinner(players);
      if (winnerSide === 'civilian') message = 'Civilian menang! Semua Undercover & Mr. White sudah gugur.';
      if (winnerSide === 'undercover') message = 'Undercover menang! Jumlah mereka menyamai Civilian.';
    }
    if (!winnerSide) { alert('Game masih berlanjut — belum ada pemenang.'); return; }

    setResult({ winnerSide, message });
    setStage('result');

    setSaving(true);
    const resultPlayers = players.map((p) => ({
      userId: null, // pass-and-play: hanya moderator yang login, pemain lain tidak diminta akun
      displayName: p.name,
      role: p.role,
      survived: p.alive,
      won: gameType === 'werewolf'
        ? (winnerSide === 'tanner' ? p.role === 'Tanner' : WEREWOLF_ROLE_INFO[p.role].team === winnerSide)
        : (winnerSide === 'civilian' ? !['Undercover', 'Mr. White'].includes(p.role) : ['Undercover', 'Mr. White'].includes(p.role)),
    }));
    await saveGameResult({ roomCode: 'LOCAL', gameType, mode: 'local', winnerSide, players: resultPlayers });
    setSaving(false);
  }

  function restart() {
    setStage('setup'); setPlayers([]); setWordPair(null); setResult(null);
    setAssignMode(null); setManualAssignment([]); setRolePool([]);
  }

  return (
    <>
      <Topbar />

      {/* ================= SETUP ================= */}
      {stage === 'setup' && (
        <div className={`card game-card ${gameType === 'werewolf' ? 'werewolf-card' : 'undercover-card'}`}>
          <div className="game-card-head">
            <span className="game-emoji">{gameLabel.emoji}</span>
            <div>
              <h2>{gameLabel.name}</h2>
              <p className="small">Setup Pass-and-Play (1 device)</p>
            </div>
          </div>
          {!gameFromUrl && (
            <>
              <label className="mt16">Pilih Permainan</label>
              <div className="btn-row mt8">
                <button className={`btn ${gameType === 'werewolf' ? '' : 'secondary'}`} onClick={() => setGameType('werewolf')}>🐺 Werewolf</button>
                <button className={`btn ${gameType === 'undercover' ? '' : 'secondary'}`} onClick={() => setGameType('undercover')}>🕵️ Undercover</button>
              </div>
            </>
          )}
          {gameType === 'undercover' && (
            <div className="checkbox-row">
              <input id="mrwhite" type="checkbox" checked={mrWhiteOn} onChange={(e) => setMrWhiteOn(e.target.checked)} />
              <label htmlFor="mrwhite" style={{ margin: 0 }}>Sertakan role Mr. White</label>
            </div>
          )}

          <label className="mt16">Nama Pemain (min 3) — total {finalNames.length} orang</label>
          {names.map((n, i) => (
            <div className="btn-row" style={{ marginBottom: 8 }} key={i}>
              <input value={n} onChange={(e) => updateName(i, e.target.value)} placeholder={`Pemain ${i + 1}`} />
              <button className="btn ghost btn-auto" onClick={() => removePlayer(i)}>✕</button>
            </div>
          ))}
          <button className="btn secondary" onClick={addPlayer}>+ Tambah Pemain</button>

          {gameType === 'werewolf' && (
            <>
              <h3 className="mt16">🐺 Jumlah Werewolf</h3>
              <div className="btn-row">
                <button className="btn secondary btn-auto" onClick={() => setWolfCount((c) => Math.max(1, c - 1))}>−</button>
                <div className="stepper-value">{wolfCount}</div>
                <button className="btn secondary btn-auto" onClick={() => setWolfCount((c) => c + 1)}>+</button>
              </div>

              <h3 className="mt16">✨ Role Spesial (opsional)</h3>
              <div className="role-toggle-list">
                {WEREWOLF_TOGGLE_ROLES.map((role) => (
                  <label className="role-toggle-row" key={role}>
                    <input type="checkbox" checked={!!roleToggles[role]} onChange={() => toggleRole(role)} />
                    <div>
                      <b>{role}</b>
                      <p className="small">{WEREWOLF_ROLE_INFO[role].desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              <p className="small mt8">
                Sisanya otomatis jadi <b>Villager</b> — komposisi: {wolfCount}x Werewolf
                {WEREWOLF_TOGGLE_ROLES.filter((r) => roleToggles[r]).map((r) => `, 1x ${r}`).join('')}
                {villagerCount > 0 ? `, ${villagerCount}x Villager` : ''}.
              </p>
            </>
          )}

          {error && <div className="error-box mt16">{error}</div>}
          <div className="btn-row mt16">
            <button className="btn good" onClick={gameType === 'werewolf' ? goToAssign : goToAssignUndercover}>
              {gameType === 'werewolf' ? 'Lanjut: Bagi Role ➜' : 'Bagikan Peran'}
            </button>
            <button className="btn ghost" onClick={() => router.push('/')}>Batal</button>
          </div>
        </div>
      )}

      {/* ================= ASSIGN (Werewolf only) ================= */}
      {stage === 'assign' && !assignMode && (
        <div className="card center">
          <h2>Cara bagikan role?</h2>
          <p className="small">Total {finalNames.length} pemain, {rolePool.length} role sudah disusun sesuai pilihanmu.</p>
          <div className="btn-row mt16">
            <button className="btn good" onClick={() => { setAssignMode('gacha'); }}>🎲 Acak Otomatis (Gacha)</button>
            <button className="btn secondary" onClick={() => setAssignMode('manual')}>✋ Assign Manual</button>
          </div>
          <button className="btn ghost mt16" onClick={() => setStage('setup')}>⬅ Kembali ke Setup</button>
        </div>
      )}

      {stage === 'assign' && assignMode === 'gacha' && (
        <div className="card center">
          <h2>🎲 Acak Otomatis</h2>
          <p>Role akan diacak dan dibagikan otomatis ke {finalNames.length} pemain, lalu ditampilkan satu-satu secara rahasia.</p>
          <div className="btn-row mt16">
            <button className="btn good" onClick={confirmGacha}>Kocok &amp; Bagikan!</button>
            <button className="btn ghost" onClick={() => setAssignMode(null)}>⬅ Kembali</button>
          </div>
        </div>
      )}

      {stage === 'assign' && assignMode === 'manual' && (
        <div className="card">
          <h2>✋ Assign Manual</h2>
          <p className="small">Pilih role untuk tiap pemain secara manual. Role yang sudah dipakai tidak akan muncul lagi di dropdown lain.</p>
          <div className="player-list mt16">
            {finalNames.map((name, idx) => (
              <div className="player-row" key={idx}>
                <span className="pname">{name}</span>
                <select
                  value={manualAssignment[idx] || ''}
                  onChange={(e) => setManualSlot(idx, e.target.value)}
                  className="role-select"
                >
                  <option value="">— pilih role —</option>
                  {manualAssignment[idx] && <option value={manualAssignment[idx]}>{manualAssignment[idx]} (dipilih)</option>}
                  {remainingForSlot(idx).filter((r, i, arr) => arr.indexOf(r) === i).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {error && <div className="error-box mt16">{error}</div>}
          <div className="btn-row mt16">
            <button className="btn good" onClick={confirmManual}>Konfirmasi Pembagian Role</button>
            <button className="btn ghost" onClick={() => setAssignMode(null)}>⬅ Kembali</button>
          </div>
        </div>
      )}

      {/* ================= ANNOUNCE (MC info, Werewolf only, before reveal) ================= */}
      {stage === 'announce' && (
        <div className="card center">
          <h2>📢 Pengumuman MC</h2>
          <p>Bacakan ke semua pemain — role apa saja yang ada di game ini (tanpa menyebut siapa dapat apa):</p>
          <div className="player-list mt16" style={{ textAlign: 'left' }}>
            {roleSummary().map(([role, count]) => (
              <div className="player-row" key={role}>
                <span className="pname">{role}</span>
                <span className={`tag ${WEREWOLF_ROLE_INFO[role]?.team === 'werewolf' ? 'werewolf' : (WEREWOLF_ROLE_INFO[role]?.team === 'neutral' ? 'mrwhite' : 'villager')}`}>{count}x</span>
              </div>
            ))}
          </div>
          <p className="small mt16">Setelah ini, role rahasia dibagikan satu-satu ke tiap pemain lewat device ini. <b>Malam pertama belum ada voting</b> — hanya role dengan aksi malam (Werewolf, Seer, dll) yang bergerak. Voting baru dimulai siang setelahnya.</p>
          <button className="btn good mt16" onClick={() => setStage('reveal')}>Lanjut Bagikan Role Rahasia ➜</button>
        </div>
      )}

      {/* ================= REVEAL ================= */}
      {stage === 'reveal' && (
        revealIndex >= players.length ? (
          <div className="card center">
            <h2>✅ Semua peran sudah dibagikan!</h2>
            <p>Moderator sekarang bisa memandu permainan secara verbal (giliran malam/voting), lalu catat siapa yang gugur di layar "Kelola Permainan".</p>
            <button className="btn good mt16" onClick={() => setStage('play')}>Lanjut ke Kelola Permainan</button>
          </div>
        ) : (
          <RevealCard gameType={gameType} player={players[revealIndex]} players={players} wordPair={wordPair} index={revealIndex} total={players.length} onNext={() => setRevealIndex((i) => i + 1)} />
        )
      )}

      {/* ================= PLAY (Kelola Permainan) ================= */}
      {stage === 'play' && (
        <div className="card">
          <h2>Kelola Permainan</h2>
          <p className="small">Moderator memandu ronde malam/diskusi/voting secara verbal. Tandai pemain yang gugur, dan sebutkan sebabnya (dibunuh werewolf malam hari, atau dieksekusi lewat voting siang) — ini penting untuk role seperti Tanner.</p>
          <div className="player-list mt16">
            {players.map((p, idx) => (
              <div key={idx} className={`player-row ${p.alive ? '' : 'dead'}`}>
                <span className="pname">{p.name}{!p.alive && p.deathCause ? <span className="small"> — {p.deathCause === 'vote' ? 'divoting' : 'diserang malam'}</span> : ''}</span>
                {p.alive
                  ? (
                    <div className="btn-row" style={{ width: 'auto' }}>
                      <button className="btn bad btn-auto" onClick={() => markDead(idx, 'night')}>Diserang</button>
                      <button className="btn bad btn-auto" onClick={() => markDead(idx, 'vote')}>Divoting</button>
                    </div>
                  )
                  : <button className="btn secondary btn-auto" onClick={() => markAlive(idx)}>Batalkan</button>}
              </div>
            ))}
          </div>
          <button className="btn good mt16" onClick={checkWinner}>Cek Pemenang</button>
          <button className="btn ghost mt8" onClick={restart}>Reset / Main Lagi</button>
        </div>
      )}

      {/* ================= RESULT ================= */}
      {stage === 'result' && result && (
        <>
          <div className="card center">
            <h1>🏁 Game Selesai</h1>
            <p>{result.message}</p>
            {gameType === 'undercover' && wordPair && <p className="small">Kata Civilian: <b>{wordPair[0]}</b> | Kata Undercover: <b>{wordPair[1]}</b></p>}
            {saving && <p className="small">Menyimpan hasil ke Supabase…</p>}
          </div>
          <div className="card">
            <h3>Peran Semua Pemain</h3>
            <div className="player-list">
              {players.map((p, i) => (
                <div key={i} className={`player-row ${p.alive ? '' : 'dead'}`}>
                  <span className="pname">{p.name}</span>
                  <span className={`tag ${p.role.toLowerCase().replace(/[^a-z]/g, '')}`}>{p.role}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="btn-row">
            <button className="btn good" onClick={restart}>Main Lagi</button>
            <button className="btn ghost" onClick={() => router.push('/')}>Menu Utama</button>
          </div>
        </>
      )}
    </>
  );
}

function RevealCard({ gameType, player: p, players, wordPair, index, total, onNext }) {
  let content;
  if (gameType === 'werewolf') {
    const info = WEREWOLF_ROLE_INFO[p.role];
    const teammates = p.role === 'Werewolf' ? players.filter((x) => x.role === 'Werewolf' && x.name !== p.name).map((x) => x.name) : [];
    const teamLabel = info.team === 'werewolf' ? 'Tim Werewolf' : (info.team === 'neutral' ? 'Netral' : 'Tim Warga');
    const teamTag = info.team === 'werewolf' ? 'werewolf' : (info.team === 'neutral' ? 'mrwhite' : 'villager');
    content = (
      <>
        <span className={`tag ${teamTag}`}>{teamLabel}</span>
        <div className="role-name">{p.role}</div>
        <p>{info.desc}</p>
        {teammates.length > 0 && <p className="small">Rekan werewolf: {teammates.join(', ')}</p>}
      </>
    );
  } else {
    const isUndercover = p.role === 'Undercover';
    const isMrWhite = p.role === 'Mr. White';
    const word = isMrWhite ? null : (isUndercover ? wordPair[1] : wordPair[0]);
    content = (
      <>
        <span className={`tag ${isMrWhite ? 'mrwhite' : (isUndercover ? 'undercover' : 'civilian')}`}>{p.role}</span>
        <div className="word">{word || '???'}</div>
        <p>{isMrWhite ? 'Kamu tidak dapat kata — dengarkan clue orang lain baik-baik!' : 'Ingat kata ini, jangan sampai bocor ke pemain lain.'}</p>
      </>
    );
  }

  return (
    <>
      <div className="card center">
        <p className="small">Serahkan device ke:</p>
        <h1>{p.name}</h1>
        <p className="small">({index + 1} dari {total})</p>
      </div>
      <div className="role-card">{content}</div>
      <p className="center small mt16">Pastikan hanya <b>{p.name}</b> yang melihat layar ini sebelum lanjut.</p>
      <button className="btn mt16" onClick={onNext}>Sudah Lihat, Lanjut ➜</button>
    </>
  );
}