// Student — My Courses
// "Join a course" searches only courses offered to the student's department
// (typo-tolerant, done in the database) and joins through join_course(), which
// re-checks the department on the server.

(async function () {
  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: 'pages/student/dashboard.html' },
    { key: 'courses', label: 'My Courses', icon: 'book', href: 'pages/student/courses.html' },
    { key: 'scan', label: 'Scan', icon: 'scan', href: 'pages/student/scan.html' },
    { key: 'profile', label: 'Profile', icon: 'user', href: 'pages/student/profile.html' },
  ];

  const user = await Shell.render({ role: 'student', active: 'courses', navItems });
  if (!user) return;

  // Escapes text before it goes into innerHTML.
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  const main = document.getElementById('main-content');
  main.innerHTML = document.getElementById('tpl-courses').innerHTML;

  const joinBtn = document.getElementById('join-course-btn');
  joinBtn.innerHTML = `${Icons.plus('icon')} Join a course`;
  joinBtn.addEventListener('click', openJoinPicker);

  function openJoinPicker() {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;' +
      'justify-content:center;padding:1rem;z-index:1000;';
    overlay.innerHTML = `
      <div class="card" style="width:100%;max-width:34rem;max-height:80vh;display:flex;flex-direction:column;">
        <div class="card-header"><h3 class="card-title">Join a course</h3></div>
        <div class="card-content" style="overflow:auto;">
          <input class="input" id="join-search" placeholder="Search by code or title" autocomplete="off">
          <p class="text-muted" id="join-note" style="font-size:0.875rem;margin:0.5rem 0 0;"></p>
          <ul id="join-list" style="list-style:none;padding:0;margin:0.5rem 0 0;"></ul>
        </div>
        <div class="card-content">
          <button class="btn btn-outline btn-block" id="join-close" type="button">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#join-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const search = overlay.querySelector('#join-search');
    const list = overlay.querySelector('#join-list');
    const note = overlay.querySelector('#join-note');

    let requestId = 0;
    let timer = null;

    async function runSearch() {
      const myId = ++requestId;
      note.textContent = 'Searching...';
      try {
        const results = await Store.searchJoinableCourses(search.value.trim());
        if (myId !== requestId) return; // a newer search is already running
        if (results.length === 0) {
          list.innerHTML = '';
          note.textContent = user.departmentId
            ? 'No matching courses are open for your department yet.'
            : 'Your account has no department yet. Ask an admin to set it.';
          return;
        }
        note.textContent = '';
        list.innerHTML = results.map((r) => `
          <li style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.6rem 0;border-bottom:1px solid var(--color-border, #e5e7eb);">
            <div style="min-width:0;">
              <div style="font-weight:600;">${esc(r.code)} &middot; ${esc(r.title)}</div>
              <div class="text-muted" style="font-size:0.875rem;">${esc(r.lecturer_name || 'Lecturer TBA')}</div>
            </div>
            ${r.already_enrolled
              ? '<span class="badge badge-secondary">Joined</span>'
              : `<button class="btn btn-primary btn-sm" type="button" data-course="${esc(r.course_id)}">Join</button>`}
          </li>
        `).join('');
      } catch (err) {
        if (myId !== requestId) return;
        list.innerHTML = '';
        note.textContent = 'Search failed: ' + err.message;
      }
    }

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-course]');
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = 'Joining...';
      try {
        await Store.joinCourse(btn.dataset.course);
        window.location.reload();
      } catch (err) {
        note.textContent = err.message;
        btn.disabled = false;
        btn.textContent = 'Join';
      }
    });

    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(runSearch, 250);
    });

    runSearch();
    search.focus();
  }

  let courses;
  try {
    courses = await Store.studentCourses();
  } catch (err) {
    renderError(main, err);
    return;
  }

  const grid = document.getElementById('course-grid');

  if (courses.length === 0) {
    grid.innerHTML = '<div class="empty-state">You are not enrolled in any courses yet. Use "Join a course" to add one.</div>';
    return;
  }

  grid.innerHTML = courses.map((course) => {
    const pct = attendancePct(course.attendedSessions, course.totalSessions);
    const eligible = isEligible(pct, course.eligibilityThreshold);
    const badgeCls = eligible ? 'badge-default' : 'badge-destructive';
    const badgeIcon = eligible ? Icons.checkCircle('icon') : Icons.xCircle('icon');
    const badgeLabel = eligible ? 'Eligible' : 'Not Eligible';

    return `
      <div class="card">
        <div class="card-header">
          <div class="course-card-title">
            <span class="name truncate">${esc(course.name)}</span>
            <span class="badge ${badgeCls}">${badgeIcon}${badgeLabel}</span>
          </div>
          <p class="card-description">${esc(course.code)} &middot; ${esc(course.lecturer)}</p>
        </div>
        <div class="card-content">
          <div class="flex justify-between" style="font-size:0.875rem;margin-bottom:0.4rem;">
            <span class="text-muted">Attendance</span>
            <span style="font-weight:700;">${pct}%</span>
          </div>
          <div class="progress"><div class="progress-indicator" style="width:${pct}%"></div></div>
          <p class="text-muted" style="font-size:0.75rem;margin:0.4rem 0 0;">${course.attendedSessions} of ${course.totalSessions} sessions attended</p>

          <div class="marks-box">
            <span class="label">Marks earned</span>
            <span class="val">${course.marks}<span class="of"> / ${course.maxMarks}</span></span>
          </div>
        </div>
      </div>
    `;
  }).join('');
})();