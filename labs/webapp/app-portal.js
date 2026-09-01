/* =========================================================================
   RAD 321: Department VPS Laboratory Management & AI Platform
   Portal Frontend Controller (app-portal.js)
   ========================================================================= */

const LAB_TITLES = [
  "The Imaging Chain & Radiographer's Role",
  "Image Formation Simulator",
  "Film Receptors & Darkroom Conditions",
  "Optical Density & Sensitometry",
  "Radiographic Contrast Simulator",
  "Spatial Resolution & Magnification",
  "Geometric Distortion Simulator",
  "Scatter Control, Collimation & Grids",
  "Quantum Noise, DQE & SNR Lab",
  "Fluoroscopy Imaging Chain Simulator",
  "Digital Receptors & Digital Resolution",
  "Digital Contrast, Windowing & Latitude",
  "The IMAGE Process: Recording Stages",
  "The IMAGE Process: Evaluate (Critique)",
  "Radiographic Artifact Identification Lab"
];

const LAB_DESCS = [
  "X-ray tube components, 4 stages of image formation, receptor families, and radiographer dual role.",
  "kVp/mAs/SID/OID sliders, inverse-square law, magnification, and formation stage challenge.",
  "Double-emulsion film, latent image, darkroom conditions, and processor chemistry cycle.",
  "Virtual sensitometry, densitometry, H&D curve, speed point, latitude, and gamma.",
  "kVp, subject contrast, receptor contrast, long/short-scale comparison, and windowing.",
  "Focal-spot blur, magnification, geometric unsharpness, and line-pair resolution phantom.",
  "CR angle, part/IR alignment, elongation, foreshortening, and shape distortion.",
  "Field size, scatter fraction, collimation, grid ratio, and Bucky factor compensation.",
  "mAs, quantum mottle, intrinsic noise, DQE, Rose criterion, SNR, and CNR.",
  "Image-intensifier chain, magnification mode, dose rate multiplier, and pulsed fluoro.",
  "CR vs DR pathways, direct/indirect conversion, pixel pitch, matrix, and Nyquist frequency.",
  "Window width/level, histogram interpretation, Exposure Index, and Deviation Index.",
  "Systematic clinical workflow: Initial setup, Manual factors, Anatomy prep, Guidance/alignment.",
  "Virtual image critique: anatomy, positioning, exposure, markers, artifacts, and ALARA gating.",
  "10 authentic artifact cases, root-cause isolation (I, M, A, G, E), VOI obstruction, and QA quarantine."
];

let currentUser = null;
let currentToken = null;

