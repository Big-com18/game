# 🐺 Werewolf & Undercover — Next.js + Supabase

Versi Next.js dari game party Werewolf & Undercover, pakai **Supabase** sebagai database (Postgres) + Auth + Realtime — cocok buat belajar full-stack modern tanpa perlu ngurus server sendiri.

## Tech Stack

- **Next.js 14** (App Router) — frontend & routing
- **Supabase Auth** — login/daftar (pakai email + password)
- **Supabase Postgres** — simpan profil user, riwayat game, statistik menang/kalah
- **Supabase Realtime (Broadcast)** — sinkronisasi room game online antar pemain, tanpa server backend custom

## 🚀 Setup Awal

### 1. Bikin project Supabase (gratis)

1. Daftar/login di [supabase.com](https://supabase.com) → **New Project**.
2. Tunggu project selesai provisioning (~1-2 menit).
3. Buka **Project Settings → API**, catat:
   - `Project URL`
   - `anon public` key

### 2. Jalankan schema database

1. Di dashboard Supabase, buka **SQL Editor → New query**.
2. Copy-paste seluruh isi file `supabase/schema.sql` dari project ini, lalu **Run**.
3. Ini akan membuat tabel `profiles`, `games`, `game_players`, trigger auto-create profile saat user daftar, dan Row Level Security policies.
4. Cek di **Table Editor** — harus muncul 3 tabel tadi.

### 3. Aktifkan Realtime (untuk mode online)

1. Buka **Project Settings → Realtime** (atau di menu Database → Replication).
2. Realtime Broadcast tidak perlu diaktifkan manual per-tabel (kita pakai channel broadcast, bukan postgres changes) — cukup pastikan Realtime service project kamu aktif (default sudah aktif di semua project baru).

### 4. Setup project lokal

```bash
cd party-games-next
npm install
cp .env.local.example .env.local
```

Edit `.env.local`, isi dengan URL & anon key dari langkah 1:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### 5. Jalankan

```bash
npm run dev
```

Buka `http://localhost:3000`.

## Struktur Project

```
party-games-next/
├── app/
│   ├── page.js                # Home
│   ├── auth/page.js            # Login / Daftar (Supabase Auth)
│   ├── online/page.js           # Buat / gabung room online
│   ├── online/[code]/page.js     # Room lobby + gameplay realtime
│   ├── local/page.js             # Mode pass-and-play (1 device)
│   ├── profile/page.js            # Statistik & riwayat
│   ├── layout.js, globals.css
├── components/Topbar.js
├── lib/
│   ├── supabaseClient.js         # Supabase client singleton
│   ├── AuthProvider.js            # Context: user, profile, guest name
│   ├── gameLogic.js                # Role assignment & win-condition (pure functions)
│   ├── useRoomChannel.js            # Engine realtime multiplayer (Supabase Broadcast)
│   └── saveGame.js                   # Simpan hasil game ke tabel games/game_players
└── supabase/schema.sql                # Jalankan ini di SQL Editor Supabase
```

## Cara Kerja Mode Online (penting untuk dipahami)

Next.js di sini **tidak punya backend server custom** — semua logic realtime jalan di browser via **Supabase Realtime Broadcast channel**:

- Pemain yang **membuat room** jadi "host": browser-nya yang menjalankan semua logic game (assign role, resolve malam, hitung vote, cek menang) — lihat `lib/useRoomChannel.js`.
- Pemain lain mengirim "action" (vote, night action, clue) lewat broadcast channel; hanya host yang memprosesnya, lalu host broadcast ulang state terbaru ke semua orang.
- Begitu game selesai, host menulis hasil akhir ke tabel `games` & `game_players` di Supabase lewat `lib/saveGame.js`.

**⚠️ Batasan yang perlu kamu tahu (bagus buat bahan belajar juga):**
- Karena broadcast channel terlihat oleh semua subscriber, secara teknis peran orang lain bisa "diintip" lewat DevTools Network tab oleh pemain yang curang. Untuk main santai sama teman ini oke (mengandalkan kepercayaan, sama seperti aturan "jangan mengintip kartu orang lain"), tapi secara kriptografis belum privat.
- Kalau host keluar/tutup tab di tengah game, game jadi macet (role host otomatis pindah ke pemain lain saat leave terdeteksi, tapi kalau tab-nya crash tanpa sempat kirim event "leave", tidak ada failover otomatis).
- Untuk produksi yang lebih serius: pindahkan logic host ke **Supabase Edge Function** atau tambahkan **Realtime Authorization** (private per-user channel) supaya role benar-benar rahasia dan ada satu sumber kebenaran server-side.

## Auth

- Pakai Supabase Auth berbasis **email + password**.
- Saat daftar, trigger SQL otomatis bikin row di tabel `profiles` dengan username & warna avatar random.
- Bisa juga main sebagai **Tamu** (nama disimpan di localStorage) tanpa akun — tapi riwayat/statistiknya tidak akan tersimpan permanen ke akun manapun.

## Deploy

Paling gampang pakai **Vercel** (dibuat oleh tim yang sama dengan Next.js):

1. Push project ini ke GitHub.
2. Import repo di [vercel.com](https://vercel.com).
3. Di **Environment Variables**, tambahkan `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy. Supabase project kamu tetap jalan terpisah (sebagai backend-as-a-service), jadi tidak perlu server tambahan.

## Ide Pengembangan Lanjut

- Tambah role lain (Witch, Cupid untuk Werewolf).
- Timer otomatis per giliran clue di Undercover.
- Presence indicator (pemain online/offline) pakai Supabase Realtime Presence (sudah disiapkan config-nya di `useRoomChannel.js`, tinggal dikembangkan).
- Ganti host-authoritative broadcast dengan Supabase Edge Function agar role benar-benar rahasia dari client lain.
