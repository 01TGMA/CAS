-- 004_enforce_qr_scan.sql
-- Run ONCE in the Supabase SQL Editor, after 001, 002 and 003.
--
-- Problem: enrolled students could read sessions.qr_token through the API, and the
-- attendance insert policy never checked it, so attendance could be marked without
-- scanning anything.
--
-- Fix:
--   1. The QR secret moves to its own table, readable only by the course's lecturer.
--   2. Students can no longer insert attendance rows directly.
--   3. The only way to mark attendance is mark_attendance(token), which checks the
--      token, expiry and enrollment on the server.
--
-- After running this, update Store.createSession and Store.markAttendance in
-- js/lib/store.js (see store_changes_004.js). Until then, creating a session and
-- scanning will fail.

-- ---------------------------------------------------------------
-- 1. Secret table, readable only by the lecturer who owns the session
-- ---------------------------------------------------------------
create table if not exists public.session_tokens (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  qr_token uuid not null unique default gen_random_uuid()
);

alter table public.session_tokens enable row level security;

create or replace function public.owns_session(p_session_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.sessions s
    join public.courses c on c.id = s.course_id
    where s.id = p_session_id and c.lecturer_id = auth.uid()
  );
$$;

drop policy if exists "session_tokens_select_owner" on public.session_tokens;
create policy "session_tokens_select_owner" on public.session_tokens
  for select using (public.owns_session(session_id));

-- No insert/update/delete policies: only the trigger below writes to this table.

-- Keep tokens of existing sessions (skipped automatically on a re-run).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sessions' and column_name = 'qr_token'
  ) then
    insert into public.session_tokens (session_id, qr_token)
    select id, qr_token from public.sessions
    on conflict (session_id) do nothing;
  end if;
end;
$$;

-- Every new session gets a token automatically.
create or replace function public.create_session_token()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.session_tokens (session_id) values (new.id)
  on conflict (session_id) do nothing;
  return new;
end;
$$;

drop trigger if exists sessions_create_token on public.sessions;
create trigger sessions_create_token
  after insert on public.sessions
  for each row execute function public.create_session_token();

-- Students can read sessions rows, so the secret must not live on that table.
alter table public.sessions drop column if exists qr_token;

-- ---------------------------------------------------------------
-- 2. No more direct attendance inserts from the app
-- ---------------------------------------------------------------
drop policy if exists "attendance_insert_enrolled_and_active" on public.attendance_records;

-- ---------------------------------------------------------------
-- 3. The only way to mark attendance
--    Returns {ok, reason, course_name}. Reasons match what the scan page already
--    handles: invalid, expired, duplicate, not_enrolled.
-- ---------------------------------------------------------------
create or replace function public.mark_attendance(p_qr_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_token uuid;
  v_session record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if public.my_role() is distinct from 'student' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  begin
    v_token := trim(p_qr_token)::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end;

  select s.id as session_id, s.course_id, s.expires_at, c.name as course_name
  into v_session
  from public.session_tokens t
  join public.sessions s on s.id = t.session_id
  join public.courses c on c.id = s.course_id
  where t.qr_token = v_token;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if v_session.expires_at is null or v_session.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if not exists (
    select 1 from public.enrollments e
    where e.course_id = v_session.course_id and e.student_id = auth.uid()
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_enrolled');
  end if;

  begin
    insert into public.attendance_records (session_id, student_id)
    values (v_session.session_id, auth.uid());
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'duplicate',
                              'course_name', v_session.course_name);
  end;

  return jsonb_build_object('ok', true, 'course_name', v_session.course_name);
end;
$$;

revoke all on function public.mark_attendance(text) from public, anon;
grant execute on function public.mark_attendance(text) to authenticated;