// Lecturer — Create Session + Live QR View
// - Creates a row in `sessions` and encodes its DB-generated qr_token
//   (a UUID) directly into the QR code — that's the only thing scan.js
//   needs to look up the session.
// - The countdown is driven by the session's real expires_at, not a local
//   timer, so it stays correct even if the tab is backgrounded.
// - Live arrivals come from a Supabase Realtime subscription on
//   attendance_records INSERTs filtered to this session_id.
// - "End Session" sets expires_at to now(), which the same expires_at
//   check that blocks late scans also blocks immediately.

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

  main.innerHTML = document.getElementById('tpl-session-form').innerHTML;

  document.getElementById('back-btn').innerHTML = `${Icons.arrowLeft('icon')} Back to course`;
  document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = `${window.BASE_PATH}pages/lecturer/course.html?courseId=${course.id}`;
  });
  document.getElementById('course-subtitle').textContent = `${course.name} \u00b7 ${course.code}`;

  document.getElementById('session-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (typeof QRCode === 'undefined') {
      alert('QR library failed to load. Check your internet connection and reload the page.');
      return;
    }
    const mark = Number(document.getElementById('mark').value) || 1;
    const duration = Number(document.getElementById('duration').value) || 10;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';

    try {
      const session = await Store.createSession(course.id, mark, duration);
      goLive(course, session);
    } catch (err) {
      alert('Could not create session: ' + err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Generate QR Code';
    }
  });

  function goLive(course, session) {
    const liveHtml = document.getElementById('tpl-session-live').innerHTML;
    document.body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.innerHTML = liveHtml;
    document.body.appendChild(wrap);

    document.getElementById('live-brand-icon').innerHTML = Icons.graduationCap('icon');
    document.getElementById('live-icon-users').innerHTML = Icons.users('icon');
    document.getElementById('icon-timer').innerHTML = Icons.timer('icon');
    document.getElementById('icon-award').innerHTML = Icons.award('icon');
    document.getElementById('live-course-name').textContent = course.name;
    document.getElementById('live-course-code').textContent = `${course.code} \u00b7 Scan to mark attendance`;
    document.getElementById('mark-value-display').textContent = `+${session.mark_value}`;

    // The QR payload is just the session's qr_token — scan.js looks up the
    // session by this value and checks expires_at / enrollment / duplicates.
    const canvasHolder = document.getElementById('qr-canvas-holder');
    const canvas = document.createElement('canvas');
    canvasHolder.appendChild(canvas);
    QRCode.toCanvas(canvas, session.qr_token, { width: 260, margin: 1, color: { dark: '#1c2333', light: '#ffffff' } });

    const countdownEl = document.getElementById('countdown');
    const qrExpired = document.getElementById('qr-expired');
    let expired = false;

    function formatMMSS(totalSeconds) {
      const s = Math.max(0, totalSeconds);
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${m}:${String(r).padStart(2, '0')}`;
    }

    function showExpired() {
      if (expired) return;
      expired = true;
      canvasHolder.style.display = 'none';
      qrExpired.style.display = 'flex';
      qrExpired.innerHTML = `${Icons.clock('icon icon-lg')}<p style="font-weight:600;margin:0.4rem 0 0;">Session expired</p><p class="text-muted" style="margin:0;font-size:0.875rem;">QR code is no longer valid</p>`;
    }

    function tickCountdown() {
      const remainingMs = new Date(session.expires_at) - new Date();
      if (remainingMs <= 0) {
        countdownEl.textContent = '0:00';
        showExpired();
        clearInterval(tick);
        return;
      }
      countdownEl.textContent = formatMMSS(Math.floor(remainingMs / 1000));
    }
    tickCountdown();
    const tick = setInterval(tickCountdown, 1000);

    // Live arrivals via Supabase Realtime.
    const arrivalsList = document.getElementById('arrivals-list');
    const checkinCount = document.getElementById('checkin-count');
    let arrivalCount = 0;
    checkinCount.textContent = `0/${course.studentCount} checked in`;

    async function addArrivalRow(studentId, markedAt) {
      let name = 'A student', sId = '';
      try {
        const { data: profile } = await window.sb
          .from('profiles')
          .select('full_name, student_id')
          .eq('id', studentId)
          .single();
        if (profile) { name = profile.full_name; sId = profile.student_id || ''; }
      } catch (e) { /* fall back to placeholder name */ }

      arrivalCount += 1;
      checkinCount.textContent = `${arrivalCount}/${course.studentCount} checked in`;

      const empty = arrivalsList.querySelector('.empty-state');
      if (empty) empty.remove();

      const row = document.createElement('li');
      row.className = 'arrival-row animate-fade-slide-in';
      const at = new Date(markedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      row.innerHTML = `
        <span class="avatar avatar-sm">${esc(initials(name))}</span>
        <div class="grow">
          <span class="name truncate">${esc(name)}</span>
          <span class="id">${esc(sId)}</span>
        </div>
        <span class="time">${at}</span>
        ${Icons.checkCircle('icon check')}
      `;
      arrivalsList.prepend(row);
    }

    const channel = window.sb
      .channel(`session-${session.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance_records', filter: `session_id=eq.${session.id}` },
        (payload) => addArrivalRow(payload.new.student_id, payload.new.marked_at)
      )
      .subscribe();

    document.getElementById('end-session-btn').addEventListener('click', async () => {
      clearInterval(tick);
      try {
        await Store.endSession(session.id);
      } catch (err) {
        alert('Could not end session cleanly: ' + err.message);
      }
      channel.unsubscribe();
      window.location.href = `${window.BASE_PATH}pages/lecturer/course.html?courseId=${course.id}`;
    });

    window.addEventListener('beforeunload', () => channel.unsubscribe());
  }
})();
