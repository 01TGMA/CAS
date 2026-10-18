-- 003_departments_and_catalog.sql
-- Run ONCE in the Supabase SQL Editor, after 001 and 002. Safe to re-run.
--
-- Model:
--   catalog_courses  = the school's official course list (admin-owned)
--   courses          = a lecturer's offering of a catalog course (existing table;
--                      sessions, enrollments and attendance keep pointing at it)

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

create table if not exists public.catalog_courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  level int,
  semester text check (semester in ('first', 'second')),
  created_at timestamptz default now()
);

create table if not exists public.catalog_course_departments (
  catalog_course_id uuid not null references public.catalog_courses(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  primary key (catalog_course_id, department_id)
);

create index if not exists catalog_courses_title_trgm
  on public.catalog_courses using gin (title extensions.gin_trgm_ops);
create index if not exists catalog_courses_code_trgm
  on public.catalog_courses using gin (code extensions.gin_trgm_ops);

-- ---------------------------------------------------------------
-- 2. Columns on existing tables
-- ---------------------------------------------------------------
alter table public.profiles
  add column if not exists department_id uuid references public.departments(id);

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('student', 'lecturer', 'admin'));

-- Old test courses keep catalog_course_id = null and stay working.
alter table public.courses
  add column if not exists catalog_course_id uuid references public.catalog_courses(id);

-- A lecturer can offer a given catalog course only once.
create unique index if not exists courses_one_offering_per_lecturer
  on public.courses (lecturer_id, catalog_course_id)
  where catalog_course_id is not null;

-- ---------------------------------------------------------------
-- 3. Role helpers (security definer, so policies never recurse)
-- ---------------------------------------------------------------
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.my_role() = 'admin', false);
$$;

-- ---------------------------------------------------------------
-- 4. RLS for the new tables
--    Everyone can read (departments must be readable at signup, before login).
--    Only an admin can write.
-- ---------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.catalog_courses enable row level security;
alter table public.catalog_course_departments enable row level security;

drop policy if exists "departments_select_all" on public.departments;
create policy "departments_select_all" on public.departments for select using (true);
drop policy if exists "departments_insert_admin" on public.departments;
create policy "departments_insert_admin" on public.departments for insert with check (public.is_admin());
drop policy if exists "departments_update_admin" on public.departments;
create policy "departments_update_admin" on public.departments for update using (public.is_admin());
drop policy if exists "departments_delete_admin" on public.departments;
create policy "departments_delete_admin" on public.departments for delete using (public.is_admin());

drop policy if exists "catalog_select_authenticated" on public.catalog_courses;
create policy "catalog_select_authenticated" on public.catalog_courses
  for select using (auth.uid() is not null);
drop policy if exists "catalog_insert_admin" on public.catalog_courses;
create policy "catalog_insert_admin" on public.catalog_courses for insert with check (public.is_admin());
drop policy if exists "catalog_update_admin" on public.catalog_courses;
create policy "catalog_update_admin" on public.catalog_courses for update using (public.is_admin());
drop policy if exists "catalog_delete_admin" on public.catalog_courses;
create policy "catalog_delete_admin" on public.catalog_courses for delete using (public.is_admin());

drop policy if exists "ccd_select_authenticated" on public.catalog_course_departments;
create policy "ccd_select_authenticated" on public.catalog_course_departments
  for select using (auth.uid() is not null);
drop policy if exists "ccd_insert_admin" on public.catalog_course_departments;
create policy "ccd_insert_admin" on public.catalog_course_departments for insert with check (public.is_admin());
drop policy if exists "ccd_update_admin" on public.catalog_course_departments;
create policy "ccd_update_admin" on public.catalog_course_departments for update using (public.is_admin());
drop policy if exists "ccd_delete_admin" on public.catalog_course_departments;
create policy "ccd_delete_admin" on public.catalog_course_departments for delete using (public.is_admin());

-- Admins can read and manage any profile (needed for the future admin screen).
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles for select using (public.is_admin());
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update using (public.is_admin());

-- ---------------------------------------------------------------
-- 5. Signup trigger: also store the student's department (students only).
--    The department id is matched against the departments table, so a bad
--    value is ignored instead of breaking signup.
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role text;
  v_dept uuid;
