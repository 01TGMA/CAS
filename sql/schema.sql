-- Smart Attendance System — Core Schema
-- Run this in Supabase SQL Editor after project creation

create extension if not exists "pgcrypto";

-- Profile extends auth.users with role info
create table profiles (
  id uuid references auth.users primary key,
  full_name text,
  role text check (role in ('student','lecturer')) not null,
  student_id text,
  created_at timestamp with time zone default now()
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  lecturer_id uuid references profiles(id),
  name text not null,
  code text not null,
  eligibility_threshold numeric default 75,
  created_at timestamp with time zone default now()
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id),
  course_id uuid references courses(id),
  created_at timestamp with time zone default now(),
  unique(student_id, course_id)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id),
  qr_token uuid default gen_random_uuid(),
  mark_value numeric default 1,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  student_id uuid references profiles(id),
  marked_at timestamp with time zone default now(),
  ip_address text,
  unique(session_id, student_id)
);

-- Auto-create a profile row when a new auth user signs up
-- (role gets set separately during registration flow)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'role');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
