// Student — Scan Attendance
// Real camera QR decode (html5-qrcode) -> Store.markAttendance(qrToken),
// which inserts into attendance_records. The database is the source of
// truth for "already scanned" (unique constraint), "expired" (expires_at
// check), and "not enrolled" (RLS policy) — this page just surfaces
// whatever the database decided.

(async function () {
  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: 'pages/student/dashboard.html' },
    { key: 'courses', label: 'My Courses', icon: 'book', href: 'pages/student/courses.html' },
    { key: 'scan', label: 'Scan', icon: 'scan', href: 'pages/student/scan.html' },
    { key: 'profile', label: 'Profile', icon: 'user', href: 'pages/student/profile.html' },
  ];

  const user = await Shell.render({ role: 'student', active: 'scan', navItems });
  if (!user) return;

  const main = document.getElementById('main-content');
  main.innerHTML = document.getElementById('tpl-scan').innerHTML;

  const els = {
    line: document.getElementById('scan-line'),
    brackets: document.getElementById('corner-brackets'),
    iconCenter: document.getElementById('scan-icon-center'),
    status: document.getElementById('scan-status'),
    actionBtn: document.getElementById('scan-action-btn'),
    cancelBtn: document.getElementById('scan-cancel-btn'),
    readerEl: document.getElementById('qr-reader'),
  };

  let status = 'idle'; // idle | scanning | success | error
  let html5Qr = null;

  function setStatus(next, message) {
    status = next;
    els.line.style.display = next === 'scanning' ? 'block' : 'none';
    els.brackets.classList.toggle('active', next === 'scanning');

    const iconMap = {
      idle: Icons.qrCode('icon icon-lg'),
      scanning: Icons.qrCode('icon icon-lg'),
      success: Icons.checkCircle('icon icon-lg'),
      error: Icons.xCircle('icon icon-lg'),
    };
    els.iconCenter.className = `scan-icon-center ${next}`;
    els.iconCenter.innerHTML = (next === 'scanning') ? '' : iconMap[next];

    els.status.className = `scan-status ${next === 'error' ? 'error' : next === 'success' ? 'success' : ''}`;
    els.status.innerHTML = message || {
      idle: 'Camera ready — tap Start scanning to begin.',
      scanning: `${Icons.scanLine('icon')} Scanning…`,
      success: '',
      error: '',
    }[next];

    if (next === 'success') {
      els.actionBtn.textContent = 'Scan another';
      els.actionBtn.disabled = false;
    } else if (next === 'scanning') {
      els.actionBtn.innerHTML = 'Scanning…';
      els.actionBtn.disabled = true;
    } else {
      els.actionBtn.innerHTML = `${Icons.scanLine('icon')} Start scanning`;
      els.actionBtn.disabled = false;
    }
  }

  const REASON_MESSAGES = {
    invalid: 'Invalid QR code. Make sure you scanned the code your lecturer is displaying.',
    expired: 'This session has expired. Ask your lecturer to start a new one.',
    duplicate: 'You have already marked attendance for this session.',
    not_enrolled: 'You are not enrolled in this course, so attendance cannot be recorded.',
  };

  async function stopCamera() {
    if (html5Qr) {
      try { await html5Qr.stop(); await html5Qr.clear(); } catch (e) { /* already stopped */ }
      html5Qr = null;
    }
  }

  async function startScan() {
    setStatus('scanning');
    els.readerEl.style.display = 'block';

    try {
      html5Qr = new Html5Qrcode('qr-reader');
      await html5Qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decodedText) => {
          await stopCamera();
          els.readerEl.style.display = 'none';

          try {
            const result = await Store.markAttendance(decodedText.trim());
            if (result.ok) {
              setStatus('success', `${Icons.checkCircle('icon')} Attendance marked for ${result.courseName || 'your course'}`);
            } else {
              const msg = REASON_MESSAGES[result.reason] || 'Could not record attendance.';
              setStatus('error', `${Icons.xCircle('icon')} ${msg}`);
            }
          } catch (err) {
            setStatus('error', `${Icons.xCircle('icon')} ${err.message || 'Could not record attendance.'}`);
          }
        },
        () => { /* per-frame decode failures — ignore, keep scanning */ }
      );
    } catch (err) {
      els.readerEl.style.display = 'none';
      setStatus('error', `${Icons.xCircle('icon')} Camera unavailable: ${err.message || 'permission denied'}.`);
    }
  }

  els.actionBtn.addEventListener('click', () => {
    if (status === 'scanning') return;
    startScan();
  });

  els.cancelBtn.addEventListener('click', async () => {
    await stopCamera();
    window.location.href = window.BASE_PATH + 'pages/student/dashboard.html';
  });

  window.addEventListener('beforeunload', stopCamera);

  setStatus('idle');
})();
