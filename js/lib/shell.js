// Renders shared chrome (header + side nav + bottom nav) into #app-shell-root.
// Usage: Shell.render({ role: 'student', active: 'dashboard', navItems: [...] })

const Shell = {
  async render({ role, active, navItems }) {
    const base = window.BASE_PATH || './';
    const user = await Store.requireAuth(role);
    if (!user) return null;

    const root = document.getElementById('app-shell-root');
    const roleLabel = role === 'student' ? 'Student' : 'Lecturer';

    const sideLinks = navItems.map((item) => `
      <button class="nav-link ${item.key === active ? 'active' : ''}" data-nav="${item.key}">
        ${Icons[item.icon]('icon')}
        ${item.label}
      </button>
    `).join('');

    const bottomLinks = navItems.map((item) => `
      <button class="bottom-nav-link ${item.key === active ? 'active' : ''}" data-nav="${item.key}">
        ${Icons[item.icon]('icon')}
        ${item.label}
      </button>
    `).join('');

    root.innerHTML = `
      <header class="app-header">
        <div class="app-header-inner">
          <div class="flex items-center gap-3">
            <div class="brand">
              <span class="brand-mark inverted">${Icons.graduationCap('icon')}</span>
              <span class="brand-name inverted">AttendPro</span>
            </div>
            <span class="role-pill">${roleLabel}</span>
          </div>
          <div class="flex items-center gap-3">
            <div class="user-meta">
              <div class="name">${esc(user.name)}</div>
              <div class="email">${esc(user.email)}</div>
            </div>
            <span class="avatar avatar-inverted">${esc(initials(user.name))}</span>
            <button class="header-btn" id="logout-btn" aria-label="Log out">${Icons.logout('icon')}</button>
          </div>
        </div>
      </header>

      <div class="app-body">
        <aside class="sidebar">
          <nav>${sideLinks}</nav>
        </aside>
        <main class="main-content" id="main-content"></main>
      </div>

      <nav class="bottom-nav">
        <div class="bottom-nav-inner">${bottomLinks}</div>
      </nav>
    `;

    root.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = navItems.find((n) => n.key === btn.dataset.nav);
        if (item) window.location.href = base + item.href;
      });
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await Store.logout();
      window.location.href = base + 'index.html';
    });

    return user;
  },
};
