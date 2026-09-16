'use client';

// useRoomChannel — realtime multiplayer engine built on Supabase Realtime Broadcast.
//
// Architecture: the player who *creates* the room becomes the "host". The host's
// browser tab runs all game logic (role assignment, night resolution, vote tallying,
// win checks) and broadcasts the resulting PUBLIC state to everyone in the channel.
// Other players broadcast small "action" messages (join, vote, night action, clue)
// that only the host reacts to. Private info (each player's role/word) is also sent
// over the same broadcast channel, tagged with the target clientId — every client
// receives it but only applies the payload addressed to itself.
//
// ⚠️ MVP caveat: because Realtime Broadcast messages are visible to every subscriber
// of the channel, a technically savvy player could open devtools and read everyone's
// role from the network tab. For a private/friends game this is an acceptable
// trade-off (mirrors "don't peek" social trust), but it is NOT cryptographically
// private. See README for how to harden this later (Realtime Authorization /
// per-user private channels, or a small server relay).

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import {
  buildWerewolfRoles, WEREWOLF_ROLE_INFO, werewolfCheckWinner,
  buildUndercoverRoles, undercoverCheckWinner, pickWordPair, mostCommon, didWin,
} from './gameLogic';
import { saveGameResult } from './saveGame';

function getClientId() {
  if (typeof window === 'undefined') return null;
  let id = sessionStorage.getItem('pg_client_id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('pg_client_id', id);
  }
  return id;
}

