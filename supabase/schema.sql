-- ============================================================
-- Werewolf & Undercover — Supabase schema
-- Jalankan di: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================

-- 1) PROFILES — melengkapi auth.users bawaan Supabase dengan username & avatar
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_color text default '#6C5CE7',
  created_at timestamptz default now()
);

-- Auto-buat row profiles setiap ada user baru daftar (trigger di auth.users)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, avatar_color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    (array['#6C5CE7','#00B894','#E17055','#0984E3','#D63031','#FDCB6E'])[floor(random()*6+1)]
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2) GAMES — satu baris per sesi permainan yang sudah selesai (riwayat)
create table if not exists public.games (
  id bigint generated always as identity primary key,
  room_code text not null,
  game_type text not null check (game_type in ('werewolf','undercover')),
  mode text not null default 'online' check (mode in ('online','local')),
  winner_side text,
  player_count int,
  started_at timestamptz default now(),
  ended_at timestamptz
);

-- 3) GAME_PLAYERS — hasil per pemain di satu game (dipakai untuk statistik)
create table if not exists public.game_players (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.games(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  role text not null,
  survived boolean not null default false,
  won boolean not null default false
);

create index if not exists idx_game_players_user on public.game_players(user_id);
create index if not exists idx_games_room on public.games(room_code);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Games & game_players: baca boleh siapa saja (leaderboard publik & guest history),
-- insert boleh siapa saja (termasuk guest tanpa login, karena user_id boleh null) —
-- ini simplifikasi untuk MVP belajar; untuk produksi sebaiknya insert lewat
-- Supabase Edge Function / server route yang tervalidasi, bukan langsung dari client.
create policy "Games are viewable by everyone"
  on public.games for select using (true);

create policy "Anyone can insert a finished game"
  on public.games for insert with check (true);

create policy "Anyone can update game result"
  on public.games for update using (true);

create policy "Game players are viewable by everyone"
  on public.game_players for select using (true);

create policy "Anyone can insert game player results"
  on public.game_players for insert with check (true);

-- ============================================================
-- REALTIME — opsional, kalau mau tabel games ikut ter-stream live
-- (state ruangan permainan sendiri kita broadcast langsung via
-- Supabase Realtime Broadcast channel dari client, bukan lewat tabel ini)
-- ============================================================
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_players;
