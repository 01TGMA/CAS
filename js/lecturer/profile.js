// Lecturer — Profile

(async function () {
  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: 'pages/lecturer/dashboard.html' },
    { key: 'profile', label: 'Profile', icon: 'user', href: 'pages/lecturer/profile.html' },
  ];

  const user = await Shell.render({ role: 'lecturer', active: 'profile', navItems });
  if (!user) return;

  const main = document.getElementById('main-content');
  main.innerHTML = document.getElementById('tpl-lect-profile').innerHTML;

  document.getElementById('profile-avatar').textContent = initials(user.name);
  document.getElementById('profile-name').textContent = user.name;

  let coursesLabel = 'Unavailable', studentsLabel = 'Unavailable';
  try {
    const courses = await Store.lecturerCourses();
    const totalStudents = courses.reduce((a, c) => a + c.studentCount, 0);
    coursesLabel = `${courses.length} courses`;
    studentsLabel = `${totalStudents}`;
  } catch (err) { /* leave fallback labels */ }

  const rows = [
    { icon: 'mail', label: 'Email', value: user.email },
    { icon: 'book', label: 'Courses taught', value: coursesLabel },
    { icon: 'users', label: 'Total students', value: studentsLabel },
  ];

  document.getElementById('profile-rows').innerHTML = rows.map((row) => `
    <div class="profile-row">
      <span class="profile-row-icon">${Icons[row.icon]('icon')}</span>
      <div>
        <dt>${row.label}</dt>
        <dd>${esc(row.value)}</dd>
      </div>
    </div>
  `).join('');
})();