export function useRoomChannel(code) {
  const clientId = useRef(getClientId());
  const channelRef = useRef(null);
  const isHostRef = useRef(false);
  const roomRef = useRef(null); // authoritative state, only meaningful on host

  const [room, setRoom] = useState(null);   // public state (players, phase, round, logs)
  const [myRole, setMyRole] = useState(null);
  const [seerResult, setSeerResult] = useState(null);
  const [ended, setEnded] = useState(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [mrWhiteChance, setMrWhiteChance] = useState(false);

  const broadcastState = useCallback(() => {
    const r = roomRef.current;
    if (!r || !channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast', event: 'state',
      payload: {
        code: r.code, gameType: r.gameType, phase: r.phase, round: r.round,
        players: r.players.map((p) => ({ clientId: p.clientId, name: p.name, alive: p.alive, avatarColor: p.avatarColor, isHost: p.clientId === r.hostClientId })),
        logs: r.logs.slice(-40),
        hostClientId: r.hostClientId,
      },
    });
  }, []);

  const log = (r, text) => r.logs.push({ text, t: Date.now() });

  // ---------------- HOST-SIDE GAME ENGINE ----------------
  const sendRoleTo = useCallback((targetClientId, payload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'role', payload: { clientId: targetClientId, ...payload } });
  }, []);

  const startGame = useCallback((options = {}) => {
    const r = roomRef.current;
    if (!r) return;
    const n = r.players.length;
    if (n < 3) { channelRef.current?.send({ type: 'broadcast', event: 'error', payload: { clientId: r.hostClientId, error: 'Minimal 3 pemain untuk mulai.' } }); return; }

    if (r.gameType === 'werewolf') {
      const roles = buildWerewolfRoles(n);
      r.players.forEach((p, i) => { p.role = roles[i]; p.alive = true; });
      r.phase = 'night'; r.round = 1; r.nightActions = {};
      log(r, 'Malam pertama dimulai. Werewolf, Seer, dan Doctor beraksi diam-diam.');
    } else {
      const roles = buildUndercoverRoles(n, options.mrWhite !== false);
      r.wordPair = pickWordPair();
      r.players.forEach((p, i) => { p.role = roles[i]; p.alive = true; });
      r.phase = 'discuss'; r.round = 1; r.votes = {};
      log(r, 'Kata rahasia sudah dibagikan. Giliran bicara dimulai!');
    }

    r.players.forEach((p) => {
      if (r.gameType === 'werewolf') {
        const info = WEREWOLF_ROLE_INFO[p.role];
        const teammates = p.role === 'Werewolf' ? r.players.filter((x) => x.role === 'Werewolf' && x.clientId !== p.clientId).map((x) => x.name) : [];
        sendRoleTo(p.clientId, { role: p.role, team: info.team, desc: info.desc, teammates });
      } else {
        const isUndercover = p.role === 'Undercover';
        const isMrWhite = p.role === 'Mr. White';
        sendRoleTo(p.clientId, { role: p.role, word: isMrWhite ? null : (isUndercover ? r.wordPair[1] : r.wordPair[0]) });
      }
    });

    broadcastState();
  }, [broadcastState, sendRoleTo]);

  const resolveNight = useCallback((r) => {
    const wolfVotes = Object.values(r.nightActions).filter((a) => a.role === 'Werewolf').map((a) => a.targetClientId);
    const protectAction = Object.values(r.nightActions).find((a) => a.role === 'Doctor' || a.role === 'Guard');
    const victimId = mostCommon(wolfVotes);
    const saved = protectAction && protectAction.targetClientId === victimId;

    let victimName = null;
    if (victimId && !saved) {
      const victim = r.players.find((p) => p.clientId === victimId);
      if (victim) { victim.alive = false; victimName = victim.name; }
    }
    r.nightActions = {};
    r.phase = 'day';
    log(r, victimName ? `Pagi datang... ${victimName} ditemukan tewas.` : 'Pagi datang... tidak ada korban malam ini!');

    const winner = werewolfCheckWinner(r.players);
    broadcastState();
    if (winner) return endGame(winner, winner === 'werewolf' ? 'Werewolf menang!' : 'Warga menang!');
  }, [broadcastState]);

  const maybeResolveNight = useCallback((r) => {
    const werewolfIds = r.players.filter((p) => p.alive && p.role === 'Werewolf').map((p) => p.clientId);
    const werewolvesActed = werewolfIds.every((id) => r.nightActions[id]);
    const seerAlive = r.players.some((p) => p.alive && p.role === 'Seer');
    const doctorAlive = r.players.some((p) => p.alive && (p.role === 'Doctor' || p.role === 'Guard'));
    const seerActed = !seerAlive || r.players.some((p) => p.role === 'Seer' && r.nightActions[p.clientId]);
    const doctorActed = !doctorAlive || r.players.some((p) => (p.role === 'Doctor' || p.role === 'Guard') && r.nightActions[p.clientId]);

    Object.entries(r.nightActions).forEach(([cid, action]) => {
      if (action.role === 'Seer' && !action._told) {
        const target = r.players.find((p) => p.clientId === action.targetClientId);
        if (target) {
          channelRef.current?.send({ type: 'broadcast', event: 'seerResult', payload: { clientId: cid, targetName: target.name, isWerewolf: target.role === 'Werewolf' } });
          action._told = true;
        }
      }
    });

    if (werewolvesActed && seerActed && doctorActed) resolveNight(r);
  }, [resolveNight]);

  const resolveVote = useCallback((r) => {
    const tally = {};
    Object.values(r.votes).forEach((t) => { if (t) tally[t] = (tally[t] || 0) + 1; });
    let eliminatedId = null, max = 0, tie = false;
    Object.entries(tally).forEach(([id, c]) => {
      if (c > max) { max = c; eliminatedId = id; tie = false; }
      else if (c === max) tie = true;
    });
    r.votes = {};

    if (eliminatedId && !tie) {
      const p = r.players.find((x) => x.clientId === eliminatedId);
      if (p) {
        p.alive = false;
        log(r, `${p.name} dieliminasi oleh voting. Perannya: ${p.role}.`);
        if (r.gameType === 'undercover' && p.role === 'Mr. White') {
          channelRef.current?.send({ type: 'broadcast', event: 'mrWhiteChance', payload: { clientId: p.clientId } });
        }
      }
    } else {
      log(r, 'Voting seri / tidak ada yang dieliminasi.');
    }

    const winner = r.gameType === 'werewolf' ? werewolfCheckWinner(r.players) : undercoverCheckWinner(r.players);
    if (winner) {
      return endGame(winner, r.gameType === 'werewolf'
        ? (winner === 'werewolf' ? 'Werewolf menang!' : 'Warga menang!')
        : (winner === 'civilian' ? 'Civilian menang!' : 'Undercover menang!'));
    }

    r.round += 1;
    if (r.gameType === 'werewolf') { r.phase = 'night'; r.nightActions = {}; log(r, `Malam ke-${r.round} dimulai.`); }
    else { r.phase = 'discuss'; log(r, `Ronde bicara ke-${r.round} dimulai.`); }
    broadcastState();
  }, [broadcastState]);

  function endGame(winnerSide, message) {
    const r = roomRef.current;
    r.phase = 'ended';
    log(r, `GAME SELESAI — ${message}`);
    const players = r.players.map((p) => ({
      userId: p.userId, displayName: p.name, role: p.role, survived: p.alive,
      won: didWin(r.gameType, p.role, winnerSide),
    }));
    saveGameResult({ roomCode: r.code, gameType: r.gameType, mode: 'online', winnerSide, players });
    channelRef.current?.send({
      type: 'broadcast', event: 'ended',
      payload: {
        message, winnerSide,
        players: r.players.map((p) => ({ name: p.name, role: p.role, alive: p.alive, won: didWin(r.gameType, p.role, winnerSide) })),
        word: r.gameType === 'undercover' ? { civilian: r.wordPair[0], undercover: r.wordPair[1] } : null,
      },
    });
    broadcastState();
  }

  const handleAction = useCallback((msg) => {
    const r = roomRef.current;
    if (!r) return;
    const { clientId: cid, type, payload } = msg;

    if (type === 'join') {
      if (r.phase !== 'lobby') return;
      if (r.players.some((p) => p.clientId === cid)) return;
      if (r.players.length >= 16) return;
      r.players.push({ clientId: cid, userId: payload.userId || null, name: payload.name, role: null, alive: true, avatarColor: payload.avatarColor || '#00B894' });
      log(r, `${payload.name} bergabung.`);
      broadcastState();
      return;
    }
    if (type === 'leave') {
      const idx = r.players.findIndex((p) => p.clientId === cid);
      if (idx >= 0) { const [p] = r.players.splice(idx, 1); log(r, `${p.name} keluar dari room.`); }
      if (cid === r.hostClientId && r.players.length) r.hostClientId = r.players[0].clientId;
      broadcastState();
      return;
    }
    const me = r.players.find((p) => p.clientId === cid);
    if (!me) return;

    if (type === 'start' && cid === r.hostClientId) return startGame(payload);
    if (type === 'nightAction' && r.phase === 'night' && me.alive && me.role === payload.role) {
      r.nightActions[cid] = { role: payload.role, targetClientId: payload.targetClientId };
      maybeResolveNight(r);
      return;
    }
    if (type === 'vote' && r.phase === 'vote' && me.alive) {
      r.votes[cid] = payload.targetClientId;
      const aliveCount = r.players.filter((p) => p.alive).length;
      if (Object.keys(r.votes).length >= aliveCount) resolveVote(r);
      return;
    }
    if (type === 'toVote' && cid === r.hostClientId && ['day', 'discuss'].includes(r.phase)) {
      r.phase = 'vote'; r.votes = {};
      log(r, 'Waktunya voting!');
      broadcastState();
      return;
    }
    if (type === 'clue' && r.gameType === 'undercover' && r.phase === 'discuss' && me.alive) {
      log(r, `${me.name}: ${payload.text}`);
      broadcastState();
      return;
    }
    if (type === 'mrWhiteGuess' && r.gameType === 'undercover' && me.role === 'Mr. White') {
      const correct = r.wordPair && payload.guess.trim().toLowerCase() === r.wordPair[0].trim().toLowerCase();
      if (correct) endGame('undercover', `Mr. White (${me.name}) menebak kata dengan benar: "${payload.guess}" dan MENANG seketika!`);
      else { log(r, `${me.name} (Mr. White) menebak "${payload.guess}" — salah.`); broadcastState(); }
      return;
    }
  }, [startGame, maybeResolveNight, resolveVote]);

  // ---------------- CONNECT ----------------
  useEffect(() => {
    if (!code) return;
    const channel = supabase.channel(`room-${code}`, { config: { broadcast: { self: true }, presence: { key: clientId.current } } });
    channelRef.current = channel;

    channel.on('broadcast', { event: 'state' }, ({ payload }) => setRoom(payload));
    channel.on('broadcast', { event: 'role' }, ({ payload }) => {
      if (payload.clientId === clientId.current) { setMyRole(payload); setSeerResult(null); }
    });
    channel.on('broadcast', { event: 'seerResult' }, ({ payload }) => {
      if (payload.clientId === clientId.current) setSeerResult(payload);
    });
    channel.on('broadcast', { event: 'ended' }, ({ payload }) => setEnded(payload));
    channel.on('broadcast', { event: 'mrWhiteChance' }, ({ payload }) => {
      if (payload.clientId === clientId.current) setMrWhiteChance(true);
    });
    channel.on('broadcast', { event: 'error' }, ({ payload }) => setError(payload.error));
    channel.on('broadcast', { event: 'action' }, ({ payload }) => {
      if (isHostRef.current) handleAction(payload);
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') setConnected(true);
    });

    return () => { supabase.removeChannel(channel); channelRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ---------------- PUBLIC API ----------------
  const becomeHost = useCallback((gameType, name, userId, avatarColor) => {
    isHostRef.current = true;
    roomRef.current = {
      code, gameType, hostClientId: clientId.current, phase: 'lobby', round: 1,
      players: [{ clientId: clientId.current, userId: userId || null, name, role: null, alive: true, avatarColor: avatarColor || '#6C5CE7' }],
      nightActions: {}, votes: {}, logs: [], wordPair: null,
    };
    log(roomRef.current, `${name} membuat room.`);
    // small delay so channel is subscribed before first broadcast
    setTimeout(broadcastState, 150);
  }, [code, broadcastState]);

  const sendAction = useCallback((type, payload = {}) => {
    channelRef.current?.send({ type: 'broadcast', event: 'action', payload: { clientId: clientId.current, type, payload } });
  }, []);

  const joinAsPlayer = useCallback((name, userId, avatarColor) => {
    setTimeout(() => sendAction('join', { name, userId, avatarColor }), 200);
  }, [sendAction]);

  return {
    clientId: clientId.current, room, myRole, seerResult, ended, error, connected, mrWhiteChance,
    isHost: room?.hostClientId === clientId.current,
    becomeHost, joinAsPlayer, sendAction,
  };
}