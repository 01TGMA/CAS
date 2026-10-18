// Lecturer — Course View (Sessions / Roster tabs)

(async function () {
  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: 'pages/lecturer/dashboard.html' },
    { key: 'profile', label: 'Profile', icon: 'user', href: 'pages/lecturer/profile.html' },
  ];

  const user = await Shell.render({ role: 'lecturer', active: 'dashboard', navItems });
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  const courseId = params.get('courseId');

  const main = document.getElementById('main-content');

  if (!courseId) {
    main.innerHTML = '<div class="empty-state">No course selected.</div>';
    return;
  }

  main.innerHTML = '<div class="empty-state">Loading course…</div>';

  let course;
  try {
    course = await Store.lecturerCourseById(courseId);
  } catch (err) {
    renderError(main, err);
    return;
  }

  main.innerHTML = document.getElementById('tpl-course-view').innerHTML;

  document.getElementById('back-btn').innerHTML = `${Icons.arrowLeft('icon')} All courses`;
  document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = window.BASE_PATH + 'pages/lecturer/dashboard.html';
  });

  document.getElementById('course-title').innerHTML = `${course.name} <button class="btn btn-ghost btn-icon" aria-label="Edit course">${Icons.pencil('icon')}</button>`;
  document.getElementById('course-code-badge').textContent = course.code;
  document.getElementById('course-student-count').innerHTML = `${Icons.users('icon')} ${course.studentCount} students`;

  document.getElementById('create-session-btn').innerHTML = `${Icons.plus('icon')} Create Session`;
  document.getElementById('create-session-btn').addEventListener('click', () => {
    window.location.href = `${window.BASE_PATH}pages/lecturer/session.html?courseId=${course.id}`;
  });

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  const sessionsList = document.getElementById('sessions-list');
  if (course.sessions.length === 0) {
    sessionsList.innerHTML = '<div class="empty-state">No sessions yet — create one to start taking attendance.</div>';
  } else {
    sessionsList.innerHTML = course.sessions.map((s) => {
      const pct = s.totalStudents ? Math.round((s.attendanceCount / s.totalStudents) * 100) : 0;
      return `
        <div class="session-row">
          <span style="font-weight:600;">${formatDate(s.date)}</span>
          <span class="text-muted">+${s.mark} mark${s.mark > 1 ? 's' : ''}</span>
          <span class="tabular-nums">${s.attendanceCount}/${s.totalStudents} <span style="font-size:0.75rem;font-weight:600;color:${pct >= 75 ? 'var(--color-primary)' : 'var(--color-muted-foreground)'};">(${pct}%)</span></span>
          <span style="text-align:right;"><button class="btn btn-ghost btn-sm">${Icons.eye('icon')} View</button></span>
        </div>
      `;
    }).join('');
  }

  const rosterList = document.getElementById('roster-list');
  if (course.roster.length === 0) {
    rosterList.innerHTML = '<li class="empty-state">No students enrolled yet.</li>';
  } else {
    rosterList.innerHTML = course.roster.map((s) => {
      const eligible = isEligible(s.attendancePct, course.eligibilityThreshold);
      const badgeCls = eligible ? 'badge-default' : 'badge-destructive';
      const badgeIcon = eligible ? Icons.checkCircle('icon') : Icons.xCircle('icon');
      return `
        <li class="roster-row">
          <span class="avatar avatar-sm">${initials(s.name)}</span>
          <div class="grow">
            <span class="name truncate">${s.name}</span>
            <span class="id">${s.studentId || ''}</span>
          </div>
          <div class="bar"><div class="progress"><div class="progress-indicator" style="width:${s.attendancePct}%"></div></div></div>
          <span class="pct">${s.attendancePct}%</span>
          <div class="status"><span class="badge ${badgeCls}">${badgeIcon}${eligible ? 'Eligible' : 'Not Eligible'}</span></div>
        </li>
      `;
    }).join('');
  }

  // Tab switching
  const tabs = document.querySelectorAll('#course-tabs .section-tab');
  const panels = { sessions: document.getElementById('tab-sessions'), roster: document.getElementById('tab-roster') };
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      Object.entries(panels).forEach(([key, el]) => { el.style.display = key === tab.dataset.tab ? 'block' : 'none'; });
    });
  });
})();
