// Lecturer — Dashboard (course grid)
// "Create Course" opens a catalog picker: lecturers choose an official course
// instead of typing a name and code. The database fills in name and code.

(async function () {
  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: 'pages/lecturer/dashboard.html' },
    { key: 'profile', label: 'Profile', icon: 'user', href: 'pages/lecturer/profile.html' },
  ];

  const user = await Shell.render({ role: 'lecturer', active: 'dashboard', navItems });
  if (!user) return;

  // Escapes text before it goes into innerHTML.
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  const main = document.getElementById('main-content');
  main.innerHTML = document.getElementById('tpl-lect-dashboard').innerHTML;

  const createBtn = document.getElementById('create-course-btn');
  createBtn.innerHTML = `${Icons.plus('icon')} Create Course`;
  createBtn.addEventListener('click', openCatalogPicker);

  async function openCatalogPicker() {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;' +
      'justify-content:center;padding:1rem;z-index:1000;';
    overlay.innerHTML = `
      <div class="card" style="width:100%;max-width:34rem;max-height:80vh;display:flex;flex-direction:column;">
        <div class="card-header"><h3 class="card-title">Choose a course to teach</h3></div>
        <div class="card-content" style="overflow:auto;">
          <input class="input" id="catalog-search" placeholder="Search by code or title" autocomplete="off">
          <p class="text-muted" id="catalog-note" style="font-size:0.875rem;margin:0.5rem 0 0;"></p>
          <ul id="catalog-list" style="list-style:none;padding:0;margin:0.5rem 0 0;"></ul>
        </div>
        <div class="card-content">
          <button class="btn btn-outline btn-block" id="catalog-close" type="button">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#catalog-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const search = overlay.querySelector('#catalog-search');
    const list = overlay.querySelector('#catalog-list');
    const note = overlay.querySelector('#catalog-note');

    note.textContent = 'Loading catalog...';
    let catalog = [];
    try {
      catalog = await Store.catalogCourses();
    } catch (err) {
      note.textContent = 'Could not load the catalog: ' + err.message;
      return;
    }

    const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    function render() {
      const q = search.value.trim().toLowerCase();
      const qn = normalize(search.value);
      const matches = catalog.filter((c) =>
        !q || c.title.toLowerCase().includes(q) || normalize(c.code).includes(qn)
      );
      note.textContent = matches.length ? '' : 'No matching courses in the catalog.';
      list.innerHTML = matches.map((c) => `
        <li style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.6rem 0;border-bottom:1px solid var(--color-border, #e5e7eb);">
          <div style="min-width:0;">
            <div style="font-weight:600;">${esc(c.code)}</div>
            <div class="text-muted" style="font-size:0.875rem;">${esc(c.title)}</div>
          </div>
          <button class="btn btn-primary btn-sm" type="button" data-catalog="${esc(c.id)}">Teach this</button>
        </li>
      `).join('');
    }

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-catalog]');
      if (!btn) return;
      const course = catalog.find((c) => c.id === btn.dataset.catalog);
      if (!course) return;
      btn.disabled = true;
      btn.textContent = 'Creating...';
      try {
        await Store.createCourseFromCatalog(course);
        window.location.reload();
      } catch (err) {
        note.textContent = err.message;
        btn.disabled = false;
        btn.textContent = 'Teach this';
      }
    });

    search.addEventListener('input', render);
    render();
    search.focus();
  }

  const grid = document.getElementById('lect-course-grid');
  grid.innerHTML = '<div class="empty-state">Loading courses…</div>';

  let courses;
  try {
    courses = await Store.lecturerCourses();
  } catch (err) {
    renderError(grid, err);
    return;
  }

  if (courses.length === 0) {
    grid.innerHTML = '<div class="empty-state">You have not created any courses yet.</div>';
    return;
  }

  grid.innerHTML = courses.map((course) => `
    <div class="card">
      <div class="card-header">
        <span class="code-chip">${esc(course.code)}</span>
        <h3 class="card-title" style="font-size:1.05rem;">${esc(course.name)}</h3>
        <div class="course-card-desc">
          <span>${Icons.users('icon')} ${course.studentCount} students</span>
          <span>${Icons.calendar('icon')} ${course.sessions.length} sessions</span>
        </div>
      </div>
      <div class="card-content">
        <button class="btn btn-outline btn-block manage-btn" data-course="${esc(course.id)}">
          Manage ${Icons.arrowRight('icon')}
        </button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.manage-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.location.href = `${window.BASE_PATH}pages/lecturer/course.html?courseId=${btn.dataset.course}`;
    });
  });
})();