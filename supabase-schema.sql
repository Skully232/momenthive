-- supabase-schema.sql
-- MomentHive — Supabase Postgres schema (Phase 1 MVP)
-- Run this entire file in the Supabase project SQL Editor:
-- https://app.supabase.com/project/gpvktzfyjynifalikztx/sql
--
-- ⚠️ SECURITY NOTE: RLS policies below are intentionally wide-open for MVP
-- testing (equivalent to the original open Firestore rules). MUST be
-- tightened with real access control before charging paying partners.

-- ─────────────────────────────────────────────
-- 1. events
-- ─────────────────────────────────────────────
create table if not exists events (
  id                text primary key,          -- format EVT-YYYYMMDD-XXXX
  name              text not null,
  type              text not null,
  date              date not null,
  organizer_name    text not null,
  organizer_phone   text not null,
  organizer_email   text not null,
  password          text,
  max_photos        integer default 500,
  allow_video       boolean default true,
  logo_url          text,
  primary_color     text default '#7C3AED',
  album_url         text,
  created_at        timestamptz default now(),
  status            text default 'active',
  photo_count       integer default 0,
  guest_count       integer default 0,
  -- Sponsor fields stored directly on the event record for simplicity
  sponsor_name      text,
  sponsor_logo_url  text
);

-- ─────────────────────────────────────────────
-- 2. guests
-- ─────────────────────────────────────────────
create table if not exists guests (
  id          uuid primary key default gen_random_uuid(),
  event_id    text references events(id) on delete cascade,
  name        text not null,
  phone       text not null,
  joined_at   timestamptz default now(),
  photo_count integer default 0,
  unique(event_id, phone)
);

-- ─────────────────────────────────────────────
-- 3. photos
-- ─────────────────────────────────────────────
create table if not exists photos (
  id             uuid primary key default gen_random_uuid(),
  event_id       text references events(id) on delete cascade,
  url            text not null,
  thumbnail_url  text not null,
  guest_name     text,
  guest_phone    text,
  uploaded_at    timestamptz default now(),
  file_type      text check (file_type in ('image', 'video')),
  file_size      integer,
  likes          integer default 0,
  downloads      integer default 0,
  flagged        boolean default false,
  deleted        boolean default false
);

-- ─────────────────────────────────────────────
-- 4. sponsors  (optional future table)
-- ─────────────────────────────────────────────
create table if not exists sponsors (
  id         uuid primary key default gen_random_uuid(),
  event_id   text references events(id) on delete cascade,
  name       text not null,
  logo_url   text not null,
  added_at   timestamptz default now()
);

-- ─────────────────────────────────────────────
-- 5. Row Level Security
-- ─────────────────────────────────────────────
alter table events  enable row level security;
alter table guests  enable row level security;
alter table photos  enable row level security;
alter table sponsors enable row level security;

-- events — public read/insert/update (MVP open posture)
drop policy if exists "public read events"   on events;
drop policy if exists "public insert events" on events;
drop policy if exists "public update events" on events;

create policy "public read events"   on events for select using (true);
create policy "public insert events" on events for insert with check (true);
create policy "public update events" on events for update using (true);

-- guests — public read/insert
drop policy if exists "public read guests"   on guests;
drop policy if exists "public insert guests" on guests;
drop policy if exists "public update guests" on guests;

create policy "public read guests"   on guests for select using (true);
create policy "public insert guests" on guests for insert with check (true);
create policy "public update guests" on guests for update using (true);

-- photos — public read/insert/update
drop policy if exists "public read photos"   on photos;
drop policy if exists "public insert photos" on photos;
drop policy if exists "public update photos" on photos;
drop policy if exists "public delete photos" on photos;

create policy "public read photos"   on photos for select using (true);
create policy "public insert photos" on photos for insert with check (true);
create policy "public update photos" on photos for update using (true);
create policy "public delete photos" on photos for delete using (true);

-- sponsors — public read/insert
drop policy if exists "public read sponsors"   on sponsors;
drop policy if exists "public insert sponsors" on sponsors;

create policy "public read sponsors"   on sponsors for select using (true);
create policy "public insert sponsors" on sponsors for insert with check (true);
