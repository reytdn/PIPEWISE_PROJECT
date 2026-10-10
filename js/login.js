(() => {
  'use strict';

  window.__pipesenseLoginReady = true;

  const ENDPOINTS = {
    user: 'forms/login_user.php',
    register: 'forms/add_user.php',
    admin: 'forms/login_admin.php'
  };

  const BARANGAYS = [
    'Alangilan', 'Alijis', 'Banago',
    ...Array.from({ length: 41 }, (_, i) => `Barangay ${i + 1}`),
    'Bata', 'Cabug', 'Estefania', 'Felisa', 'Granada', 'Handumanan', 'Mandalagan',
    'Mansilingan', 'Montevista', 'Pahanocoy', 'Punta Taytay', 'Singcang-Airport',
    'Sum-ag', 'Taculing', 'Tangub', 'Villamonte', 'Vista Alegre'
  ];
  const SESSION_KEY = 'pipesense.user';
  const HOME_USER = 'user_dashboard.html';
  const HOME_ADMIN = 'admin_dashboard.html';

  const homeFor = (user) => (user && user.role === 'admin' ? HOME_ADMIN : HOME_USER);

  const $ = (sel) => document.querySelector(sel);

  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) { location.replace(homeFor(JSON.parse(saved))); return; }
  } catch (e) {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { }
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function notify(icon, title, messages) {
    const list = [].concat(messages || []).filter(Boolean);
    const html = list.length === 1
      ? `<p style="margin:0">${esc(list[0])}</p>`
      : list.length
        ? `<ul style="text-align:left;margin:0;padding-left:1.2em">${list.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
        : undefined;
    return Swal.fire({ icon, title, html, confirmButtonText: 'OK' });
  }

  async function post(url, fields) {
    const res = await fetch(url, {
      method: 'POST',
      body: new URLSearchParams(fields),
      credentials: 'same-origin'
    });
    if (res.status === 404) throw new Error(`File not found: ${url}`);
    const text = await res.text();
    try { return JSON.parse(text); }
    catch (e) {
      throw new Error('Unexpected reply from ' + url + ': ' + text.replace(/<[^>]*>/g, ' ').trim().slice(0, 160));
    }
  }

  function serverDown(err) {
    return notify('error', 'Cannot reach the server', [
      'Make sure Apache and MySQL are running in Laragon.',
      'Open this page from http://localhost/..., not as a file.',
      err && err.message ? 'Details: ' + err.message : ''
    ]);
  }

  function setBusy(form, busy, busyText) {
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = busyText; }
    else if (btn.dataset.label) { btn.textContent = btn.dataset.label; }
    btn.disabled = busy;
  }

  function startSession(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    sessionStorage.removeItem('pipesense.welcomed');
    return Swal.fire({
      icon: 'success',
      title: user.role === 'admin' ? 'Welcome, administrator' : `Welcome, ${user.name.split(' ')[0]}`,
      text: 'Opening your dashboard...',
      timer: 1300,
      timerProgressBar: true,
      showConfirmButton: false
    }).then(() => location.replace(homeFor(user)));
  }

  const addressSelect = $('#signupAddress');
  if (addressSelect) {
    BARANGAYS.forEach((b) => {
      const o = document.createElement('option');
      o.value = b;
      o.textContent = b;
      addressSelect.appendChild(o);
    });
  }

  const forms = { login: $('#residentForm'), signup: $('#registerForm'), admin: $('#adminForm') };

  function show(screen) {
    Object.entries(forms).forEach(([k, el]) => { el.hidden = k !== screen; });

    const isAdmin = screen === 'admin';
    $('#segResident').classList.toggle('is-active', !isAdmin);
    $('#segAdmin').classList.toggle('is-active', isAdmin);
    $('#segResident').setAttribute('aria-selected', String(!isAdmin));
    $('#segAdmin').setAttribute('aria-selected', String(isAdmin));
    $('#roleSwitch').hidden = screen === 'signup';

    $('#gateTitle').textContent = screen === 'signup' ? 'Create your account' : 'Log in';
    $('#gateLead').textContent = screen === 'signup'
      ? 'Residents can report water service issues and follow them on the map.'
      : 'Choose how you are using PipeSense.';

    const first = forms[screen].querySelector('input');
    if (first) first.focus();
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const USER_RE = /^[A-Za-z0-9_.-]{3,30}$/;

  function validateSignup(v) {
    const problems = [];
    if (!v.username || !v.password || !v.name || !v.address || !v.email) {
      problems.push('Every field is required, including your barangay.');
      return problems;
    }
    if (!BARANGAYS.includes(v.address)) problems.push('Select your barangay from the list.');
    if (!USER_RE.test(v.username)) problems.push('Username must be 3 to 30 letters, numbers, dots, dashes or underscores.');
    if (v.password.length < 8) problems.push('Password must be at least 8 characters.');
    if (!EMAIL_RE.test(v.email)) problems.push('Enter a valid email address.');
    return problems;
  }

  async function onUserLogin(e) {
    e.preventDefault();
    const f = e.target;
    const username = f.elements.username.value.trim();
    const password = f.elements.password.value;

    if (!username || !password) {
      return notify('warning', 'Missing details', 'Enter your username (or email) and your password.');
    }

    setBusy(f, true, 'Logging in...');
    try {
      const res = await post(ENDPOINTS.user, { action: 'login', username, password });
      if (res.status === 'success') { f.reset(); return await startSession(res.user); }
      await notify('error', 'Failed to login', res.message);
    } catch (err) {
      await serverDown(err);
    } finally {
      setBusy(f, false);
    }
  }

  async function onSignup(e) {
    e.preventDefault();
    const f = e.target;
    const v = {
      username: f.elements.username.value.trim(),
      password: f.elements.password.value,
      name: f.elements.name.value.trim(),
      address: f.elements.address.value.trim(),
      email: f.elements.email.value.trim()
    };

    const problems = validateSignup(v);
    if (problems.length) return notify('warning', 'Check your details', problems);

    setBusy(f, true, 'Creating account...');
    try {
      const res = await post(ENDPOINTS.register, v);
      if (res.status === 'success') {
        f.reset();
        await Swal.fire({
          icon: 'success',
          title: 'Account created',
          html: `<p style="margin:0 0 6px">${esc(res.message)}</p>
                 <p style="margin:0">Username: <b>${esc(v.username)}</b><br>Barangay: <b>${esc(v.address)}, Bacolod City</b></p>`,
          confirmButtonText: 'Go to log in'
        });
        show('login');
        forms.login.elements.username.value = v.username;
        forms.login.elements.password.focus();
        return;
      }
      const msgs = res.errors && res.errors.length ? [...res.errors] : [res.message];
      if (res.detail) msgs.push('Details: ' + res.detail);
      await notify('error', 'Could not create your account', msgs);
    } catch (err) {
      await serverDown(err);
    } finally {
      setBusy(f, false);
    }
  }

  async function onAdminLogin(e) {
    e.preventDefault();
    const f = e.target;
    const username = f.elements.username.value.trim();
    const password = f.elements.password.value;

    if (!username || !password) {
      return notify('warning', 'Missing details', 'Enter the administrator username and password.');
    }

    setBusy(f, true, 'Logging in...');
    try {
      const res = await post(ENDPOINTS.admin, { username, password });
      if (res.status === 'success') { f.reset(); return await startSession(res.user); }
      await notify('error', 'Failed to login', res.message);
    } catch (err) {
      await serverDown(err);
    } finally {
      setBusy(f, false);
    }
  }

  if (!window.Swal) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div class="boot-error" role="alert">SweetAlert2 did not load. Check your internet connection and reload.</div>');
  }

  $('#segResident').addEventListener('click', () => show('login'));
  $('#segAdmin').addEventListener('click', () => show('admin'));
  $('#showSignup').addEventListener('click', () => show('signup'));
  $('#backToLogin').addEventListener('click', () => show('login'));
  forms.login.addEventListener('submit', onUserLogin);
  forms.signup.addEventListener('submit', onSignup);
  forms.admin.addEventListener('submit', onAdminLogin);
  forms.login.elements.username.focus();

  if (location.hash === '#signup') show('signup');
})();
