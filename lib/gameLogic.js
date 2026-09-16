// gameLogic.js — pure functions, no side effects. Used by both the online (Realtime)
// room host and the local pass-and-play mode, so the rules stay identical everywhere.

export const WEREWOLF_ROLE_INFO = {
  Werewolf: {
    team: 'werewolf',
    desc: 'Setiap malam, diam-diam sepakati satu korban bersama werewolf lain. Berpura-puralah jadi warga biasa di siang hari.',
  },
  Seer: {
    team: 'villager',
    desc: 'Setiap malam, intip peran satu pemain untuk mengetahui apakah dia Werewolf atau bukan.',
  },
  Doctor: {
    team: 'villager',
    desc: 'Setiap malam, pilih satu pemain (boleh diri sendiri) untuk dilindungi dari serangan werewolf.',
  },
  Guard: {
    team: 'villager',
    desc: 'Setiap malam, pilih satu pemain untuk dikawal. Kalau werewolf menyerang orang itu malam ini, dia tetap hidup.',
  },
  Hunter: {
    team: 'villager',
    desc: 'Jika kamu dieliminasi (oleh werewolf atau voting), kamu boleh langsung "menembak" satu pemain lain untuk ikut gugur.',
  },
  Villager: {
    team: 'villager',
    desc: 'Tidak punya kekuatan khusus. Gunakan logika & diskusi siang hari untuk menemukan werewolf.',
  },
  Witch: {
    team: 'villager',
    desc: 'Punya 2 ramuan sepanjang game: 1 ramuan bunuh & 1 ramuan selamatkan. Boleh dipakai kapan saja di malam hari, masing-masing cuma sekali.',
  },
  Cupid: {
    team: 'villager',
    desc: 'Di malam pertama saja, pilih 2 pemain jadi sepasang kekasih. Kalau salah satu gugur, pasangannya ikut gugur karena patah hati.',
  },
  Tanner: {
    team: 'neutral',
    desc: 'Tidak berpihak ke siapa pun. Menang SENDIRIAN kalau berhasil dieliminasi lewat voting siang (bukan dibunuh werewolf).',
  },
};

// Roles the host can toggle on/off for pass-and-play (selain Werewolf yang jumlahnya diatur terpisah).
export const WEREWOLF_TOGGLE_ROLES = ['Seer', 'Doctor', 'Guard', 'Witch', 'Hunter', 'Cupid', 'Tanner'];

// Build a werewolf role list from a host-chosen config instead of the fixed auto-ratio.
// config = { werewolfCount: number, seer: bool, doctor: bool, witch: bool, hunter: bool, cupid: bool, tanner: bool }
export function buildWerewolfRolesFromConfig(config, playerCount) {
  const roles = [];
  const wolfCount = Math.max(1, Math.min(config.werewolfCount || 1, playerCount - 1));
  for (let i = 0; i < wolfCount; i++) roles.push('Werewolf');
  WEREWOLF_TOGGLE_ROLES.forEach((role) => {
    if (config[role.toLowerCase()] && roles.length < playerCount) roles.push(role);
  });
  while (roles.length < playerCount) roles.push('Villager');
  return shuffle(roles).slice(0, playerCount);
}

export const WORD_PAIRS = [
  ['Kopi', 'Teh'], ['Kucing', 'Harimau'], ['Nasi Goreng', 'Mie Goreng'], ['Dokter', 'Perawat'],
  ['Gitar', 'Biola'], ['Pantai', 'Danau'], ['Hujan', 'Salju'], ['Sepak Bola', 'Futsal'],
  ['Handphone', 'Tablet'], ['Guru', 'Dosen'], ['Motor', 'Sepeda'], ['Bandara', 'Stasiun'],
  ['Es Krim', 'Yogurt'], ['Batik', 'Tenun'], ['Ayam Goreng', 'Ayam Bakar'], ['Novel', 'Komik'],
  ['Piano', 'Keyboard'], ['Rendang', 'Gulai'], ['Bioskop', 'Teater'], ['Ojek Online', 'Taksi'],
];

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildWerewolfRoles(n) {
  const wolves = Math.max(1, Math.round(n / 4));
  const roles = [];
  for (let i = 0; i < wolves; i++) roles.push('Werewolf');
  roles.push('Seer');
  if (n >= 5) roles.push('Doctor');
  if (n >= 7) roles.push('Hunter');
  while (roles.length < n) roles.push('Villager');
  return shuffle(roles).slice(0, n);
}

export function werewolfCheckWinner(players) {
  const alive = players.filter((p) => p.alive);
  const aliveWolves = alive.filter((p) => WEREWOLF_ROLE_INFO[p.role].team === 'werewolf').length;
  const aliveVillagers = alive.length - aliveWolves;
  if (aliveWolves === 0) return 'villager';
  if (aliveWolves >= aliveVillagers) return 'werewolf';
  return null;
}

export function buildUndercoverRoles(n, includeMrWhite = true) {
  const undercoverCount = n <= 5 ? 1 : Math.max(1, Math.round(n / 5));
  const mrWhiteCount = includeMrWhite && n >= 4 ? 1 : 0;
  const roles = [];
  for (let i = 0; i < undercoverCount; i++) roles.push('Undercover');
  for (let i = 0; i < mrWhiteCount; i++) roles.push('Mr. White');
  while (roles.length < n) roles.push('Civilian');
  return shuffle(roles).slice(0, n);
}

export function undercoverCheckWinner(players) {
  const alive = players.filter((p) => p.alive);
  const aliveBad = alive.filter((p) => p.role === 'Undercover' || p.role === 'Mr. White').length;
  const aliveGood = alive.length - aliveBad;
  if (aliveBad === 0) return 'civilian';
  if (aliveBad >= aliveGood) return 'undercover';
  return null;
}

export function pickWordPair() {
  return WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
}

export function didWin(gameType, role, winnerSide) {
  if (gameType === 'werewolf') return WEREWOLF_ROLE_INFO[role]?.team === winnerSide;
  const isBad = role === 'Undercover' || role === 'Mr. White';
  return winnerSide === 'civilian' ? !isBad : isBad;
}

export function newRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function mostCommon(arr) {
  const clean = arr.filter(Boolean);
  if (clean.length === 0) return null;
  const tally = {};
  clean.forEach((v) => { tally[v] = (tally[v] || 0) + 1; });
  return Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
}