begin
  v_role := case when new.raw_user_meta_data->>'role' = 'lecturer'
                 then 'lecturer' else 'student' end;

  if v_role = 'student' then
    select id into v_dept
    from public.departments
    where id::text = new.raw_user_meta_data->>'department_id';
  end if;

  insert into public.profiles (id, full_name, role, student_id, department_id)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    v_role,
    case when v_role = 'student'
         then nullif(trim(new.raw_user_meta_data->>'student_id'), '')
         else null end,
    v_dept
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- 6. Lock role, student_id and department_id against edits through the app,
--    unless the caller is an admin. Dashboard / SQL editor edits have no JWT
--    (auth.uid() is null) and are always allowed.
-- ---------------------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.id is distinct from old.id then
      raise exception 'profile id cannot be changed';
    end if;
    if new.role is distinct from old.role then
      raise exception 'role cannot be changed';
    end if;
    if new.student_id is distinct from old.student_id then
      raise exception 'student_id cannot be changed';
    end if;
    if new.department_id is distinct from old.department_id then
      raise exception 'department cannot be changed';
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
-- 7. Course offerings: name and code always come from the catalog,
--    and the owner / catalog link cannot be edited through the app.
-- ---------------------------------------------------------------
create or replace function public.courses_from_catalog()
returns trigger
language plpgsql set search_path = public
as $$
declare
  v_title text;
  v_code text;
begin
  if new.catalog_course_id is not null then
    select cc.title, cc.code into v_title, v_code
    from public.catalog_courses cc
    where cc.id = new.catalog_course_id;
    new.name := v_title;
    new.code := v_code;
  end if;
  return new;
end;
$$;

drop trigger if exists courses_from_catalog on public.courses;
create trigger courses_from_catalog
  before insert on public.courses
  for each row execute function public.courses_from_catalog();

create or replace function public.protect_course_fields()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.lecturer_id is distinct from old.lecturer_id then
      raise exception 'course owner cannot be changed';
    end if;
    if new.catalog_course_id is distinct from old.catalog_course_id then
      raise exception 'catalog course cannot be changed';
    end if;
    if old.catalog_course_id is not null
       and (new.name is distinct from old.name or new.code is distinct from old.code) then
      raise exception 'name and code come from the catalog';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_course_fields on public.courses;
create trigger protect_course_fields
  before update on public.courses
  for each row execute function public.protect_course_fields();

-- Only lecturers can create offerings, and only of a catalog course.
drop policy if exists "courses_insert_lecturer" on public.courses;
create policy "courses_insert_lecturer" on public.courses for insert with check (
  lecturer_id = auth.uid()
  and public.my_role() = 'lecturer'
  and catalog_course_id is not null
);

-- ---------------------------------------------------------------
-- 8. Enrollment: students no longer insert rows directly. They call
--    join_course(), which checks their department. Lecturers can remove
--    a student from their own course.
-- ---------------------------------------------------------------
drop policy if exists "enrollments_insert_self" on public.enrollments;

drop policy if exists "enrollments_delete_lecturer" on public.enrollments;
create policy "enrollments_delete_lecturer" on public.enrollments
  for delete using (public.is_course_owner(course_id));

