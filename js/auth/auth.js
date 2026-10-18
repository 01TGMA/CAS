// Auth screen: role tabs (student/lecturer) + login/register toggle,
// wired to Supabase auth through Store. Students pick a department once at
// registration; after that only an admin can change it.

(async function () {
  document.getElementById('brand-icon').innerHTML = Icons.graduationCap('icon');
  document.getElementById('tab-student').innerHTML = `${Icons.user('icon')} Student`;
  document.getElementById('tab-lecturer').innerHTML = `${Icons.graduationCap('icon')} Lecturer`;

  function goToDashboard(user) {
    window.location.href = user.role === 'student'
      ? 'pages/student/dashboard.html'
      : 'pages/lecturer/dashboard.html';
  }

  // If already logged in, skip straight to the right dashboard.
  let existing = null;
  try { existing = await Store.getUser(); } catch (err) { console.error(err); }
  if (existing) { goToDashboard(existing); return; }

  let mode = 'login';   // 'login' | 'register'
  let role = 'student'; // 'student' | 'lecturer'

  const els = {
    heading: document.getElementById('heading-title'),
    nameField: document.getElementById('name-field'),
    studentIdField: document.getElementById('student-id-field'),
    departmentField: document.getElementById('department-field'),
    department: document.getElementById('department'),
    submitBtn: document.getElementById('submit-btn'),
    switchText: document.getElementById('switch-text'),
    switchMode: document.getElementById('switch-mode'),
    tabStudent: document.getElementById('tab-student'),
    tabLecturer: document.getElementById('tab-lecturer'),
    form: document.getElementById('auth-form'),
  };

  const msg = document.createElement('p');
  msg.style.cssText = 'margin:0 0 0.75rem;font-size:0.875rem;';
  els.form.insertBefore(msg, els.submitBtn);

  function showMessage(text, isError = true) {
    msg.textContent = text;
    msg.style.color = isError ? 'var(--color-destructive)' : 'inherit';
  }

  let departmentsLoaded = false;
  async function loadDepartments() {
    if (departmentsLoaded) return;
    try {
      const depts = await Store.departments();
      els.department.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select your department';
      els.department.appendChild(placeholder);
      depts.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name;
        els.department.appendChild(opt);
      });
      departmentsLoaded = true;
    } catch (err) {
      showMessage('Could not load departments: ' + err.message);
    }
  }

  // Shows or hides the fields that only apply to student registration.
  function syncFields() {
    const isLogin = mode === 'login';
    const studentRegister = !isLogin && role === 'student';
    els.heading.textContent = isLogin ? 'Welcome back' : 'Create your account';
    els.nameField.style.display = isLogin ? 'none' : 'flex';
    els.studentIdField.style.display = studentRegister ? 'flex' : 'none';
    els.departmentField.style.display = studentRegister ? 'flex' : 'none';
    els.submitBtn.textContent = isLogin ? 'Login' : 'Create account';
    els.switchText.textContent = isLogin ? 'New to Caleb Attendace System? ' : 'Already have an account? ';
    els.switchMode.textContent = isLogin ? 'Register' : 'Login';
    els.tabStudent.classList.toggle('active', role === 'student');
    els.tabLecturer.classList.toggle('active', role === 'lecturer');
    if (studentRegister) loadDepartments();
  }

  els.tabStudent.addEventListener('click', () => { role = 'student'; syncFields(); });
  els.tabLecturer.addEventListener('click', () => { role = 'lecturer'; syncFields(); });
  els.switchMode.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    showMessage('');
    syncFields();
  });

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const studentId = document.getElementById('studentId').value.trim();
    const departmentId = els.department.value;

    if (!email || !password) return showMessage('Enter your email and password.');
    if (mode === 'register') {
      if (!name) return showMessage('Enter your full name.');
      if (role === 'student' && !studentId) return showMessage('Enter your student ID.');
      if (role === 'student' && !departmentId) return showMessage('Select your department.');
    }

    els.submitBtn.disabled = true;
    showMessage('');
    try {
      if (mode === 'register') {
        const data = await Store.register({ name, email, password, role, studentId, departmentId });
        if (!data.session) {
          mode = 'login';
          syncFields();
          showMessage('Account created. Confirm your email, then log in.', false);
          return;
        }
      } else {
        await Store.login(email, password);
      }
      const user = await Store.getUser();
      if (!user) throw new Error('Signed in, but no profile was found for this account.');
      goToDashboard(user);
    } catch (err) {
      showMessage(err.message || 'Something went wrong.');
    } finally {
      els.submitBtn.disabled = false;
    }
  });

  syncFields();
})();