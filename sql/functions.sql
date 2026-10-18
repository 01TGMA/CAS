-- Eligibility & attendance percentage calculations
-- Run AFTER schema.sql and policies.sql.

-- Returns a student's attendance percentage for a given course.
create or replace function public.attendance_percentage(p_student_id uuid, p_course_id uuid)
returns numeric as $$
declare
  total_sessions int;
  attended_sessions int;
begin
  select count(*) into total_sessions from sessions where course_id = p_course_id;
  if total_sessions = 0 then
    return 100;
  end if;

  select count(*) into attended_sessions
  from attendance_records ar
  join sessions s on s.id = ar.session_id
  where s.course_id = p_course_id and ar.student_id = p_student_id;

  return round((attended_sessions::numeric / total_sessions) * 100, 1);
end;
$$ language plpgsql stable security definer;

-- Returns whether a student currently meets the course's eligibility threshold.
create or replace function public.is_eligible(p_student_id uuid, p_course_id uuid)
returns boolean as $$
declare
  pct numeric;
  threshold numeric;
begin
  select eligibility_threshold into threshold from courses where id = p_course_id;
  pct := public.attendance_percentage(p_student_id, p_course_id);
  return pct >= coalesce(threshold, 75);
end;
$$ language plpgsql stable security definer;