create or replace function public.join_course(p_course_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_dept uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select department_id into v_dept
  from public.profiles
  where id = auth.uid() and role = 'student';

  if v_dept is null then
    raise exception 'only students with a department can join courses';
  end if;

  if not exists (
    select 1
    from public.courses c
    join public.catalog_course_departments cd
      on cd.catalog_course_id = c.catalog_course_id
    where c.id = p_course_id and cd.department_id = v_dept
  ) then
    raise exception 'this course is not available for your department';
  end if;

  insert into public.enrollments (student_id, course_id)
  values (auth.uid(), p_course_id)
  on conflict (student_id, course_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------
-- 9. Search: offerings in the caller's department, typo-tolerant (pg_trgm).
--    Empty query returns the whole department list.
-- ---------------------------------------------------------------
create or replace function public.search_joinable_courses(p_query text default '')
returns table (
  course_id uuid,
  code text,
  title text,
  lecturer_name text,
  already_enrolled boolean
)
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_dept uuid;
  q text := trim(coalesce(p_query, ''));
  q_norm text := regexp_replace(lower(trim(coalesce(p_query, ''))), '[^a-z0-9]', '', 'g');
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select department_id into v_dept
  from public.profiles
  where id = auth.uid() and role = 'student';

  if v_dept is null then
    return;
  end if;

  return query
  select
    c.id,
    cc.code,
    cc.title,
    p.full_name,
    exists (
      select 1 from public.enrollments e
      where e.course_id = c.id and e.student_id = auth.uid()
    )
  from public.courses c
  join public.catalog_courses cc on cc.id = c.catalog_course_id
  join public.catalog_course_departments cd
    on cd.catalog_course_id = cc.id and cd.department_id = v_dept
  left join public.profiles p on p.id = c.lecturer_id
  where q = ''
     or cc.title ilike '%' || q || '%'
     or regexp_replace(lower(cc.code), '[^a-z0-9]', '', 'g') like '%' || q_norm || '%'
     or similarity(cc.title, q) > 0.2
     or word_similarity(q, cc.title) > 0.4
  order by greatest(similarity(cc.title, q), similarity(cc.code, q)) desc, cc.code
  limit 20;
end;
$$;

revoke all on function public.join_course(uuid) from public, anon;
grant execute on function public.join_course(uuid) to authenticated;
revoke all on function public.search_joinable_courses(text) from public, anon;
grant execute on function public.search_joinable_courses(text) to authenticated;

-- ---------------------------------------------------------------
-- 10. Seed data: Caleb departments and first-semester 100-level courses
-- ---------------------------------------------------------------
insert into public.departments (name) values
  ('Software Engineering'),
  ('Computer Science'),
  ('Cyber Security')
on conflict (name) do nothing;

insert into public.catalog_courses (code, title, level, semester) values
  ('CSC 101',     'Introduction to Computer Science',  100, 'first'),
  ('CUL-CYB 171', 'Cyber Hygiene',                     100, 'first'),
  ('STA 111',     'Introduction to Statistics',        100, 'first'),
  ('PHY 101',     'General Physics I',                 100, 'first'),
  ('PHY 107',     'Practical Physics I',               100, 'first'),
  ('MTH 101',     'General Mathematics',               100, 'first'),
  ('GST 111',     'Introduction to English Language',  100, 'first'),
  ('GST 121',     'Character in Leadership',           100, 'first'),
  ('CTC 101',     'Tech Plus I',                       100, 'first'),
  ('CUL-SEN 103', 'Computer Hardware Lab',             100, 'first')
on conflict (code) do nothing;

-- Eight courses are shared by all three departments.
insert into public.catalog_course_departments (catalog_course_id, department_id)
select cc.id, d.id
from public.catalog_courses cc
cross join public.departments d
where cc.code in ('CSC 101', 'STA 111', 'PHY 101', 'PHY 107',
                  'MTH 101', 'GST 111', 'GST 121', 'CTC 101')
on conflict do nothing;

-- Department-specific courses.
insert into public.catalog_course_departments (catalog_course_id, department_id)
select cc.id, d.id
from public.catalog_courses cc
join public.departments d on d.name in ('Computer Science', 'Cyber Security')
where cc.code = 'CUL-CYB 171'
on conflict do nothing;

insert into public.catalog_course_departments (catalog_course_id, department_id)
select cc.id, d.id
from public.catalog_courses cc
join public.departments d on d.name in ('Computer Science', 'Software Engineering')
where cc.code = 'CUL-SEN 103'
on conflict do nothing;

-- ---------------------------------------------------------------
-- After running (do these separately, by hand):
--
-- a) Give existing test students a department (they registered before it existed):
--    update public.profiles
--    set department_id = (select id from public.departments where name = 'Software Engineering')
--    where role = 'student' and department_id is null;
--
-- b) Make someone an admin (uses the user's id from Authentication > Users):
--    update public.profiles set role = 'admin' where id = '<their uid>';
-- ---------------------------------------------------------------