// Universal Toast Notification
function showToast(message, type = 'info') {
  let container = document.getElementById('portal-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'portal-toast-container';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const bg = type === 'success' ? '#059669' : (type === 'error' || type === 'danger') ? '#dc2626' : '#0b2545';
  toast.style.cssText = `background:${bg};color:#ffffff;padding:12px 20px;border-radius:8px;box-shadow:0 6px 16px rgba(0,0,0,0.3);font-size:13.5px;font-weight:700;display:flex;align-items:center;gap:10px;pointer-events:auto;transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1);transform:translateY(12px);opacity:0;`;
  
  const icon = type === 'success' ? '✓' : (type === 'error' || type === 'danger') ? '✕' : 'ℹ';
  toast.innerHTML = `<span style="font-size:16px;">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

window.showToast = showToast;
window.RadLab = window.RadLab || {};
window.RadLab.toast = showToast;

// Initialize Portal on Load
document.addEventListener('DOMContentLoaded', () => {
  initAuthSession();
  initModals();
  initPortalTabs();
  checkUrlActivation();
  loadPublicOrStudentView();
});

// -----------------------------------------------------------------------------
// 1. Authentication & Session Handling
// -----------------------------------------------------------------------------
function initAuthSession() {
  currentToken = localStorage.getItem('rad321_jwt');
  const userJson = localStorage.getItem('rad321_user');
  if (currentToken && userJson) {
    try {
      currentUser = JSON.parse(userJson);
      renderUserHeader(currentUser);
    } catch (e) {
      logout();
    }
  } else {
    renderGuestHeader();
  }
}

function renderUserHeader(user) {
  const authWrap = document.getElementById('auth-actions-wrap');
  if (!authWrap) return;

  authWrap.innerHTML = `
    <div class="user-badge-chip">
      <i class="fa-solid fa-user"></i>
      <span>${user.name}</span>
      <span class="role-pill ${user.role}">${user.role}</span>
    </div>
    <button class="topbar-pill-btn" id="btn-logout" type="button"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>
  `;

  document.getElementById('btn-logout').addEventListener('click', logout);

  // Show mode tabs based on role
  const navBar = document.getElementById('portal-nav-bar');
  const tabTeacher = document.getElementById('tab-btn-teacher');
  const tabAdmin = document.getElementById('tab-btn-admin');

  navBar.style.display = 'flex';
  if (user.role === 'admin') {
    tabTeacher.style.display = 'inline-flex';
    tabAdmin.style.display = 'inline-flex';
  } else if (user.role === 'teacher') {
    tabTeacher.style.display = 'inline-flex';
    tabAdmin.style.display = 'none';
  } else {
    tabTeacher.style.display = 'none';
    tabAdmin.style.display = 'none';
  }
}

function renderGuestHeader() {
  const authWrap = document.getElementById('auth-actions-wrap');
  if (!authWrap) return;

  authWrap.innerHTML = `
    <button class="topbar-pill-btn" id="btn-show-login" type="button"><i class="fa-solid fa-right-to-bracket"></i> Login</button>
    <button class="btn btn-teal btn-sm" id="btn-show-register" type="button"><i class="fa-solid fa-user-plus"></i> Self-Register</button>
  `;

  document.getElementById('btn-show-login').addEventListener('click', () => showModal('modal-login'));
  document.getElementById('btn-show-register').addEventListener('click', () => {
    loadRegistrationSections();
    showModal('modal-register');
  });

  const navBar = document.getElementById('portal-nav-bar');
  if (navBar) navBar.style.display = 'none';
}

function logout() {
  localStorage.removeItem('rad321_jwt');
  localStorage.removeItem('rad321_user');
  currentUser = null;
  currentToken = null;
  location.href = '/';
}

function quickFillLogin(email, pass) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = pass;
}

// -----------------------------------------------------------------------------
// 2. Navigation & Tabs
// -----------------------------------------------------------------------------
function initPortalTabs() {
  // Main Portal Tabs
  document.querySelectorAll('.portal-tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.portal-tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.portal-tab-content').forEach(c => c.style.display = 'none');

      btn.classList.add('active');
      const tabId = 'tab-' + btn.dataset.tab;
      const target = document.getElementById(tabId);
      if (target) target.style.display = 'block';

      if (btn.dataset.tab === 'teacher-view') loadTeacherView();
      if (btn.dataset.tab === 'admin-view') loadAdminView();
      if (btn.dataset.tab === 'student-view') loadPublicOrStudentView();
    });
  });

  // Teacher Sub-tabs
  document.querySelectorAll('.portal-tab-btn[data-subtab^="t-"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.portal-tab-btn[data-subtab^="t-"]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.teacher-subtab-content').forEach(c => c.style.display = 'none');

      btn.classList.add('active');
      const target = document.getElementById('subtab-' + btn.dataset.subtab);
      if (target) target.style.display = 'block';

      if (btn.dataset.subtab === 't-sections') loadTeacherSections();
      if (btn.dataset.subtab === 't-teaching') loadTeacherLiveLabs();
      if (btn.dataset.subtab === 't-grading') loadTeacherSubmissions();
      if (btn.dataset.subtab === 't-analytics') loadTeacherAnalytics();
    });
  });

  // Admin Sub-tabs
  document.querySelectorAll('.portal-tab-btn[data-subtab^="a-"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.portal-tab-btn[data-subtab^="a-"]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-subtab-content').forEach(c => c.style.display = 'none');

      btn.classList.add('active');
      const target = document.getElementById('subtab-' + btn.dataset.subtab);
      if (target) target.style.display = 'block';

      if (btn.dataset.subtab === 'a-approvals') loadAdminApprovals();
      if (btn.dataset.subtab === 'a-users') loadAdminUsers();
      if (btn.dataset.subtab === 'a-settings') loadAdminSettings();
      if (btn.dataset.subtab === 'a-outbox') loadAdminOutbox();
      if (btn.dataset.subtab === 'a-logs') loadAdminLogs();
    });
  });
}

// -----------------------------------------------------------------------------
// 3. Modals Management
// -----------------------------------------------------------------------------
function initModals() {
  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.portal-modal-backdrop').forEach(m => m.style.display = 'none');
    });
  });

  document.querySelectorAll('.portal-modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.style.display = 'none';
    });
  });

  // Form: Login
  document.getElementById('form-login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('rad321_jwt', data.token);
      localStorage.setItem('rad321_user', JSON.stringify(data.user));
      currentUser = data.user;
      currentToken = data.token;

      hideModal('modal-login');
      renderUserHeader(currentUser);
      RadLab.toast(`Welcome, ${currentUser.name}!`, 'success');

      if (currentUser.role === 'admin') {
        document.getElementById('tab-btn-admin').click();
      } else if (currentUser.role === 'teacher') {
        document.getElementById('tab-btn-teacher').click();
      } else {
        loadPublicOrStudentView();
      }
    } catch (err) {
      alert('Login Error: ' + err.message);
    }
  });

  // Form: Register
  document.getElementById('form-register')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const studentId = document.getElementById('reg-student-id').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const gender = document.getElementById('reg-gender').value;
    const classYear = document.getElementById('reg-class').value.trim();
    const sectionId = document.getElementById('reg-section').value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, studentId, email, gender, classYear, sectionId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      hideModal('modal-register');
      alert('Registration Successful!\n\nYour application has been submitted to the Department Administrator. Once approved, you will receive an activation email with your one-time password setup token.');
    } catch (err) {
      alert('Registration Error: ' + err.message);
    }
  });

  // Form: Activate
  document.getElementById('form-activate')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('act-token').value.trim();
    const newPassword = document.getElementById('act-password').value;
    const confirmPassword = document.getElementById('act-password-confirm').value;

    if (newPassword !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Activation failed');

      localStorage.setItem('rad321_jwt', data.token);
      localStorage.setItem('rad321_user', JSON.stringify(data.user));
      currentUser = data.user;
      currentToken = data.token;

      hideModal('modal-activate');
      renderUserHeader(currentUser);
      alert('Account activated and password established! Welcome to RAD 321.');
      loadPublicOrStudentView();
    } catch (err) {
      alert('Activation Error: ' + err.message);
    }
  });

  // Form: Edit User
  document.getElementById('form-edit-user')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('edit-user-id').value;
    const name = document.getElementById('edit-user-name').value.trim();
    const student_id = document.getElementById('edit-user-student-id').value.trim() || null;
    const email = document.getElementById('edit-user-email').value.trim();
    const role = document.getElementById('edit-user-role').value;
    const gender = document.getElementById('edit-user-gender').value;
    const class_year = document.getElementById('edit-user-class-year').value.trim();
    const status = document.getElementById('edit-user-status').value;
    const section_id = document.getElementById('edit-user-section').value || null;
    const password = document.getElementById('edit-user-password').value;

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + currentToken
        },
        body: JSON.stringify({ name, student_id, email, role, gender, class_year, status, section_id, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user.');

      hideModal('modal-edit-user');
      showToast(data.message || 'User updated successfully!', 'success');
      loadAdminUsers();
      loadAdminView();
    } catch (err) {
      alert('Update Error: ' + err.message);
    }
  });

  // Form: Create User
  document.getElementById('form-create-user')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('create-user-name').value.trim();
    const student_id = document.getElementById('create-user-student-id').value.trim() || null;
    const email = document.getElementById('create-user-email').value.trim();
    const role = document.getElementById('create-user-role').value;
    const gender = document.getElementById('create-user-gender').value;
    const class_year = document.getElementById('create-user-class-year').value.trim();
    const status = document.getElementById('create-user-status').value;
    const section_id = document.getElementById('create-user-section').value || null;
    const password = document.getElementById('create-user-password').value;

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + currentToken
        },
        body: JSON.stringify({ name, student_id, email, role, gender, class_year, status, section_id, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user.');

      hideModal('modal-create-user');
      showToast('User created successfully!', 'success');
      loadAdminUsers();
      loadAdminView();
    } catch (err) {
      alert('Creation Error: ' + err.message);
    }
  });

  document.getElementById('btn-create-user-modal')?.addEventListener('click', openCreateUserModal);
}

function showModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function hideModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function checkUrlActivation() {
  const path = window.location.pathname;
  let token = null;

  if (path.startsWith('/activate/')) {
    token = path.replace('/activate/', '').trim();
  } else {
    const params = new URLSearchParams(window.location.search);
    token = params.get('activate');
  }

  if (token) {
    document.getElementById('act-token').value = token;
    showModal('modal-activate');
  }
}

async function loadRegistrationSections() {
  try {
    const res = await fetch('/api/auth/sections');
    const data = await res.json();
    const sel = document.getElementById('reg-section');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select Section Preference --</option>';
    (data.sections || []).forEach(s => {
      sel.innerHTML += `<option value="${s.id}">${s.name} (${s.code}) - ${s.gender_target}</option>`;
    });
  } catch (e) {}
}

// -----------------------------------------------------------------------------
// 4. Student & Public View
// -----------------------------------------------------------------------------
async function loadPublicOrStudentView() {
  let submissionMap = {};
  let studentSummary = null;

  if (currentUser && currentToken) {
    try {
      const res = await fetch('/api/student/dashboard', {
        headers: { 'Authorization': 'Bearer ' + currentToken }
      });
      if (res.ok) {
        const data = await res.json();
        studentSummary = data.summary;

        (data.labs || []).forEach(item => {
          if (item.submission) {
            submissionMap[item.labId] = item.submission;
          }
        });

        // Update Student Stats
        document.getElementById('stat-completed-labs').textContent = `${studentSummary.completedLabs} / 15`;
        document.getElementById('stat-contact-hours').textContent = `${studentSummary.contactHours} / 30 hrs`;
        document.getElementById('stat-avg-score').textContent = `${studentSummary.averageScore} / 20`;
        document.getElementById('stat-gpa').textContent = `${studentSummary.gpaPercentage}%`;

        // Update Hero Title
        document.getElementById('student-hero-title').textContent = `Welcome, ${currentUser.name}`;
        document.getElementById('student-hero-desc').textContent = `Enrolled in ${currentUser.section_name || 'Department Cohort'} · ${studentSummary.completedLabs} of 15 virtual labs completed (${studentSummary.contactHours} contact hours recorded).`;

        // Render Announcements
        const annWrap = document.getElementById('student-announcements-wrap');
        const annList = document.getElementById('student-announcements-list');
        if (data.announcements && data.announcements.length) {
          annWrap.style.display = 'block';
          annList.innerHTML = '';
          data.announcements.forEach(a => {
            annList.innerHTML += `
              <div style="background:var(--rad-bg-soft);padding:10px 14px;border-radius:8px;">
                <div class="flex justify-between items-center">
                  <strong style="color:var(--rad-navy);font-size:14px;">${a.subject}</strong>
                  <span class="muted small">${new Date(a.created_at).toLocaleDateString()}</span>
                </div>
                <p style="margin:4px 0 0;font-size:13px;white-space:pre-line;">${a.body}</p>
                <div class="muted small" style="margin-top:4px;">Posted by: ${a.sender_name}</div>
              </div>
            `;
          });
        } else {
          annWrap.style.display = 'none';
        }
      }
    } catch (e) {}
  }

  // Render 15 Labs Grid
  const grid = document.getElementById('student-lab-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (let i = 1; i <= 15; i++) {
    const pad = String(i).padStart(2, '0');
    const labId = `lab-${pad}`;
    const title = LAB_TITLES[i - 1];
    const desc = LAB_DESCS[i - 1];
    const sub = submissionMap[labId];

    let statusClass = 'status-not_started';
    let statusText = 'Available';
    let badgeBg = '#eef3f8';
    let badgeColor = 'var(--rad-text-faint)';

    if (sub) {
      if (sub.status === 'graded') {
        statusClass = 'status-graded';
        statusText = `Graded: ${sub.total_score}/20`;
        badgeBg = '#dcfce7';
        badgeColor = '#15803d';
      } else if (sub.status === 'submitted') {
        statusClass = 'status-submitted';
        statusText = 'Submitted';
        badgeBg = '#e0f2fe';
        badgeColor = '#0369a1';
      } else if (sub.status === 'in_progress') {
        statusClass = 'status-in_progress';
        statusText = 'In Progress';
        badgeBg = '#fef3c7';
        badgeColor = '#b45309';
      }
    }

    grid.innerHTML += `
      <div class="lab-tile ${statusClass}">
        <span class="status-pill" style="background:${badgeBg};color:${badgeColor};">${statusText}</span>
        <div class="lab-week">Week ${i} · 2 Contact Hours</div>
        <h3>Lab ${i}: ${title}</h3>
        <p class="desc">${desc}</p>
        <div class="tile-actions">
          <a class="btn btn-primary btn-sm" href="labs/${labId}/index.html"><i class="fa-solid fa-flask"></i> ${sub?.status === 'graded' ? 'Review Lab' : 'Start Lab'}</a>
          <a class="btn btn-secondary btn-sm" href="handouts/${labId}-student.html" target="_blank"><i class="fa-solid fa-file-lines"></i> Handout</a>
        </div>
      </div>
    `;
  }
}

// -----------------------------------------------------------------------------
// 5. Teacher Mode Controller
// -----------------------------------------------------------------------------
async function loadTeacherView() {
  try {
    const res = await fetch('/api/teacher/dashboard', {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('teacher-stat-sections').textContent = data.summary.totalSections;
    document.getElementById('teacher-stat-students').textContent = data.summary.totalStudents;
    document.getElementById('teacher-stat-pending').textContent = data.summary.pendingSubmissions;
    document.getElementById('teacher-stat-graded').textContent = data.summary.gradedSubmissions;

    loadTeacherSections();
  } catch (e) {}
}

async function loadTeacherSections() {
  try {
    const res = await fetch('/api/teacher/sections', {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    const grid = document.getElementById('teacher-sections-grid');
    if (!grid) return;

    grid.innerHTML = '';
    (data.sections || []).forEach(sec => {
      grid.innerHTML += `
        <div class="card" style="border-top:4px solid var(--rad-teal);">
          <div class="flex justify-between items-center">
            <span class="badge" style="background:#e0f2fe;color:#0369a1;">${sec.code}</span>
            <span class="muted small">${sec.gender_target} Cohort</span>
          </div>
          <h3 style="margin:8px 0 4px;color:var(--rad-navy);">${sec.name}</h3>
          <p class="muted small" style="margin:0 0 12px;">${sec.description || 'No description'}</p>
          <div class="flex justify-between items-center" style="border-top:1px solid var(--rad-border);padding-top:10px;">
            <span style="font-weight:700;color:var(--rad-teal);">${sec.student_count} Students Enrolled</span>
            <div class="flex gap-6">
              <button class="btn btn-secondary btn-sm" onclick="viewSectionRoster(${sec.id}, '${sec.name}')"><i class="fa-solid fa-users"></i> Roster</button>
              <button class="btn btn-teal btn-sm" onclick="openBroadcastModal(${sec.id}, '${sec.name}')"><i class="fa-solid fa-envelope"></i> Message</button>
            </div>
          </div>
        </div>
      `;
    });
  } catch (e) {}
}

async function viewSectionRoster(sectionId, sectionName) {
  try {
    const res = await fetch(`/api/teacher/sections/${sectionId}/roster`, {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();

    const wrap = document.getElementById('section-roster-wrap');
    const tbody = document.getElementById('section-roster-tbody');
    document.getElementById('section-roster-title').textContent = `${sectionName} — Student Roster`;
    document.getElementById('section-roster-sub').textContent = `${data.students.length} students assigned to this section`;

    tbody.innerHTML = '';
    data.students.forEach(st => {
      tbody.innerHTML += `
        <tr>
          <td><strong>${st.student_id || 'N/A'}</strong></td>
          <td>${st.name}</td>
          <td>${st.email}</td>
          <td><span class="badge">${st.gender}</span></td>
          <td>${st.class_year || 'Year 3'}</td>
          <td><span class="badge" style="background:#dcfce7;color:#15803d;">${st.status}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="inspectStudentReport(${st.id})"><i class="fa-solid fa-chart-line"></i> Report</button>
          </td>
        </tr>
      `;
    });

    wrap.style.display = 'block';
    wrap.scrollIntoView({ behavior: 'smooth' });
  } catch (e) {}
}

function openBroadcastModal(sectionId, sectionName) {
  document.getElementById('broadcast-section-id').value = sectionId;
  document.getElementById('broadcast-sec-name').textContent = `Sending to: ${sectionName}`;
  showModal('modal-broadcast');
}

// Live Teaching Mode Launcher Grid
function loadTeacherLiveLabs() {
  const grid = document.getElementById('teacher-live-labs-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (let i = 1; i <= 15; i++) {
    const pad = String(i).padStart(2, '0');
    const labId = `lab-${pad}`;
    const title = LAB_TITLES[i - 1];

    grid.innerHTML += `
      <div class="card" style="border-top:4px solid #0284c7;">
        <div class="lab-week">Week ${i} · Live Teaching Station</div>
        <h3 style="margin:4px 0 8px;color:var(--rad-navy);">Lab ${i}: ${title}</h3>
        <div class="flex gap-8" style="flex-wrap:wrap;margin-top:12px;">
          <a class="btn btn-primary btn-sm" href="labs/${labId}/index.html?mode=teacher" target="_blank"><i class="fa-solid fa-chalkboard-user"></i> Launch Teaching Mode</a>
          <a class="btn btn-secondary btn-sm" href="handouts/${labId}-teacher.html" target="_blank"><i class="fa-solid fa-key"></i> Instructor Guide</a>
          <a class="btn btn-ghost btn-sm" href="handouts/${labId}-student.html" target="_blank">Student Handout</a>
        </div>
      </div>
    `;
  }
}

// Submissions & AI Grading Table
async function loadTeacherSubmissions() {
  const filterLab = document.getElementById('filter-grade-lab')?.value || '';
  const filterSec = document.getElementById('filter-grade-sec')?.value || '';
  const filterGender = document.getElementById('filter-grade-gender')?.value || '';
  const filterStatus = document.getElementById('filter-grade-status')?.value || '';

  try {
    let url = `/api/teacher/submissions?labId=${filterLab}&sectionId=${filterSec}&gender=${filterGender}&status=${filterStatus}`;
    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    const tbody = document.getElementById('submissions-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (!data.submissions || !data.submissions.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="muted text-center" style="padding:20px;">No submissions found matching criteria.</td></tr>';
      return;
    }

    data.submissions.forEach(sub => {
      let statusBadge = `<span class="badge" style="background:#e0f2fe;color:#0369a1;">Submitted</span>`;
      if (sub.status === 'graded') statusBadge = `<span class="badge" style="background:#dcfce7;color:#15803d;">Graded</span>`;
      if (sub.status === 'in_progress') statusBadge = `<span class="badge" style="background:#fef3c7;color:#b45309;">In Progress</span>`;

      tbody.innerHTML += `
        <tr>
          <td>
            <strong>${sub.student_name}</strong><br>
            <span class="muted small">${sub.student_id || sub.email}</span>
          </td>
          <td><strong>${sub.lab_id.toUpperCase()}</strong> (W${sub.week_number})</td>
          <td>${sub.section_name || 'Unassigned'}</td>
          <td><span class="badge">${sub.gender}</span></td>
          <td>${statusBadge}</td>
          <td><strong style="color:var(--rad-teal);font-size:15px;">${sub.status === 'graded' ? sub.total_score + ' / 20' : '--'}</strong></td>
          <td>${sub.attachment_count > 0 ? `<span class="badge" style="background:#e0f2fe;"><i class="fa-solid fa-paperclip"></i> ${sub.attachment_count} files</span>` : '<span class="muted">—</span>'}</td>
          <td class="small muted">${sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : 'Draft'}</td>
          <td>
            <div class="flex gap-6">
              <button class="btn btn-secondary btn-sm" onclick="inspectSubmission(${sub.id})"><i class="fa-solid fa-eye"></i> Inspect</button>
              ${sub.status === 'submitted' ? `<button class="btn btn-teal btn-sm" onclick="triggerAiGrading(${sub.id})"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Grade</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    });
  } catch (e) {}
}

// Submission Inspector Modal
async function inspectSubmission(submissionId) {
  try {
    const res = await fetch(`/api/teacher/submissions/${submissionId}`, {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    const sub = data.submission;

    document.getElementById('inspect-title').textContent = `Evaluation: ${sub.lab_id.toUpperCase()} — ${sub.student_name}`;
    document.getElementById('inspect-student-meta').textContent = `Student ID: ${sub.student_id || 'N/A'} · Gender: ${sub.gender} · Section: ${sub.section_name || 'N/A'}`;

    const body = document.getElementById('inspect-content-body');
    const fields = sub.state_data?.fields || {};
    const runs = sub.runs_data || [];
    const aiFeedback = sub.ai_feedback;

    let runsTableHTML = '<p class="muted">No runs recorded.</p>';
    if (runs.length) {
      runsTableHTML = `
        <table class="data-table" style="font-size:12px;margin:8px 0;">
          <thead><tr><th>#</th><th>Settings</th><th>Key Metrics</th><th>Clinical Observation</th></tr></thead>
          <tbody>
            ${runs.map((r, i) => `<tr><td>${i+1}</td><td>${r.settings || ''}</td><td>${Array.isArray(r.metrics) ? r.metrics.map(m=>m.label+': '+m.value).join('; ') : (r.result||'')}</td><td>${r.observation||r.interpretation||''}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
    }

    let attachmentsHTML = '<p class="muted small">No attached files.</p>';
    if (sub.attachments && sub.attachments.length) {
      attachmentsHTML = sub.attachments.map(a => `
        <div class="attachment-item" style="margin-bottom:6px;">
          <span><i class="fa-solid fa-file"></i> <b>${a.original_filename}</b> (${Math.round(a.file_size/1024)} KB)</span>
          <a href="/api/attachments/${a.id}/download" class="btn btn-secondary btn-sm" target="_blank">Download</a>
        </div>
      `).join('');
    }

    body.innerHTML = `
      <div class="stat-strip" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px;">
        <div class="stat-card" style="padding:10px;"><div class="num" style="font-size:20px;">${sub.status.toUpperCase()}</div><div class="lbl">Submission Status</div></div>
        <div class="stat-card" style="padding:10px;"><div class="num" style="font-size:20px;color:var(--rad-teal);">${sub.total_score || 0} / 20</div><div class="lbl">Current Score</div></div>
        <div class="stat-card" style="padding:10px;"><div class="num" style="font-size:20px;">${sub.quiz_score || 0} / ${sub.quiz_total || 4}</div><div class="lbl">Quiz Score</div></div>
      </div>

      <div class="card" style="margin-bottom:14px;background:var(--rad-bg-soft);">
        <h4 style="margin:0 0 6px;color:var(--rad-navy);">1. Initial Scientific Prediction</h4>
        <p style="margin:0;font-size:13px;font-style:italic;">"${sub.prediction || fields['w-prediction'] || 'No prediction recorded.'}"</p>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div class="flex justify-between items-center">
          <h4 style="margin:0;color:var(--rad-navy);">2. Controlled Experimental Runs (${runs.length} Runs)</h4>
          <button class="btn btn-ghost btn-sm" onclick="RadLab.downloadRunsCSV.call({state:{activities:{'experiment-log':{runs:${JSON.stringify(runs)}}},meta:{studentId:'${sub.student_id}'}},config:{labId:'${sub.lab_id}'},toast:alert})">📥 Download Run CSV</button>
        </div>
        ${runsTableHTML}
      </div>

      <div class="card" style="margin-bottom:14px;">
        <h4 style="margin:0 0 8px;color:var(--rad-navy);">3. Worksheet Written Analysis &amp; Clinical Synthesis</h4>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
          ${Object.entries(fields).filter(([k]) => k.startsWith('q')).map(([k, v]) => `
            <div style="background:var(--rad-bg-soft);padding:8px 12px;border-radius:6px;">
              <b style="color:var(--rad-blue);">${k.toUpperCase()}:</b>
              <div style="margin-top:2px;">${String(v).replace(/\n/g, '<br>')}</div>
            </div>
          `).join('') || '<p class="muted">No written responses.</p>'}
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <h4 style="margin:0 0 8px;color:var(--rad-navy);">4. Assignment Attachments</h4>
        ${attachmentsHTML}
      </div>

      ${aiFeedback ? `
        <div class="graded-feedback-card" style="margin-bottom:14px;">
          <div style="font-weight:800;color:#38bdf8;font-size:15px;margin-bottom:6px;"><i class="fa-solid fa-microchip"></i> Gemini Flash 3.7 AI Assessment</div>
          <p style="font-size:13.5px;line-height:1.5;margin:0 0 10px;">${aiFeedback.overallFeedback || ''}</p>
          <div style="font-size:12.5px;color:#7fe0d6;">
            <b>Strengths:</b> ${(aiFeedback.strengths || []).join(' · ')}<br>
            <b>Areas for Improvement:</b> ${(aiFeedback.areasForImprovement || []).join(' · ')}
          </div>
        </div>
      ` : ''}

      <div class="card" style="border-top:4px solid var(--rad-teal);">
        <h4 style="margin:0 0 10px;color:var(--rad-navy);"><i class="fa-solid fa-sliders"></i> Instructor Score &amp; Feedback Override</h4>
        <div class="form-grid-2">
          <div class="form-group">
            <label>Final Total Score (out of 20 pts)</label>
            <input type="number" id="manual-total-score" min="0" max="20" step="0.5" value="${sub.total_score || 0}">
          </div>
          <div class="form-group">
            <label>Instructor Comments</label>
            <textarea id="manual-teacher-feedback" rows="2" placeholder="Add personalized instructor feedback...">${sub.teacher_feedback || ''}</textarea>
          </div>
        </div>
        <div class="flex gap-8 justify-end">
          <button type="button" class="btn btn-teal" onclick="triggerAiGrading(${sub.id})"><i class="fa-solid fa-wand-magic-sparkles"></i> Re-Grade with Gemini Flash 3.7</button>
          <button type="button" class="btn btn-primary" onclick="saveManualGrade(${sub.id})">Save Grade &amp; Feedback</button>
        </div>
      </div>
    `;

    showModal('modal-inspect-submission');
  } catch (e) {
    alert('Error loading submission details: ' + e.message);
  }
}

async function triggerAiGrading(submissionId) {
  try {
    RadLab.toast('Running Gemini Flash 3.7 AI evaluation...', 'info');
    const res = await fetch(`/api/teacher/submissions/${submissionId}/grade-ai`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'AI grading failed');

    RadLab.toast(`Graded successfully! Score: ${data.evaluation.totalScore}/20`, 'success');
    inspectSubmission(submissionId);
    loadTeacherSubmissions();
  } catch (err) {
    alert('AI Grading Error: ' + err.message);
  }
}

async function saveManualGrade(submissionId) {
  const totalScore = document.getElementById('manual-total-score').value;
  const teacherFeedback = document.getElementById('manual-teacher-feedback').value;

  try {
    const res = await fetch(`/api/teacher/submissions/${submissionId}/grade-manual`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + currentToken
      },
      body: JSON.stringify({ totalScore, teacherFeedback })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Update failed');

    RadLab.toast('Grade and feedback saved successfully.', 'success');
    hideModal('modal-inspect-submission');
    loadTeacherSubmissions();
  } catch (err) {
    alert('Error saving grade: ' + err.message);
  }
}

// Teacher Analytics & Comparative Reporting
async function loadTeacherAnalytics() {
  try {
    const res = await fetch('/api/teacher/reports/course-analytics', {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();

    const m = data.genderComparison.male;
    const f = data.genderComparison.female;

    document.getElementById('male-headcount').textContent = `${m.count} Students`;
    document.getElementById('male-avg-score').textContent = `${m.averageScore}`;
    document.getElementById('male-pass-rate').textContent = `${m.passRate}%`;
    document.getElementById('male-dist-rate').textContent = `${m.distinctionRate}%`;
    document.getElementById('male-rubric-summary').innerHTML = `<b>Rubric Averages:</b> Concepts: ${m.rubricAverages.c1}/4 | Sim: ${m.rubricAverages.c2}/5 | Calc: ${m.rubricAverages.c3}/5 | ALARA: ${m.rubricAverages.c4}/3`;

    document.getElementById('female-headcount').textContent = `${f.count} Students`;
    document.getElementById('female-avg-score').textContent = `${f.averageScore}`;
    document.getElementById('female-pass-rate').textContent = `${f.passRate}%`;
    document.getElementById('female-dist-rate').textContent = `${f.distinctionRate}%`;
    document.getElementById('female-rubric-summary').innerHTML = `<b>Rubric Averages:</b> Concepts: ${f.rubricAverages.c1}/4 | Sim: ${f.rubricAverages.c2}/5 | Calc: ${f.rubricAverages.c3}/5 | ALARA: ${f.rubricAverages.c4}/3`;

    const secTbody = document.getElementById('section-analytics-tbody');
    if (!secTbody) return;
    secTbody.innerHTML = '';

    (data.sectionComparisons || []).forEach(sc => {
      secTbody.innerHTML += `
        <tr>
          <td><strong>${sc.name}</strong></td>
          <td>${sc.code}</td>
          <td><span class="badge">${sc.genderTarget}</span></td>
          <td>${sc.studentCount}</td>
          <td><strong style="color:var(--rad-teal);">${sc.averageScore} / 20</strong></td>
          <td>${sc.completionRate}%</td>
          <td>${sc.passRate}%</td>
          <td>
            <a href="/api/teacher/reports/export-csv?sectionId=${sc.sectionId}" class="btn btn-secondary btn-sm" target="_blank"><i class="fa-solid fa-download"></i> Section CSV</a>
          </td>
        </tr>
      `;
    });
  } catch (e) {}
}

// -----------------------------------------------------------------------------
// 6. Admin Mode Controller
// -----------------------------------------------------------------------------
async function loadAdminView() {
  try {
    const res = await fetch('/api/admin/dashboard', {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('admin-stat-pending').textContent = data.stats.pendingApprovals;
    document.getElementById('admin-approvals-badge').textContent = data.stats.pendingApprovals;
    document.getElementById('admin-stat-users').textContent = data.stats.totalUsers;
    document.getElementById('admin-stat-sections').textContent = data.stats.totalSections;
    document.getElementById('admin-stat-graded').textContent = data.stats.gradedSubmissions;

    loadAdminApprovals();
  } catch (e) {}
}

async function loadAdminApprovals() {
  try {
    const res = await fetch('/api/admin/pending-students', {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    const tbody = document.getElementById('approvals-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (!data.pending || !data.pending.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted text-center" style="padding:20px;">No student applications awaiting approval.</td></tr>';
      return;
    }

    data.pending.forEach(p => {
      tbody.innerHTML += `
        <tr>
          <td class="small muted">${new Date(p.created_at).toLocaleDateString()}</td>
          <td><strong>${p.student_id || 'N/A'}</strong></td>
          <td>${p.name}</td>
          <td>${p.email}</td>
          <td><span class="badge">${p.gender}</span></td>
          <td>${p.section_name || 'No Preference'}</td>
          <td>
            <div class="flex gap-6">
              <button class="btn btn-teal btn-sm" onclick="approveStudent(${p.id})">✓ Approve &amp; Send Token</button>
              <button class="btn-delete-chip" onclick="rejectStudent(${p.id})">✕ Reject</button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (e) {}
}

async function approveStudent(studentId) {
  try {
    const res = await fetch(`/api/admin/approve-student/${studentId}`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Approval failed');

    let emailMsg = 'Dispatched successfully via SMTP.';
    if (data.emailStatus === 'failed') {
      emailMsg = 'SMTP Delivery Failed (Google requires a 16-character App Password). The student can still be activated using the link below:';
    } else if (data.emailStatus === 'logged') {
      emailMsg = 'Logged in Outbox Queue (Offline / Local Mode).';
    }

    alert(`Student Approved Successfully!\n\nActivation Link:\n${data.activationLink}\n\nEmail Status: ${emailMsg}`);
    loadAdminView();
  } catch (err) {
    alert('Approval Error: ' + err.message);
  }
}

async function rejectStudent(studentId) {
  if (!confirm('Reject this student registration?')) return;
  try {
    const res = await fetch(`/api/admin/reject-student/${studentId}`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    loadAdminView();
  } catch (e) {}
}

async function loadAdminUsers() {
  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    data.users.forEach(u => {
      tbody.innerHTML += `
        <tr>
          <td><strong>${u.name}</strong></td>
          <td>${u.email}</td>
          <td>${u.student_id || '—'}</td>
          <td><span class="role-pill ${u.role}">${u.role}</span></td>
          <td>${u.gender}</td>
          <td>${u.section_name || '—'}</td>
          <td><span class="badge" style="background:#dcfce7;color:#15803d;">${u.status}</span></td>
          <td class="small muted">${u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td>
          <td>
            <div class="flex gap-6">
              <button class="btn-edit-chip" onclick="openEditUserModal(${u.id})" title="Edit user profile and settings">
                ✏ Edit
              </button>
              <button class="btn-delete-chip" onclick="deleteUser(${u.id})" title="Delete user account and purge all associated records">
                🗑 Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (e) {}
}

async function openEditUserModal(userId) {
  try {
    const [userRes, secRes] = await Promise.all([
      fetch(`/api/admin/users/${userId}`, { headers: { 'Authorization': 'Bearer ' + currentToken } }),
      fetch('/api/auth/sections')
    ]);

    const userData = await userRes.json();
    const secData = await secRes.json();
    if (!userRes.ok) throw new Error(userData.error || 'Failed to load user.');

    const u = userData.user;
    document.getElementById('edit-user-id').value = u.id;
    document.getElementById('edit-user-name').value = u.name || '';
    document.getElementById('edit-user-student-id').value = u.student_id || '';
    document.getElementById('edit-user-email').value = u.email || '';
    document.getElementById('edit-user-role').value = u.role || 'student';
    document.getElementById('edit-user-gender').value = u.gender || 'Male';
    document.getElementById('edit-user-class-year').value = u.class_year || '';
    document.getElementById('edit-user-status').value = u.status || 'active';
    document.getElementById('edit-user-password').value = '';

    const secSelect = document.getElementById('edit-user-section');
    secSelect.innerHTML = '<option value="">-- Unassigned / None --</option>';
    (secData.sections || []).forEach(s => {
      const selected = (u.section_id === s.id) ? 'selected' : '';
      secSelect.innerHTML += `<option value="${s.id}" ${selected}>${s.name} (${s.code}) - ${s.gender_target}</option>`;
    });

    document.getElementById('edit-user-subhead').textContent = `Editing Account: ${u.name} (${u.email})`;
    showModal('modal-edit-user');
  } catch (err) {
    alert('Error loading user details: ' + err.message);
  }
}

async function openCreateUserModal() {
  try {
    const secRes = await fetch('/api/auth/sections');
    const secData = await secRes.json();
    const secSelect = document.getElementById('create-user-section');
    secSelect.innerHTML = '<option value="">-- Unassigned / None --</option>';
    (secData.sections || []).forEach(s => {
      secSelect.innerHTML += `<option value="${s.id}">${s.name} (${s.code}) - ${s.gender_target}</option>`;
    });

    document.getElementById('create-user-name').value = '';
    document.getElementById('create-user-student-id').value = '';
    document.getElementById('create-user-email').value = '';
    document.getElementById('create-user-role').value = 'student';
    document.getElementById('create-user-gender').value = 'Male';
    document.getElementById('create-user-class-year').value = 'Year 3 - Cohort 2026';
    document.getElementById('create-user-status').value = 'active';
    document.getElementById('create-user-password').value = '';

    showModal('modal-create-user');
  } catch (err) {
    alert('Error initializing create user dialog: ' + err.message);
  }
}

async function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user?\n\nThis will permanently purge this user account along with all their laboratory submissions, uploaded attachments, messages, outbox emails, and associated audit logs.')) return;
  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Deletion failed');
    showToast(data.message || 'User and all related records deleted.', 'success');
    loadAdminUsers();
    loadAdminView();
  } catch (e) {
    alert('Delete Error: ' + e.message);
  }
}

async function loadAdminSettings() {
  try {
    const res = await fetch('/api/admin/settings', {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    const s = data.settings || {};

    if (document.getElementById('setting-gemini-key')) document.getElementById('setting-gemini-key').value = s.gemini_api_key || '';
    if (document.getElementById('setting-gemini-model')) document.getElementById('setting-gemini-model').value = s.gemini_model || 'gemini-3.7-flash';
    if (document.getElementById('setting-smtp-host')) document.getElementById('setting-smtp-host').value = s.smtp_host || 'smtp.gmail.com';
    if (document.getElementById('setting-smtp-port')) document.getElementById('setting-smtp-port').value = s.smtp_port || '465';
    if (document.getElementById('setting-smtp-user')) document.getElementById('setting-smtp-user').value = s.smtp_user || 'ezzatoa@gmail.com';
    if (document.getElementById('setting-smtp-pass')) document.getElementById('setting-smtp-pass').value = s.smtp_pass || '';
    if (document.getElementById('setting-smtp-from')) document.getElementById('setting-smtp-from').value = s.smtp_from || 'RAD 321 Admin <ezzatoa@gmail.com>';
    if (document.getElementById('setting-app-url')) document.getElementById('setting-app-url').value = s.app_url || 'http://localhost:8080';
  } catch (e) {}
}

document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
  const settings = {
    gemini_api_key: document.getElementById('setting-gemini-key').value.trim(),
    gemini_model: document.getElementById('setting-gemini-model').value,
    smtp_host: document.getElementById('setting-smtp-host').value.trim(),
    smtp_port: document.getElementById('setting-smtp-port').value.trim(),
    smtp_user: document.getElementById('setting-smtp-user').value.trim(),
    smtp_pass: document.getElementById('setting-smtp-pass').value,
    smtp_from: document.getElementById('setting-smtp-from').value.trim(),
    app_url: document.getElementById('setting-app-url').value.trim()
  };

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + currentToken
      },
      body: JSON.stringify({ settings })
    });
    const data = await res.json();
    if (res.ok) alert('System Settings Saved Successfully!');
    else alert('Error: ' + data.error);
  } catch (err) {
    alert('Error saving settings: ' + err.message);
  }
});

document.getElementById('btn-test-smtp')?.addEventListener('click', async () => {
  const testEmail = prompt('Enter recipient email for SMTP verification:', currentUser?.email || 'ezzatoa@gmail.com');
  if (!testEmail) return;

  showToast('Testing SMTP connection to ' + testEmail + '...', 'info');
  try {
    const res = await fetch('/api/admin/test-smtp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + currentToken
      },
      body: JSON.stringify({ testEmail })
    });
    const data = await res.json();
    if (res.ok) {
      alert('SMTP Connection Verified!\n\n' + data.message);
    } else {
      alert('SMTP Test Failed:\n\n' + data.error + '\n\nNote: If using Gmail with 2-Step Verification, Google requires a 16-character App Password (not your regular Gmail login password).\n\nGenerate one at: https://myaccount.google.com/apppasswords');
    }
  } catch (err) {
    alert('SMTP Test Error: ' + err.message);
  }
});

async function loadAdminOutbox() {
  try {
    const res = await fetch('/api/admin/outbox', {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    const tbody = document.getElementById('outbox-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (!data.emails || !data.emails.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted text-center" style="padding:20px;">Email outbox is empty.</td></tr>';
      return;
    }

    data.emails.forEach(em => {
      tbody.innerHTML += `
        <tr>
          <td class="small muted">${new Date(em.created_at).toLocaleString()}</td>
          <td><strong>${em.to_name || ''}</strong> &lt;${em.to_email}&gt;</td>
          <td>${em.subject}</td>
          <td><span class="badge">${em.status}</span></td>
          <td style="word-break:break-all;font-size:11.5px;">${em.token_link ? `<a href="${em.token_link}" target="_blank">${em.token_link}</a>` : '—'}</td>
          <td>
            <button class="btn-delete-chip" onclick="deleteOutboxEmail(${em.id})" title="Delete email log">
              🗑 Delete
            </button>
          </td>
        </tr>
      `;
    });
  } catch (e) {}
}

async function deleteOutboxEmail(id) {
  if (!confirm('Delete this outbox email log?')) return;
  try {
    const res = await fetch(`/api/admin/outbox/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    if (res.ok) {
      showToast('Outbox email log deleted.', 'success');
      loadAdminOutbox();
    } else {
      const data = await res.json();
      alert('Error: ' + (data.error || 'Failed to delete outbox email log.'));
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

document.getElementById('btn-clear-outbox')?.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to clear all email outbox logs?')) return;
  try {
    const res = await fetch('/api/admin/outbox', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    if (res.ok) {
      showToast('All outbox email logs cleared.', 'success');
      loadAdminOutbox();
    } else {
      const data = await res.json();
      alert('Error: ' + (data.error || 'Failed to clear outbox logs.'));
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
});

async function loadAdminLogs() {
  try {
    const res = await fetch('/api/admin/audit-logs', {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    const tbody = document.getElementById('audit-logs-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (!data.logs || !data.logs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted text-center" style="padding:20px;">Audit log is empty.</td></tr>';
      return;
    }

    data.logs.forEach(log => {
      tbody.innerHTML += `
        <tr>
          <td class="small muted">${new Date(log.created_at).toLocaleString()}</td>
          <td>${log.user_name || 'System'}</td>
          <td><strong>${log.action}</strong></td>
          <td>${log.details || ''}</td>
          <td>
            <button class="btn-delete-chip" onclick="deleteAuditLog(${log.id})" title="Delete log entry">
              🗑 Delete
            </button>
          </td>
        </tr>
      `;
    });
  } catch (e) {}
}

async function deleteAuditLog(id) {
  if (!confirm('Delete this audit log entry?')) return;
  try {
    const res = await fetch(`/api/admin/audit-logs/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    if (res.ok) {
      showToast('Audit log entry deleted.', 'success');
      loadAdminLogs();
    } else {
      const data = await res.json();
      alert('Error: ' + (data.error || 'Failed to delete audit log.'));
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

document.getElementById('btn-clear-audit-logs')?.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to clear all prior audit logs?')) return;
  try {
    const res = await fetch('/api/admin/audit-logs', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    if (res.ok) {
      showToast('All audit logs cleared.', 'success');
      loadAdminLogs();
    } else {
      const data = await res.json();
      alert('Error: ' + (data.error || 'Failed to clear audit logs.'));
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
});

// Explicitly bind all window-level handlers for inline HTML onclick attributes
window.deleteUser = deleteUser;
window.deleteOutboxEmail = deleteOutboxEmail;
window.deleteAuditLog = deleteAuditLog;
window.approveStudent = approveStudent;
window.rejectStudent = rejectStudent;
window.quickFillLogin = quickFillLogin;
window.inspectStudentReport = inspectStudentReport;
window.inspectSubmission = inspectSubmission;
window.triggerAiGrading = triggerAiGrading;
window.saveManualGrade = saveManualGrade;
window.viewSectionRoster = viewSectionRoster;
window.openBroadcastModal = openBroadcastModal;
window.openEditUserModal = openEditUserModal;
window.openCreateUserModal = openCreateUserModal;
window.loadAdminUsers = loadAdminUsers;
window.loadAdminOutbox = loadAdminOutbox;
window.loadAdminLogs = loadAdminLogs;

