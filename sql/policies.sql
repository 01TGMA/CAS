-- Row Level Security Policies
-- Run AFTER schema.sql, once your Supabase project + auth is set up.
-- Enforces at the database level what client-side JS must never be trusted to enforce.

alter table profiles enable row level security;
alter table courses enable row level security;
alter table enrollments enable row level security;
alter table sessions enable row level security;
alter table attendance_records enable row level security;

-- PROFILES: users can read/update only their own profile
create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- COURSES: lecturers manage their own courses; enrolled students can read them
create policy "courses_select_enrolled_or_owner" on courses for select using (
  lecturer_id = auth.uid()
  or exists (select 1 from enrollments e where e.course_id = courses.id and e.student_id = auth.uid())
);
create policy "courses_insert_lecturer" on courses for insert with check (lecturer_id = auth.uid());
create policy "courses_update_owner" on courses for update using (lecturer_id = auth.uid());

-- ENROLLMENTS: students see their own; lecturers see rosters for their courses
create policy "enrollments_select_own_or_lecturer" on enrollments for select using (
  student_id = auth.uid()
  or exists (select 1 from courses c where c.id = enrollments.course_id and c.lecturer_id = auth.uid())
);
create policy "enrollments_insert_self" on enrollments for insert with check (student_id = auth.uid());

-- SESSIONS: visible to the owning lecturer and to enrolled students (to allow scanning)
create policy "sessions_select_owner_or_enrolled" on sessions for select using (
  exists (select 1 from courses c where c.id = sessions.course_id and c.lecturer_id = auth.uid())
  or exists (
    select 1 from enrollments e
    where e.course_id = sessions.course_id and e.student_id = auth.uid()
  )
);
create policy "sessions_insert_lecturer" on sessions for insert with check (
  exists (select 1 from courses c where c.id = sessions.course_id and c.lecturer_id = auth.uid())
);
create policy "sessions_update_lecturer" on sessions for update using (
  exists (select 1 from courses c where c.id = sessions.course_id and c.lecturer_id = auth.uid())
);

-- ATTENDANCE RECORDS: the core anti-fraud gate.
-- A student may only insert a record for themselves, for a session that:
--   1. belongs to a course they are enrolled in, AND
--   2. has not yet expired.
-- The unique(session_id, student_id) constraint (in schema.sql) blocks duplicate scans.
create policy "attendance_insert_enrolled_and_active" on attendance_records for insert with check (
  student_id = auth.uid()
  and exists (
    select 1 from sessions s
    join enrollments e on e.course_id = s.course_id
    where s.id = attendance_records.session_id
      and e.student_id = auth.uid()
      and s.expires_at > now()
  )
);

-- Students can see their own attendance; lecturers can see records for their sessions
create policy "attendance_select_own_or_lecturer" on attendance_records for select using (
  student_id = auth.uid()
  or exists (
    select 1 from sessions s
    join courses c on c.id = s.course_id
    where s.id = attendance_records.session_id and c.lecturer_id = auth.uid()
  )
);
