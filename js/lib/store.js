
const ATTENDANCE_THRESHOLD_DEFAULT = 75;

function attendancePct(attended, total) {
  if (total === 0) return 100;
  return Math.round((attended / total) * 100);
}

function isEligible(pct, threshold = ATTENDANCE_THRESHOLD_DEFAULT) {
  return pct >= threshold;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function initials(name) {
  return (name || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Renders a simple inline error state into a container — used by every
// page script when a Supabase call fails, instead of a blank/broken page.
function renderError(container, err) {
  container.innerHTML = `
    <div class="card" style="max-width:28rem;">
      <div class="card-content" style="text-align:center;padding:2rem 1.5rem;">
        <p style="font-weight:600;margin:0 0 0.4rem;color:var(--color-destructive);">Something went wrong</p>
        <p class="text-muted" style="margin:0;font-size:0.875rem;">${esc((err && err.message) || 'Please try again.')}</p>
      </div>
    </div>
  `;
}

const Store = {
  _user: null, 

  // ---- auth ----

  async getUser() {
    const { data: { session }, error: sessionError } = await window.sb.auth.getSession();
    if (sessionError || !session) { this._user = null; return null; }

    const { data: profile, error: profileError } = await window.sb
      .from('profiles')
      .select('id, full_name, role, student_id, department_id')
      .eq('id', session.user.id)
      .single();
    if (profileError || !profile) { this._user = null; return null; }

    this._user = {
      id: session.user.id,
      email: session.user.email,
      name: profile.full_name,
      role: profile.role,
      studentId: profile.student_id,
      departmentId: profile.department_id,
    };
    return this._user;
  },

  async login(email, password) {
    const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async register({ name, email, password, role, studentId, departmentId }) {
    const { data, error } = await window.sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, role, student_id: studentId || null, department_id: departmentId || null } },});
    if (error) throw error;
    return data; // data.session is null if email confirmation is required
  },

  async logout() {
    await window.sb.auth.signOut();
    this._user = null;
  },

  async requireAuth(expectedRole) {
    const base = window.BASE_PATH || './';
    const user = await this.getUser();
    if (!user) {
      window.location.href = base + 'index.html';
      return null;
    }
    if (expectedRole && user.role !== expectedRole) {
      window.location.href = base + (user.role === 'student' ? 'pages/student/dashboard.html' : 'pages/lecturer/dashboard.html');
      return null;
    }
    return user;
  },

  // ---- student data ----

  async studentCourses() {
    const studentId = this._user.id;

    const { data: enrollments, error: e1 } = await window.sb
      .from('enrollments')
      .select('course:courses(id, name, code, eligibility_threshold, lecturer:profiles(full_name))')
      .eq('student_id', studentId);
    if (e1) throw e1;
    if (!enrollments || enrollments.length === 0) return [];

    const courseIds = enrollments.map((e) => e.course.id);

    const { data: sessions, error: e2 } = await window.sb
      .from('sessions')
      .select('id, course_id, mark_value')
      .in('course_id', courseIds);
    if (e2) throw e2;

    const { data: myRecords, error: e3 } = await window.sb
      .from('attendance_records')
      .select('session_id')
      .eq('student_id', studentId);
    if (e3) throw e3;

    const attendedSessionIds = new Set((myRecords || []).map((r) => r.session_id));

    return enrollments.map(({ course }) => {
      const courseSessions = (sessions || []).filter((s) => s.course_id === course.id);
      const attended = courseSessions.filter((s) => attendedSessionIds.has(s.id));
      return {
        id: course.id,
        name: course.name,
        code: course.code,
        lecturer: (course.lecturer && course.lecturer.full_name) || 'TBA',
        eligibilityThreshold: course.eligibility_threshold ?? ATTENDANCE_THRESHOLD_DEFAULT,
        totalSessions: courseSessions.length,
        attendedSessions: attended.length,
        maxMarks: courseSessions.reduce((a, s) => a + Number(s.mark_value), 0),
        marks: attended.reduce((a, s) => a + Number(s.mark_value), 0),
      };
    });
  },

// Atendance 

  async markAttendance(qrToken) {
    const { data, error } = await window.sb.rpc('mark_attendance', {
      p_qr_token: String(qrToken || ''),
    });
    if (error) throw error;
    return { ok: data.ok, reason: data.reason, courseName: data.course_name };
  },

  // ---- lecturer data ----

  async _hydrateLecturerCourses(courses) {
    const courseIds = courses.map((c) => c.id);
    if (courseIds.length === 0) return [];

    const { data: sessions, error: e1 } = await window.sb
      .from('sessions')
      .select('id, course_id, mark_value, expires_at, created_at')
      .in('course_id', courseIds)
      .order('created_at', { ascending: false });
    if (e1) throw e1;

    const { data: enrollments, error: e2 } = await window.sb
      .from('enrollments')
      .select('course_id, student:profiles(id, full_name, student_id)')
      .in('course_id', courseIds);
    if (e2) throw e2;

    const sessionIds = (sessions || []).map((s) => s.id);
    let records = [];
    if (sessionIds.length) {
      const { data, error: e3 } = await window.sb
        .from('attendance_records')
        .select('session_id, student_id')
        .in('session_id', sessionIds);
      if (e3) throw e3;
      records = data || [];
    }

    return courses.map((course) => {
      const courseSessions = (sessions || []).filter((s) => s.course_id === course.id);
      const roster = (enrollments || []).filter((e) => e.course_id === course.id).map((e) => e.student);

      const sessionsOut = courseSessions.map((s) => ({
        id: s.id,
        date: s.created_at,
        expiresAt: s.expires_at,
        mark: Number(s.mark_value),
        attendanceCount: records.filter((r) => r.session_id === s.id).length,
        totalStudents: roster.length,
      }));

      const rosterOut = roster.map((student) => {
        const attended = courseSessions.filter((s) =>
          records.some((r) => r.session_id === s.id && r.student_id === student.id)
        ).length;
        return {
          id: student.id,
          name: student.full_name,
          studentId: student.student_id,
          attendancePct: attendancePct(attended, courseSessions.length),
        };
      });

      return {
        id: course.id,
        name: course.name,
        code: course.code,
        eligibilityThreshold: course.eligibility_threshold ?? ATTENDANCE_THRESHOLD_DEFAULT,
        studentCount: roster.length,
        sessions: sessionsOut,
        roster: rosterOut,
      };
    });
  },

  async lecturerCourses() {
    const { data: courses, error } = await window.sb
      .from('courses')
      .select('id, name, code, eligibility_threshold')
      .eq('lecturer_id', this._user.id);
    if (error) throw error;
    return this._hydrateLecturerCourses(courses || []);
  },

  async lecturerCourseById(courseId) {
    const { data: course, error } = await window.sb
      .from('courses')
      .select('id, name, code, eligibility_threshold')
      .eq('id', courseId)
      .single();
    if (error) throw error;
    const [hydrated] = await this._hydrateLecturerCourses([course]);
    return hydrated;
  },

  // Creates a session, returns the row (including its DB-generated qr_token).
  async createSession(courseId, markValue, durationMin) {
    const expiresAt = new Date(Date.now() + durationMin * 60000).toISOString();
    const { data, error } = await window.sb
      .from('sessions')
      .insert({ course_id: courseId, mark_value: markValue, expires_at: expiresAt })
      .select()
      .single();
    if (error) throw error;
 
    const { data: tokenRow, error: tokenError } = await window.sb
      .from('session_tokens')
      .select('qr_token')
      .eq('session_id', data.id)
      .single();
    if (tokenError) throw tokenError;
 
    return { ...data, qr_token: tokenRow.qr_token };
  },
 

  // Ends a session immediately by setting expires_at to now — the same
  // expires_at check that blocks late scans blocks any further ones.
  async endSession(sessionId) {
    const { error } = await window.sb
      .from('sessions')
      .update({ expires_at: new Date().toISOString() })
      .eq('id', sessionId);
    if (error) throw error;
  },
  // ---- departments, catalog, joining ----
 
  // Readable before login: the registration page uses it.
  async departments() {
    const { data, error } = await window.sb
      .from('departments')
      .select('id, name')
      .order('name');
    if (error) throw error;
    return data || [];
  },
 
  // Lecturer: the full catalog, to pick a course to teach.
  async catalogCourses() {
    const { data, error } = await window.sb
      .from('catalog_courses')
      .select('id, code, title, level, semester')
      .order('code');
    if (error) throw error;
    return data || [];
  },
 
  // Lecturer: create an offering of a catalog course. The database overwrites
  // name and code from the catalog, so these values are only for convenience.
  async createCourseFromCatalog(catalogCourse) {
    const { data, error } = await window.sb
      .from('courses')
      .insert({
        lecturer_id: this._user.id,
        catalog_course_id: catalogCourse.id,
        name: catalogCourse.title,
        code: catalogCourse.code,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        throw new Error('You already teach this course.');
      }
      throw error;
    }
    return data;
  },
 
  // Student: courses in my department, typo-tolerant. Empty query = all of them.
  async searchJoinableCourses(query) {
    const { data, error } = await window.sb.rpc('search_joinable_courses', {
      p_query: query || '',
    });
    if (error) throw error;
    return data || [];
  },
 
  // Student: join a course. The database checks the department.
  async joinCourse(courseId) {
    const { error } = await window.sb.rpc('join_course', { p_course_id: courseId });
    if (error) throw error;
  },
 
  // Lecturer: remove a student from one of my courses.
  async removeStudent(courseId, studentId) {
    const { error } = await window.sb
      .from('enrollments')
      .delete()
      .eq('course_id', courseId)
      .eq('student_id', studentId);
    if (error) throw error;
  },
};
