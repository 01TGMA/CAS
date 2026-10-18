-- 001_fix_policies_and_signup.sql
-- Run ONCE in the Supabase SQL Editor, after schema.sql, policies.sql and functions.sql.
-- Safe to re-run: every statement is create-or-replace or drop-if-exists.

-- ---------------------------------------------------------------
-- 1. Break the courses <-> enrollments policy loop
--    "security definer" functions read the table without triggering its
--    policies, which is what stops the infinite recursion.
-- ---------------------------------------------------------------
create or replace function public.is_course_owner(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.courses
    where id = p_course_id and lecturer_id = auth.uid()
  );
$$;

create or replace function public.is_enrolled(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.enrollments
    where course_id = p_course_id and student_id = auth.uid()
  );
$$;

drop policy if exists "courses_select_enrolled_or_owner" on public.courses;
create policy "courses_select_enrolled_or_owner" on public.courses for select using (
  lecturer_id = auth.uid() or public.is_enrolled(id)
);

drop policy if exists "enrollments_select_own_or_lecturer" on public.enrollments;
create policy "enrollments_select_own_or_lecturer" on public.enrollments for select using (
  student_id = auth.uid() or public.is_course_owner(course_id)
);

-- ---------------------------------------------------------------
-- 2. Let lecturers see the profiles of students in their courses, and
--    students see the lecturer of a course they are enrolled in.
--    Without this the roster and the "lecturer name" joins come back empty.
-- ---------------------------------------------------------------
create or replace function public.teaches_student(p_student_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.student_id = p_student_id and c.lecturer_id = auth.uid()
  );
$$;

create or replace function public.has_lecturer(p_lecturer_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.courses c
    join public.enrollments e on e.course_id = c.id
    where c.lecturer_id = p_lecturer_id and e.student_id = auth.uid()
  );
$$;

drop policy if exists "profiles_select_lecturer_sees_roster" on public.profiles;
create policy "profiles_select_lecturer_sees_roster" on public.profiles
  for select using (public.teaches_student(id));

drop policy if exists "profiles_select_student_sees_lecturer" on public.profiles;
create policy "profiles_select_student_sees_lecturer" on public.profiles
  for select using (public.has_lecturer(id));

-- ---------------------------------------------------------------
-- 3. Signup trigger: copy student_id, and never trust the role from the browser.
--    Anything other than 'lecturer' becomes 'student'.
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role text;
begin
  v_role := case when new.raw_user_meta_data->>'role' = 'lecturer'
                 then 'lecturer' else 'student' end;

  insert into public.profiles (id, full_name, role, student_id)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    v_role,
    case when v_role = 'student'
         then nullif(trim(new.raw_user_meta_data->>'student_id'), '')
         else null end
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- 4. Lock role and student_id against edits made through the API.
--    Requests from the app carry a logged-in user (auth.uid() is not null)
--    and are blocked. Edits in the Supabase dashboard / SQL editor have no
--    JWT (auth.uid() is null) and are allowed, which is how you set an admin.
-- ---------------------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if auth.uid() is not null then
    if new.id is distinct from old.id then
      raise exception 'profile id cannot be changed';
    end if;
    if new.role is distinct from old.role then
      raise exception 'role cannot be changed';
    end if;
    if new.student_id is distinct from old.student_id then
      raise exception 'student_id cannot be changed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ---------------------------------------------------------------
-- 5. Cascade deletes so removing an auth user cleans up after itself.
--    DEV CONVENIENCE: deleting a lecturer also deletes their courses, sessions
--    and attendance. We will replace this with soft-delete later.
-- ---------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_id_fkey,
  add constraint profiles_id_fkey
    foreign key (id) references auth.users(id) on delete cascade;

alter table public.courses
  drop constraint if exists courses_lecturer_id_fkey,
  add constraint courses_lecturer_id_fkey
    foreign key (lecturer_id) references public.profiles(id) on delete cascade;

alter table public.enrollments
  drop constraint if exists enrollments_student_id_fkey,
  add constraint enrollments_student_id_fkey
    foreign key (student_id) references public.profiles(id) on delete cascade,
  drop constraint if exists enrollments_course_id_fkey,
  add constraint enrollments_course_id_fkey
    foreign key (course_id) references public.courses(id) on delete cascade;

alter table public.sessions
  drop constraint if exists sessions_course_id_fkey,
  add constraint sessions_course_id_fkey
    foreign key (course_id) references public.courses(id) on delete cascade;

alter table public.attendance_records
  drop constraint if exists attendance_records_session_id_fkey,
  add constraint attendance_records_session_id_fkey
    foreign key (session_id) references public.sessions(id) on delete cascade,
  drop constraint if exists attendance_records_student_id_fkey,
  add constraint attendance_records_student_id_fkey
    foreign key (student_id) references public.profiles(id) on delete cascade;