'use client';

import { supabase } from './supabaseClient';

// Called once, when a game ends, by whichever client is "host" (online mode)
// or by the moderator's device (local mode). Writes 1 row to `games` and
// 1 row per player to `game_players`.
export async function saveGameResult({ roomCode, gameType, mode, winnerSide, players }) {
  try {
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .insert({
        room_code: roomCode,
        game_type: gameType,
        mode,
        winner_side: winnerSide,
        player_count: players.length,
        ended_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (gameErr) throw gameErr;

    const rows = players.map((p) => ({
      game_id: game.id,
      user_id: p.userId || null,
      display_name: p.displayName,
      role: p.role,
      survived: !!p.survived,
      won: !!p.won,
    }));

    const { error: playersErr } = await supabase.from('game_players').insert(rows);
    if (playersErr) throw playersErr;

    return { ok: true };
  } catch (e) {
    console.error('saveGameResult failed:', e.message);
    return { ok: false, error: e.message };
  }
}
