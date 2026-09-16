'use client';

import Link from 'next/link';
import Topbar from '../components/Topbar';

export default function HomePage() {
  return (
    <>
      <Topbar />

      <div className="card center">
        <h1>Party Games</h1>
        <p>Pilih permainan yang mau dimainkan, lalu pilih cara mainnya.</p>
      </div>

      {/* ============ WEREWOLF ============ */}
      <div className="card game-card werewolf-card">
        <div className="game-card-head">
          <span className="game-emoji">🐺</span>
          <div>
            <h2>Werewolf</h2>
            <p className="small">Warga vs Werewolf. Malam mencekam, siang penuh tuduhan.</p>
          </div>
        </div>
        <div className="btn-row mt16">
          <Link className="btn" href="/online?mode=create&game=werewolf">Buat Room Online</Link>
          <Link className="btn secondary" href="/online?mode=join&game=werewolf">Gabung Room</Link>
        </div>
        <Link className="btn ghost mt8" href="/local?game=werewolf">📱 Pass-and-Play (1 Device)</Link>
      </div>

      {/* ============ UNDERCOVER ============ */}
      <div className="card game-card undercover-card">
        <div className="game-card-head">
          <span className="game-emoji">🕵️</span>
          <div>
            <h2>Undercover</h2>
            <p className="small">Civilian vs Undercover vs Mr. White. Tebak siapa yang beda kata.</p>
          </div>
        </div>
        <div className="btn-row mt16">
          <Link className="btn" href="/online?mode=create&game=undercover">Buat Room Online</Link>
          <Link className="btn secondary" href="/online?mode=join&game=undercover">Gabung Room</Link>
        </div>
        <Link className="btn ghost mt8" href="/local?game=undercover">📱 Pass-and-Play (1 Device)</Link>
      </div>

      <div className="card center">
        <Link className="btn ghost" href="/profile">📊 Statistik &amp; Leaderboard</Link>
      </div>
    </>
  );
}