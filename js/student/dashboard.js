// Student Dashboard

(async function () {
  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: 'pages/student/dashboard.html' },
    { key: 'courses', label: 'My Courses', icon: 'book', href: 'pages/student/courses.html' },
    { key: 'scan', label: 'Scan', icon: 'scan', href: 'pages/student/scan.html' },
    { key: 'profile', label: 'Profile', icon: 'user', href: 'pages/student/profile.html' },
  ];

  const user = await Shell.render({ role: 'student', active: 'dashboard', navItems });
  if (!user) return;

  const main = document.getElementById('main-content');
  main.innerHTML = document.getElementById('tpl-dashboard').innerHTML;

  document.getElementById('icon-trend').innerHTML = Icons.trendUp('icon');
  document.getElementById('icon-award').innerHTML = Icons.award('icon');
  document.getElementById('icon-book').innerHTML = Icons.book('icon');

  let courses;
  try {
    courses = await Store.studentCourses();
  } catch (err) {
    renderError(main, err);
    return;
  }

  if (courses.length === 0) {
    main.innerHTML = '<div class="empty-state">You are not enrolled in any courses yet.</div>';
    return;
  }

  const totalAttended = courses.reduce((a, c) => a + c.attendedSessions, 0);
  const totalSessions = courses.reduce((a, c) => a + c.totalSessions, 0);
  const overallPct = attendancePct(totalAttended, totalSessions);
  const totalMarks = courses.reduce((a, c) => a + c.marks, 0);
  const totalMaxMarks = courses.reduce((a, c) => a + c.maxMarks, 0);
  const eligible = isEligible(overallPct);

  // Circular progress ring
  const size = 132, stroke = 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.max(0, Math.min(100, overallPct)) / 100) * circumference;
  document.getElementById('circular-progress-slot').innerHTML = `
    <div class="circular-progress" style="width:${size}px;height:${size}px;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke="currentColor"/>
        <circle class="indicator" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
          stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke="currentColor"/>
      </svg>
      <div class="circular-progress-label">
        <span class="font-display" style="font-size:1.6rem;font-weight:700;">${overallPct}%</span>
        <span class="stat-sub">min ${ATTENDANCE_THRESHOLD_DEFAULT}%</span>
      </div>
    </div>
  `;

  document.getElementById('total-marks').textContent = totalMarks;
  document.getElementById('total-max-marks').textContent = `/ ${totalMaxMarks}`;
  document.getElementById('marks-caption').textContent = `Continuous assessment across ${courses.length} courses`;

  document.getElementById('eligibility-badge-slot').innerHTML = eligibilityBadgeHtml(overallPct, 'height:1.75rem;padding:0 0.75rem;font-size:0.875rem;');
  const eligCaption = document.getElementById('eligibility-caption');
  eligCaption.textContent = eligible
    ? 'You currently meet the attendance requirement to sit final examinations.'
    : 'Your attendance is below the required threshold for exam eligibility.';
  eligCaption.classList.toggle('text-destructive', !eligible);
  eligCaption.classList.toggle('text-muted', eligible);

  const list = document.getElementById('course-list');
  list.innerHTML = courses.map((course) => {
    const pct = attendancePct(course.attendedSessions, course.totalSessions);
    return `
      <li class="course-row">
        <div>
          <span class="name">${esc(course.name)}</span>
          <span class="meta">${esc(course.code)} &middot; ${esc(course.lecturer)}</span>
        </div>
        <div>
          <div class="pct-row"><span class="text-muted"></span><span class="val ${pct < course.eligibilityThreshold ? 'low' : ''}">${pct}%</span></div>
          <div class="progress"><div class="progress-indicator" style="width:${pct}%"></div></div>
        </div>
        <div style="display:flex;justify-content:flex-end;">${eligibilityBadgeHtml(pct, '', course.eligibilityThreshold)}</div>
      </li>
    `;
  }).join('');
})();

function eligibilityBadgeHtml(pct, extraStyle = '', threshold = ATTENDANCE_THRESHOLD_DEFAULT) {
  const eligible = isEligible(pct, threshold);
  const cls = eligible ? 'badge-default' : 'badge-destructive';
  const icon = eligible ? Icons.checkCircle('icon') : Icons.xCircle('icon');
  const label = eligible ? 'Eligible' : 'Not Eligible';
  return `<span class="badge ${cls}" style="${extraStyle}">${icon}${label}</span>`;
}
