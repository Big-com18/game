'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Topbar from '../../components/Topbar';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthProvider';

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    loadLeaderboard();
    if (user) loadPersonal(user.id);
  }, [user]);

  async function loadLeaderboard() {
    const { data } = await supabase.from('leaderboard').select('*').limit(10);
    setLeaderboard(data || []);
  }

  async function loadPersonal(userId) {
    const { data: gp } = await supabase
      .from('game_players')
      .select('role, survived, won, games(game_type, mode, started_at, winner_side)')
      .eq('user_id', userId)
      .order('id', { ascending: false })
      .limit(50);

    setHistory((gp || []).slice(0, 20));

    const totalGames = gp?.length || 0;
    const totalWins = (gp || []).filter((r) => r.won).length;
    const byRoleMap = {};
    (gp || []).forEach((r) => {
      if (!byRoleMap[r.role]) byRoleMap[r.role] = { role: r.role, timesPlayed: 0, wins: 0 };
      byRoleMap[r.role].timesPlayed += 1;
      if (r.won) byRoleMap[r.role].wins += 1;
    });
    setStats({
      totalGames, totalWins,
      byRole: Object.values(byRoleMap).sort((a, b) => b.timesPlayed - a.timesPlayed),
    });
  }

  return (
    <>
      <Topbar />
      {!loading && !user && (
        <div className="card center">
          <p>Login dulu untuk lihat statistik pribadi.</p>
          <button className="btn" onClick={() => router.push('/auth')}>Login / Daftar</button>
        </div>
      )}

      {user && (
        <>
          <div className="card">
            <h2>📊 Statistikmu</h2>
            {stats ? (
              <>
                <div className="stat-grid">
                  <div className="stat-box"><div className="num">{stats.totalGames}</div><div className="lbl">Total Main</div></div>
                  <div className="stat-box"><div className="num">{stats.totalWins}</div><div className="lbl">Menang</div></div>
                  <div className="stat-box"><div className="num">{stats.totalGames ? Math.round(100 * stats.totalWins / stats.totalGames) : 0}%</div><div className="lbl">Win Rate</div></div>
                </div>
                <h3 className="mt16">Per Role</h3>
                <div className="player-list">
                  {stats.byRole.length ? stats.byRole.map((r, i) => (
                    <div className="player-row" key={i}><span className="pname">{r.role}</span><span className="small">{r.wins}/{r.timesPlayed} menang</span></div>
                  )) : <p className="small">Belum ada data.</p>}
                </div>
              </>
            ) : <p className="small">Memuat…</p>}
          </div>

          <div className="card">
            <h2>🕓 Riwayat Terakhir</h2>
            <div className="player-list">
              {history.length ? history.map((h, i) => (
                <div className="player-row" key={i}>
                  <span className="pname">{h.games?.game_type === 'werewolf' ? '🐺' : '🕵️'} {h.role}</span>
                  <span className="small">{h.won ? '🏆 Menang' : 'Kalah'} • {h.games?.started_at ? new Date(h.games.started_at).toLocaleDateString('id-ID') : ''}</span>
                </div>
              )) : <p className="small">Belum ada riwayat.</p>}
            </div>
          </div>
        </>
      )}

      <div className="card">
        <h2>🏆 Leaderboard</h2>
        <div className="player-list">
          {leaderboard.length ? leaderboard.map((l, i) => (
            <div className="player-row" key={i}><span className="pname">#{i + 1} {l.username}</span><span className="small">{l.total_wins} menang ({l.win_rate}%)</span></div>
          )) : <p className="small">Belum ada data.</p>}
        </div>
      </div>
      <button className="btn ghost" onClick={() => router.push('/')}>Kembali</button>
    </>
  );
}
