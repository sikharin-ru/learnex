/**
 * ============================================================================
 * LEARNEX Frontend Application Controller
 * จัดการ State, Role-Based Access, UI Rendering, Validation และ Security
 * ============================================================================
 */

(function () {
  'use strict';

  const state = {
    user: null,
    courses: [],
    enrollments: [],
    certificates: [],
    community: [],
    analytics: null,
    adminUsers: [],
    auditLogs: [],
    activeView: 'student',
    activeClassroomCourse: null,
    activeLessonIndex: 0,
    lastSandboxScore: 0,
    lastSandboxPrompt: ''
  };

  /* ==========================================================================
     SECURITY & UTILITY HELPERS
     ========================================================================== */

  function escapeHTML(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showLoader(message) {
    const loader = document.getElementById('global-loader');
    const text = document.getElementById('loader-text');
    if (text) text.textContent = message || 'กำลังประมวลผลข้อมูล...';
    if (loader) loader.hidden = false;
  }

  function hideLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.hidden = true;
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast' + (type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : '');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 4200);
  }

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.hidden = false;
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.hidden = true;
  }

  function confirmDialog(message) {
    return new Promise((resolve) => {
      const msgEl = document.getElementById('confirm-modal-message');
      const okBtn = document.getElementById('btn-confirm-ok');
      const cancelBtn = document.getElementById('btn-confirm-cancel');
      msgEl.textContent = message;
      openModal('modal-confirm');

      const cleanup = (result) => {
        closeModal('modal-confirm');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
    });
  }

  function formatRoleThai(role) {
    const map = {
      student: 'สมาชิก / นักเรียน',
      teacher: 'ครูผู้สอน / วิทยากร',
      admin: 'ผู้ดูแลระบบ (Admin)'
    };
    return map[role] || role;
  }

  /* ==========================================================================
     INITIALIZATION & THIRD-PARTY GOOGLE SSO
     ========================================================================== */

  document.addEventListener('DOMContentLoaded', async () => {
    bindGlobalEvents();
    initGoogleIdentityServices();
    await checkBackendConnection();

    const existingToken = window.LearnexAPI.getToken();
    if (existingToken) {
      await loadAuthenticatedWorkspace();
    } else {
      showAuthScreen();
    }
  });

  async function checkBackendConnection() {
    const indicator = document.getElementById('connection-indicator');
    const syncPill = document.getElementById('sync-status-pill');

    if (!window.LearnexAPI.isConfigured()) {
      indicator.textContent = 'รอการตั้งค่า GAS_WEB_APP_URL ใน js/config.js';
      indicator.className = 'status-pill status-offline';
      if (syncPill) {
        syncPill.textContent = 'ยังไม่ได้ตั้งค่า API URL';
        syncPill.className = 'status-pill status-offline';
      }
      return;
    }

    try {
      const res = await window.LearnexAPI.post('ping');
      if (res && res.success) {
        indicator.textContent = 'เชื่อมต่อ Google Apps Script & Sheets พร้อมใช้งาน';
        indicator.className = 'status-pill status-online';
        if (syncPill) {
          syncPill.textContent = 'ซิงค์ Google Sheets ออนไลน์';
          syncPill.className = 'status-pill status-online';
        }
      }
    } catch (err) {
      indicator.textContent = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์: ' + err.message;
      indicator.className = 'status-pill status-offline';
    }
  }

  function initGoogleIdentityServices() {
    const clientId = String(window.LEARNEX_CONFIG.GOOGLE_CLIENT_ID || '').trim();
    const demoPanel = document.getElementById('demo-login-panel');
    if (demoPanel) {
      demoPanel.hidden = !window.LEARNEX_CONFIG.ENABLE_DEMO_LOGIN;
    }

    const wrapper = document.getElementById('google-signin-wrapper');
    if (!clientId) {
      wrapper.innerHTML =
        '<button type="button" id="btn-google-unconfigured" class="btn btn-outline btn-block">' +
        'เข้าสู่ระบบด้วย Google Workspace (ยังไม่ได้ระบุ Client ID ใน config.js)</button>';
      document.getElementById('btn-google-unconfigured').addEventListener('click', () => {
        showToast('กรุณาระบุ GOOGLE_CLIENT_ID ในไฟล์ js/config.js หรือใช้ปุ่มทดลองใช้งานด้านล่าง', 'info');
      });
      return;
    }

    const waitGsi = setInterval(() => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        clearInterval(waitGsi);
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCredentialResponse
        });
        window.google.accounts.id.renderButton(wrapper, {
          theme: 'outline',
          size: 'large',
          width: 340,
          text: 'signin_with',
          locale: 'th'
        });
      }
    }, 300);
  }

  async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) return;
    showLoader('กำลังตรวจสอบสิทธิ์ Google SSO กับฐานข้อมูล...');
    try {
      const res = await window.LearnexAPI.post('loginWithGoogle', {
        idToken: response.credential
      });
      hideLoader();
      if (!res.success) {
        showToast(res.message || 'เข้าสู่ระบบไม่สำเร็จ', 'error');
        return;
      }
      window.LearnexAPI.setSession(res.token, res.user);
      showToast('ยินดีต้อนรับ ' + res.user.fullName, 'success');
      await loadAuthenticatedWorkspace();
    } catch (err) {
      hideLoader();
      showToast(err.message, 'error');
    }
  }

  async function handleDemoLogin(role) {
    showLoader('กำลังเข้าสู่ระบบบทบาท ' + formatRoleThai(role) + '...');
    try {
      const res = await window.LearnexAPI.post('loginDemo', { role: role });
      hideLoader();
      if (!res.success) {
        showToast(res.message || 'เข้าสู่ระบบไม่สำเร็จ', 'error');
        return;
      }
      window.LearnexAPI.setSession(res.token, res.user);
      showToast('เข้าสู่ระบบสำเร็จ: ' + res.user.fullName, 'success');
      await loadAuthenticatedWorkspace();
    } catch (err) {
      hideLoader();
      showToast(err.message, 'error');
    }
  }

  function showAuthScreen() {
    document.getElementById('auth-screen').hidden = false;
    document.getElementById('app-shell').hidden = true;
  }

  async function loadAuthenticatedWorkspace() {
    showLoader('กำลังโหลดข้อมูลรายวิชาและความก้าวหน้าจาก Google Sheets...');
    try {
      const data = await window.LearnexAPI.post('getBootstrapData');
      hideLoader();

      if (!data.success) {
        window.LearnexAPI.clearSession();
        showAuthScreen();
        showToast(data.message || 'กรุณาเข้าสู่ระบบใหม่', 'error');
        return;
      }

      state.user = data.user;
      state.courses = data.courses || [];
      state.enrollments = data.enrollments || [];
      state.certificates = data.certificates || [];
      state.community = data.community || [];
      state.analytics = data.analytics || null;
      state.adminUsers = data.adminUsers || [];
      state.auditLogs = data.auditLogs || [];

      window.LearnexAPI.setSession(null, state.user);

      document.getElementById('auth-screen').hidden = true;
      document.getElementById('app-shell').hidden = false;

      renderSidebarProfile();
      renderStudentPortal();
      renderDashboard();
      renderCertificatesView();
      renderCommunityView();
      renderAdminConsole();

      const defaultView = state.user.role === 'admin' ? 'admin' : 'student';
      switchView(defaultView);
    } catch (err) {
      hideLoader();
      showToast('โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    }
  }

  /* ==========================================================================
     NAVIGATION & SIDEBAR RENDERING
     ========================================================================== */

  function renderSidebarProfile() {
    const u = state.user;
    if (!u) return;

    document.getElementById('sidebar-user-name').textContent = u.fullName;
    document.getElementById('sidebar-user-role').textContent = formatRoleThai(u.role);
    document.getElementById('sidebar-avatar').textContent = (u.fullName || 'U').charAt(0).toUpperCase();
    document.getElementById('sidebar-level').textContent = 'Level ' + u.level;
    document.getElementById('sidebar-xp').textContent = u.xp + ' XP';

    const levelProgress = Math.min(100, Math.round(((u.xp % 200) / 200) * 100));
    document.getElementById('sidebar-xp-bar').style.width = levelProgress + '%';

    const adminNavBtn = document.getElementById('nav-admin-btn');
    if (adminNavBtn) {
      adminNavBtn.hidden = u.role !== 'admin' && u.role !== 'teacher';
    }
  }

  function switchView(viewName) {
    state.activeView = viewName;

    const titles = {
      student: ['พอร์ทัลผู้เรียนและคลังหลักสูตร', 'ศึกษาบทเรียนออนไลน์ สะสมคะแนน XP และรับใบประกาศนียบัตร'],
      dashboard: ['แดชบอร์ดวิเคราะห์ผลสัมฤทธิ์และสมรรถนะ', 'ติดตามสถิติการเรียนรู้และเปรียบเทียบสมรรถนะ 5 ด้านแบบเรียลไทม์'],
      sandbox: ['AI Sandbox Lab — ห้องปฏิบัติการฝึกเขียนคำสั่ง', 'ออกแบบและประเมินคุณภาพ Prompt ตามกรอบมาตรฐาน R-C-T-F'],
      certificates: ['คลังใบประกาศนียบัตรดิจิทัล', 'ดาวน์โหลดเอกสารรับรองและตรวจสอบความถูกต้องด้วยรหัสอ้างอิง'],
      community: ['ชุมชนแลกเปลี่ยนเรียนรู้ (Academic Q&A)', 'พื้นที่ซักถามและแบ่งปันองค์ความรู้ระหว่างผู้เรียนและครูผู้สอน'],
      admin: ['ศูนย์บริหารจัดการระบบ (Admin Console)', 'จัดการคลังหลักสูตร สิทธิ์ผู้ใช้งาน และตรวจสอบบันทึกความปลอดภัย']
    };

    document.querySelectorAll('.view-section').forEach((sec) => {
      sec.hidden = sec.id !== 'view-' + viewName;
    });

    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    const pair = titles[viewName] || ['LEARNEX Platform', ''];
    document.getElementById('topbar-title').textContent = pair[0];
    document.getElementById('topbar-subtitle').textContent = pair[1];

    document.getElementById('sidebar').classList.remove('open');
  }

  /* ==========================================================================
     VIEW A: STUDENT PORTAL & CLASSROOM
     ========================================================================== */

  function renderStudentPortal() {
    const u = state.user;
    if (!u) return;

    const totalCourses = state.courses.length;
    const completedCount = state.enrollments.filter((e) => Number(e.progressPercent) >= 100).length;
    const overallPct = totalCourses > 0 ? Math.round((completedCount / totalCourses) * 100) : 0;

    document.getElementById('student-overall-progress').textContent = overallPct + '%';
    document.getElementById('student-completed-count').textContent =
      'สำเร็จแล้ว ' + completedCount + ' จาก ' + totalCourses + ' หลักสูตร';
    document.getElementById('student-overall-bar').style.width = overallPct + '%';

    document.getElementById('student-xp-total').textContent = u.xp + ' XP';
    document.getElementById('student-level-label').textContent = 'Level ' + u.level;

    const badgesWrap = document.getElementById('student-badges-list');
    const badges = Array.isArray(u.badges) ? u.badges : [];
    badgesWrap.innerHTML = badges.length
      ? badges.map((b) => '<span class="badge badge-primary">🏅 ' + escapeHTML(b) + '</span>').join('')
      : '<span class="helper-note">ยังไม่มีเหรียญสมรรถนะ เริ่มเรียนบทเรียนแรกเพื่อปลดล็อก</span>';

    renderFilteredCourses();
  }

  function renderFilteredCourses() {
    const keyword = String(document.getElementById('course-search-input').value || '').toLowerCase().trim();
    const category = document.getElementById('course-category-filter').value;
    const target = document.getElementById('course-target-filter').value;

    const filtered = state.courses.filter((course) => {
      const matchSearch =
        !keyword ||
        course.title.toLowerCase().includes(keyword) ||
        course.description.toLowerCase().includes(keyword) ||
        course.instructor.toLowerCase().includes(keyword);
      const matchCat = category === 'all' || course.category === category;
      const matchTarget = target === 'all' || course.targetGroup === target;
      return matchSearch && matchCat && matchTarget;
    });

    const grid = document.getElementById('student-courses-grid');
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="card"><p>ไม่พบหลักสูตรที่ตรงกับเงื่อนไขการค้นหา</p></div>';
      return;
    }

    grid.innerHTML = filtered
      .map((course) => {
        const enrollment = state.enrollments.find((e) => e.courseId === course.courseId);
        const progress = enrollment ? Number(enrollment.progressPercent || 0) : 0;
        const isCompleted = progress >= 100;

        return (
          '<article class="card course-card">' +
          '  <div>' +
          '    <div class="course-meta-top">' +
          '      <span class="badge badge-primary">' + escapeHTML(course.category) + '</span>' +
          '      <span class="badge">' + escapeHTML(course.targetGroup) + '</span>' +
          '    </div>' +
          '    <h3>' + escapeHTML(course.title) + '</h3>' +
          '    <p class="course-desc">' + escapeHTML(course.description) + '</p>' +
          '    <div class="course-specs">' +
          '      <span>👨‍🏫 ' + escapeHTML(course.instructor) + '</span>' +
          '      <span>⏱️ ' + escapeHTML(course.durationMinutes) + ' นาที</span>' +
          '      <span>⭐ +' + escapeHTML(course.xpReward) + ' XP</span>' +
          '    </div>' +
          '  </div>' +
          '  <div class="course-footer">' +
          '    <div>' +
          '      <div class="xp-row">' +
          '        <span>ความก้าวหน้า: <strong>' + progress + '%</strong></span>' +
          '        <span>' + (isCompleted ? '✅ สำเร็จหลักสูตร' : enrollment ? 'กำลังศึกษา' : 'ยังไม่ลงทะเบียน') + '</span>' +
          '      </div>' +
          '      <div class="progress-track"><div class="progress-fill" style="width:' + progress + '%;"></div></div>' +
          '    </div>' +
          '    <button type="button" class="btn ' + (isCompleted ? 'btn-secondary' : 'btn-primary') + ' btn-block" data-open-course="' + escapeHTML(course.courseId) + '">' +
          (isCompleted ? 'ทบทวนบทเรียน' : enrollment ? 'เข้าเรียนต่อทันที' : 'ลงทะเบียนและเริ่มเรียน') +
          '    </button>' +
          '  </div>' +
          '</article>'
        );
      })
      .join('');
  }

  async function openClassroomModal(courseId) {
    const course = state.courses.find((c) => c.courseId === courseId);
    if (!course) return;

    let enrollment = state.enrollments.find((e) => e.courseId === courseId);
    if (!enrollment) {
      showLoader('กำลังลงทะเบียนรายวิชา...');
      try {
        const res = await window.LearnexAPI.post('enrollCourse', { courseId: courseId });
        hideLoader();
        if (res.success && res.enrollment) {
          state.enrollments.push(res.enrollment);
          enrollment = res.enrollment;
          renderStudentPortal();
        }
      } catch (err) {
        hideLoader();
        showToast(err.message, 'error');
        return;
      }
    }

    state.activeClassroomCourse = course;
    state.activeLessonIndex = 0;

    document.getElementById('classroom-course-code').textContent = course.courseId;
    document.getElementById('classroom-modal-title').textContent = course.title;
    document.getElementById('classroom-video-iframe').src = course.videoUrl || 'https://www.youtube.com/embed/aircAruvnKk';

    renderClassroomLessonStage();
    renderClassroomQuiz();
    openModal('modal-classroom');
  }

  function renderClassroomLessonStage() {
    const course = state.activeClassroomCourse;
    if (!course) return;
    const lessons = course.lessons || [];
    const enrollment = state.enrollments.find((e) => e.courseId === course.courseId);
    const completedIds = enrollment ? enrollment.completedLessons || [] : [];

    const activeLesson = lessons[state.activeLessonIndex] || {
      id: 'L1',
      title: 'บทเรียนหลัก',
      content: course.description
    };

    document.getElementById('classroom-active-lesson-title').textContent = activeLesson.title;
    document.getElementById('classroom-active-lesson-content').textContent = activeLesson.content;

    const listEl = document.getElementById('classroom-lessons-list');
    listEl.innerHTML = lessons
      .map((lesson, idx) => {
        const isDone = completedIds.includes(lesson.id);
        const isActive = idx === state.activeLessonIndex;
        return (
          '<button type="button" class="lesson-step-btn' +
          (isActive ? ' active' : '') +
          (isDone ? ' completed' : '') +
          '" data-select-lesson="' + idx + '">' +
          '<strong>' + (isDone ? '✅ ' : '📘 ') + escapeHTML(lesson.title) + '</strong>' +
          '<span class="helper-note">ระยะเวลา: ' + escapeHTML(lesson.duration || '30 นาที') + '</span>' +
          '</button>'
        );
      })
      .join('');
  }

  function renderClassroomQuiz() {
    const course = state.activeClassroomCourse;
    if (!course) return;

    document.getElementById('classroom-quiz-question').textContent = course.quizQuestion;
    const optionsEl = document.getElementById('classroom-quiz-options');
    optionsEl.innerHTML = (course.quizOptions || [])
      .map(
        (opt, idx) =>
          '<label class="quiz-option-label">' +
          '<input type="radio" name="classroom_quiz_choice" value="' + idx + '" required />' +
          '<span>' + escapeHTML(opt) + '</span>' +
          '</label>'
      )
      .join('');
  }

  async function handleClassroomSubmit(event) {
    event.preventDefault();
    const course = state.activeClassroomCourse;
    if (!course) return;

    const selectedInput = document.querySelector('input[name="classroom_quiz_choice"]:checked');
    if (!selectedInput) {
      showToast('กรุณาเลือกคำตอบแบบทดสอบท้ายบทเรียนก่อนบันทึก', 'error');
      return;
    }

    const allLessonIds = (course.lessons || []).map((l) => l.id);

    showLoader('กำลังตรวจคำตอบและบันทึกผลลง Google Sheets...');
    try {
      const res = await window.LearnexAPI.post('completeLesson', {
        courseId: course.courseId,
        completedLessons: allLessonIds,
        quizAnswerIndex: Number(selectedInput.value)
      });
      hideLoader();

      if (!res.success) {
        showToast(res.message || 'คำตอบไม่ถูกต้อง', 'error');
        return;
      }

      showToast(res.message, 'success');
      closeModal('modal-classroom');
      await loadAuthenticatedWorkspace();

      if (res.certificate) {
        openCertificateModal(res.certificate);
      }
    } catch (err) {
      hideLoader();
      showToast(err.message, 'error');
    }
  }

  /* ==========================================================================
     VIEW B: ANALYTICS DASHBOARD
     ========================================================================== */

  function renderDashboard() {
    if (!state.analytics) return;
    const kpis = state.analytics.kpis;
    document.getElementById('kpi-total-users').textContent = kpis.totalUsers;
    document.getElementById('kpi-total-courses').textContent = kpis.publishedCourses;
    document.getElementById('kpi-avg-progress').textContent = kpis.avgCompletionRate + '%';
    document.getElementById('kpi-total-certs').textContent = kpis.totalCertificates;

    const groupKey = document.getElementById('dashboard-group-select').value || 'all';
    const items = state.analytics.competenciesByGroup[groupKey] || state.analytics.competenciesByGroup.all;

    const chartEl = document.getElementById('competency-chart-container');
    chartEl.innerHTML = items
      .map(
        (item) =>
          '<div class="comp-row">' +
          '  <div class="comp-row-label">' +
          '    <span>' + escapeHTML(item.dimension) + '</span>' +
          '    <span>ก่อนเรียน ' + item.pre + '% → หลังเรียน ' + item.post + '% (+' + (item.post - item.pre) + '%)</span>' +
          '  </div>' +
          '  <div class="comp-bar-pair">' +
          '    <div class="bar-line bar-pre" style="width:' + item.pre + '%;" title="ก่อนเรียน ' + item.pre + '%"></div>' +
          '    <div class="bar-line bar-post" style="width:' + item.post + '%;" title="หลังเรียน ' + item.post + '%"></div>' +
          '  </div>' +
          '</div>'
      )
      .join('');

    const alertsEl = document.getElementById('diagnostic-alerts-list');
    alertsEl.innerHTML = (state.analytics.diagnosticAlerts || [])
      .map(
        (a) =>
          '<article class="alert-box ' + (a.severity === 'info' ? 'info' : '') + '">' +
          '  <h4>' + escapeHTML(a.title) + '</h4>' +
          '  <p>' + escapeHTML(a.detail) + '</p>' +
          '</article>'
      )
      .join('');
  }

  /* ==========================================================================
     VIEW C: AI SANDBOX LAB
     ========================================================================== */

  function evaluateSandboxPrompt(event) {
    event.preventDefault();
    const role = document.getElementById('sb-role').value.trim();
    const context = document.getElementById('sb-context').value.trim();
    const task = document.getElementById('sb-task').value.trim();
    const format = document.getElementById('sb-format').value;

    let score = 0;
    const checks = [
      { label: 'ระบุบทบาทผู้เชี่ยวชาญชัดเจน (Role >= 10 ตัวอักษร)', pass: role.length >= 10, pts: 25 },
      { label: 'ระบุบริบทและกลุ่มผู้เรียน (Context >= 15 ตัวอักษร)', pass: context.length >= 15, pts: 25 },
      { label: 'ระบุภาระงานและขอบเขตเฉพาะเจาะจง (Task >= 25 ตัวอักษร)', pass: task.length >= 25, pts: 30 },
      { label: 'กำหนดรูปแบบผลลัพธ์มาตรฐาน (Output Format)', pass: Boolean(format), pts: 20 }
    ];

    checks.forEach((c) => {
      if (c.pass) score += c.pts;
    });

    const compiled =
      '[ROLE]\nคุณคือ' + (role || 'ผู้เชี่ยวชาญด้านการศึกษา') + '\n\n' +
      '[CONTEXT]\nบริบทการใช้งาน: ' + (context || 'การจัดการเรียนรู้ในสถานศึกษา') + '\n\n' +
      '[TASK & CONSTRAINTS]\n' + (task || 'โปรดอธิบายเนื้อหาอย่างถูกต้องตามหลักวิชาการ') +
      '\nข้อกำหนดเพิ่มเติม: ใช้ภาษาทางการที่ถูกต้อง อ้างอิงข้อเท็จจริงที่ตรวจสอบได้ และหลีกเลี่ยงการคาดเดาข้อมูล\n\n' +
      '[OUTPUT FORMAT]\nนำเสนอผลลัพธ์ในรูปแบบ: ' + format;

    state.lastSandboxScore = score;
    state.lastSandboxPrompt = compiled;

    document.getElementById('sb-score-display').textContent = score + '%';
    const badge = document.getElementById('sb-grade-badge');
    if (score >= 80) {
      badge.textContent = 'ดีเยี่ยม (ผ่านเกณฑ์มาตรฐาน)';
      badge.className = 'badge badge-success';
    } else if (score >= 50) {
      badge.textContent = 'ปานกลาง (ควรเพิ่มรายละเอียด)';
      badge.className = 'badge badge-primary';
    } else {
      badge.textContent = 'ต้องปรับปรุงโครงสร้าง';
      badge.className = 'badge';
    }

    document.getElementById('sb-checklist').innerHTML = checks
      .map((c) => '<div>' + (c.pass ? '✅ ' : '⬜ ') + escapeHTML(c.label) + ' (' + c.pts + ' คะแนน)</div>')
      .join('');

    document.getElementById('sb-compiled-prompt').value = compiled;
    document.getElementById('btn-save-sandbox-xp').disabled = score < 50;
  }

  /* ==========================================================================
     VIEW D: CERTIFICATES & PUBLIC VERIFICATION
     ========================================================================== */

  function renderCertificatesView() {
    const grid = document.getElementById('my-certificates-grid');
    if (!state.certificates || state.certificates.length === 0) {
      grid.innerHTML =
        '<div class="card"><p>คุณยังไม่มีใบประกาศนียบัตรดิจิทัล กรุณาศึกษาหลักสูตรและทำแบบทดสอบให้ครบ 100%</p></div>';
      return;
    }

    grid.innerHTML = state.certificates
      .map(
        (cert) =>
          '<article class="card course-card">' +
          '  <div>' +
          '    <div class="course-meta-top">' +
          '      <span class="badge badge-success">รับรองผลสำเร็จ</span>' +
          '      <span class="mono-code">' + escapeHTML(cert.certCode) + '</span>' +
          '    </div>' +
          '    <h3>' + escapeHTML(cert.courseTitle) + '</h3>' +
          '    <p class="course-desc">ผู้ได้รับ: ' + escapeHTML(cert.userName) + '</p>' +
          '    <p class="helper-note">วันที่ออกเอกสาร: ' + escapeHTML(cert.issuedDateThai) + '</p>' +
          '  </div>' +
          '  <button type="button" class="btn btn-primary btn-block" data-view-cert="' + escapeHTML(cert.certCode) + '">' +
          '    เปิดดูและพิมพ์ใบประกาศนียบัตร' +
          '  </button>' +
          '</article>'
      )
      .join('');
  }

  function openCertificateModal(cert) {
    document.getElementById('cert-view-recipient').textContent = cert.userName;
    document.getElementById('cert-view-course').textContent = cert.courseTitle;
    document.getElementById('cert-view-date').textContent = 'ให้ไว้ ณ วันที่ ' + cert.issuedDateThai;
    document.getElementById('cert-view-code').textContent = cert.certCode;

    // Generate deterministic SVG matrix QR representation from certCode
    const qrContainer = document.getElementById('cert-qr-svg');
    qrContainer.innerHTML = buildDeterministicQrSvg(cert.certCode);

    openModal('modal-certificate');
  }

  function buildDeterministicQrSvg(seedText) {
    const size = 7;
    let hash = 0;
    for (let i = 0; i < seedText.length; i++) {
      hash = (hash * 31 + seedText.charCodeAt(i)) >>> 0;
    }
    let rects = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const bit = ((hash >> ((r * size + c) % 24)) & 1) === 1 || (r < 2 && c < 2) || (r > 4 && c > 4);
        if (bit) {
          rects += '<rect x="' + c * 10 + '" y="' + r * 10 + '" width="9" height="9" fill="#0f294a" />';
        }
      }
    }
    return '<svg viewBox="0 0 70 70" width="100%" height="100%" role="img" aria-label="รหัส QR">' + rects + '</svg>';
  }

  async function verifyCertificateCode(code, targetResultId) {
    const resultBox = document.getElementById(targetResultId);
    if (!code) {
      resultBox.hidden = false;
      resultBox.className = 'verify-feedback error';
      resultBox.textContent = 'กรุณากรอกรหัสใบประกาศนียบัตร';
      return;
    }

    showLoader('กำลังตรวจสอบรหัสใบประกาศนียบัตรกับฐานข้อมูล...');
    try {
      const res = await window.LearnexAPI.post('verifyCertificate', { certCode: code });
      hideLoader();
      resultBox.hidden = false;
      if (!res.success) {
        resultBox.className = 'verify-feedback error';
        resultBox.textContent = res.message;
        return;
      }
      const c = res.certificate;
      resultBox.className = 'verify-feedback';
      resultBox.innerHTML =
        '<strong>✅ เอกสารถูกต้องและมีอยู่จริงในระบบ:</strong> ' +
        escapeHTML(c.userName) + ' — หลักสูตร "' + escapeHTML(c.courseTitle) + '" (' + escapeHTML(c.issuedDateThai) + ')';
    } catch (err) {
      hideLoader();
      showToast(err.message, 'error');
    }
  }

  /* ==========================================================================
     VIEW E: COMMUNITY Q&A
     ========================================================================== */

  function renderCommunityView() {
    const container = document.getElementById('community-threads-list');
    if (!state.community || state.community.length === 0) {
      container.innerHTML = '<div class="card"><p>ยังไม่มีกระทู้คำถามในขณะนี้</p></div>';
      return;
    }

    container.innerHTML = state.community
      .map((q) => {
        const repliesHtml = (q.replies || [])
          .map(
            (rep) =>
              '<div class="reply-item">' +
              '  <strong>' + escapeHTML(rep.authorName) + ' (' + escapeHTML(rep.authorRole) + '):</strong> ' +
              '  <span>' + escapeHTML(rep.message) + '</span>' +
              '</div>'
          )
          .join('');

        return (
          '<article class="card thread-card">' +
          '  <div class="thread-meta">' +
          '    <span class="badge badge-primary">' + escapeHTML(q.courseTag) + '</span>' +
          '    <span>โดย <strong>' + escapeHTML(q.authorName) + '</strong> (' + escapeHTML(q.authorRole) + ')</span>' +
          '  </div>' +
          '  <h3>' + escapeHTML(q.title) + '</h3>' +
          '  <p>' + escapeHTML(q.body) + '</p>' +
          (repliesHtml ? '<div class="replies-list">' + repliesHtml + '</div>' : '') +
          '  <form class="inline-form reply-form" data-reply-question="' + escapeHTML(q.questionId) + '" style="margin-top:0.9rem;">' +
          '    <input type="text" placeholder="เขียนคำตอบหรือข้อเสนอแนะทางวิชาการ..." required />' +
          '    <button type="submit" class="btn btn-secondary btn-sm">ตอบกลับ</button>' +
          '  </form>' +
          '</article>'
        );
      })
      .join('');
  }

  /* ==========================================================================
     VIEW F: ADMIN CONSOLE
     ========================================================================== */

  function renderAdminConsole() {
    document.getElementById('admin-course-count').textContent = state.courses.length;
    document.getElementById('admin-user-count').textContent = state.adminUsers.length;

    const coursesTbody = document.getElementById('admin-courses-tbody');
    coursesTbody.innerHTML = state.courses
      .map(
        (c) =>
          '<tr>' +
          '  <td class="mono-code">' + escapeHTML(c.courseId) + '</td>' +
          '  <td><strong>' + escapeHTML(c.title) + '</strong></td>' +
          '  <td>' + escapeHTML(c.category) + '</td>' +
          '  <td>' + escapeHTML(c.targetGroup) + '</td>' +
          '  <td>' + escapeHTML(c.durationMinutes) + ' นาที</td>' +
          '  <td><span class="badge ' + (c.status === 'published' ? 'badge-success' : '') + '">' + escapeHTML(c.status) + '</span></td>' +
          '  <td>' +
          '    <button type="button" class="btn btn-outline btn-sm" data-edit-course="' + escapeHTML(c.courseId) + '">แก้ไข</button> ' +
          (state.user && state.user.role === 'admin'
            ? '<button type="button" class="btn btn-danger btn-sm" data-delete-course="' + escapeHTML(c.courseId) + '">ลบ</button>'
            : '') +
          '  </td>' +
          '</tr>'
      )
      .join('');

    const usersTbody = document.getElementById('admin-users-tbody');
    usersTbody.innerHTML = state.adminUsers
      .map(
        (u) =>
          '<tr>' +
          '  <td class="mono-code">' + escapeHTML(u.userId) + '</td>' +
          '  <td>' + escapeHTML(u.fullName) + '</td>' +
          '  <td>' + escapeHTML(u.email) + '</td>' +
          '  <td>' + escapeHTML(u.xp) + ' XP (Lv.' + escapeHTML(u.level) + ')</td>' +
          '  <td>' +
          '    <select class="admin-role-select" data-user-id="' + escapeHTML(u.userId) + '" aria-label="เปลี่ยนบทบาทผู้ใช้">' +
          '      <option value="student"' + (u.role === 'student' ? ' selected' : '') + '>student (นักเรียน)</option>' +
          '      <option value="teacher"' + (u.role === 'teacher' ? ' selected' : '') + '>teacher (ครูผู้สอน)</option>' +
          '      <option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>admin (ผู้ดูแลระบบ)</option>' +
          '    </select>' +
          '  </td>' +
          '  <td><span class="badge badge-success">' + escapeHTML(u.status) + '</span></td>' +
          '</tr>'
      )
      .join('');

    const logsTbody = document.getElementById('admin-logs-tbody');
    logsTbody.innerHTML = state.auditLogs
      .map(
        (log) =>
          '<tr>' +
          '  <td class="mono-code">' + escapeHTML(log.timestamp) + '</td>' +
          '  <td>' + escapeHTML(log.userEmail) + '</td>' +
          '  <td class="mono-code">' + escapeHTML(log.action) + '</td>' +
          '  <td>' + escapeHTML(log.detail) + '</td>' +
          '  <td><span class="badge badge-primary">' + escapeHTML(log.status) + '</span></td>' +
          '</tr>'
      )
      .join('');
  }

  function openCourseEditor(courseId) {
    const form = document.getElementById('course-editor-form');
    form.reset();

    if (!courseId) {
      document.getElementById('course-form-title').textContent = 'สร้างหลักสูตรใหม่';
      document.getElementById('edit-course-id').value = '';
      document.getElementById('edit-course-instructor').value = state.user ? state.user.fullName : '';
      openModal('modal-course-form');
      return;
    }

    const course = state.courses.find((c) => c.courseId === courseId);
    if (!course) return;

    document.getElementById('course-form-title').textContent = 'แก้ไขหลักสูตร (' + course.courseId + ')';
    document.getElementById('edit-course-id').value = course.courseId;
    document.getElementById('edit-course-title').value = course.title;
    document.getElementById('edit-course-instructor').value = course.instructor;
    document.getElementById('edit-course-category').value = course.category;
    document.getElementById('edit-course-target').value = course.targetGroup;
    document.getElementById('edit-course-duration').value = course.durationMinutes;
    document.getElementById('edit-course-desc').value = course.description;
    document.getElementById('edit-course-video').value = course.videoUrl;
    document.getElementById('edit-course-status').value = course.status;
    document.getElementById('edit-course-quiz-q').value = course.quizQuestion;

    const opts = course.quizOptions || [];
    document.getElementById('edit-course-opt-0').value = opts[0] || '';
    document.getElementById('edit-course-opt-1').value = opts[1] || '';
    document.getElementById('edit-course-opt-2').value = opts[2] || '';
    document.getElementById('edit-course-opt-3').value = opts[3] || '';
    document.getElementById('edit-course-correct-idx').value = String(course.quizAnswerIndex || 0);

    openModal('modal-course-form');
  }

  /* ==========================================================================
     EVENT BINDINGS
     ========================================================================== */

  function bindGlobalEvents() {
    // Demo SSO Role Buttons
    document.querySelectorAll('[data-demo-role]').forEach((btn) => {
      btn.addEventListener('click', () => handleDemoLogin(btn.dataset.demoRole));
    });

    // External SSO Info Buttons
    document.querySelectorAll('.sso-ext-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        showToast(
          'ช่องทาง ' + btn.dataset.provider + ' พร้อมเชื่อมต่อผ่าน OIDC Endpoint ของสถาบัน กรุณาใช้ Google SSO หรือโหมดสาธิตเพื่อทดสอบระบบ',
          'info'
        );
      });
    });

    // Public Certificate Verification on Login Screen
    document.getElementById('public-cert-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = document.getElementById('public-cert-input').value.trim().toUpperCase();
      verifyCertificateCode(code, 'public-cert-result');
    });

    // Member Certificate Verification
    document.getElementById('member-cert-verify-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = document.getElementById('member-cert-code-input').value.trim().toUpperCase();
      verifyCertificateCode(code, 'member-cert-verify-result');
    });

    // Sidebar Navigation & Mobile Toggle
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    document.getElementById('btn-open-sidebar').addEventListener('click', () => {
      document.getElementById('sidebar').classList.add('open');
    });

    document.getElementById('btn-close-sidebar').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
    });

    // Logout & Refresh
    document.getElementById('btn-logout').addEventListener('click', async () => {
      showLoader('กำลังออกจากระบบ...');
      try {
        await window.LearnexAPI.post('logout');
      } catch (e) {
        // Proceed with local cleanup even if network fails
      }
      window.LearnexAPI.clearSession();
      hideLoader();
      showAuthScreen();
      showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
    });

    document.getElementById('btn-refresh-data').addEventListener('click', () => {
      loadAuthenticatedWorkspace();
    });

    // Course Filters
    document.getElementById('course-search-input').addEventListener('input', renderFilteredCourses);
    document.getElementById('course-category-filter').addEventListener('change', renderFilteredCourses);
    document.getElementById('course-target-filter').addEventListener('change', renderFilteredCourses);

    // Delegated Clicks for Dynamic Cards & Tables
    document.addEventListener('click', async (e) => {
      const openCourseBtn = e.target.closest('[data-open-course]');
      if (openCourseBtn) {
        openClassroomModal(openCourseBtn.dataset.openCourse);
        return;
      }

      const selectLessonBtn = e.target.closest('[data-select-lesson]');
      if (selectLessonBtn) {
        state.activeLessonIndex = Number(selectLessonBtn.dataset.selectLesson);
        renderClassroomLessonStage();
        return;
      }

      const viewCertBtn = e.target.closest('[data-view-cert]');
      if (viewCertBtn) {
        const cert = state.certificates.find((c) => c.certCode === viewCertBtn.dataset.viewCert);
        if (cert) openCertificateModal(cert);
        return;
      }

      const editCourseBtn = e.target.closest('[data-edit-course]');
      if (editCourseBtn) {
        openCourseEditor(editCourseBtn.dataset.editCourse);
        return;
      }

      const deleteCourseBtn = e.target.closest('[data-delete-course]');
      if (deleteCourseBtn) {
        const cId = deleteCourseBtn.dataset.deleteCourse;
        const ok = await confirmDialog('คุณต้องการลบหลักสูตรรหัส ' + cId + ' ออกจากฐานข้อมูลถาวรใช่หรือไม่?');
        if (!ok) return;
        showLoader('กำลังลบหลักสูตร...');
        try {
          const res = await window.LearnexAPI.post('deleteCourse', { courseId: cId });
          hideLoader();
          showToast(res.message, res.success ? 'success' : 'error');
          if (res.success) await loadAuthenticatedWorkspace();
        } catch (err) {
          hideLoader();
          showToast(err.message, 'error');
        }
        return;
      }

      const closeModalBtn = e.target.closest('[data-close-modal]');
      if (closeModalBtn) {
        closeModal(closeModalBtn.dataset.closeModal);
      }
    });

    // Classroom Quiz Submission
    document.getElementById('classroom-quiz-form').addEventListener('submit', handleClassroomSubmit);

    // Dashboard Group Selector
    document.getElementById('dashboard-group-select').addEventListener('change', renderDashboard);

    // AI Sandbox Lab Events
    document.getElementById('sandbox-form').addEventListener('submit', evaluateSandboxPrompt);

    document.getElementById('btn-load-prompt-sample').addEventListener('click', () => {
      document.getElementById('sb-role').value = 'อาจารย์ผู้เชี่ยวชาญด้านการวัดและประเมินผลทางการศึกษา';
      document.getElementById('sb-context').value = 'นักเรียนชั้นมัธยมศึกษาปีที่ 6 ที่กำลังเตรียมโครงงานวิจัยด้านปัญญาประดิษฐ์';
      document.getElementById('sb-task').value =
        'ให้ออกแบบเกณฑ์การประเมิน (Scoring Rubric) 4 ระดับ สำหรับประเมินความน่าเชื่อถือของแหล่งข้อมูลและจริยธรรมการใช้ AI ในโครงงาน';
      document.getElementById('sb-format').value = 'ตารางเปรียบเทียบข้อมูล';
      showToast('โหลดตัวอย่างโครงสร้างคำสั่ง R-C-T-F เรียบร้อยแล้ว', 'info');
    });

    document.getElementById('btn-clear-sandbox').addEventListener('click', () => {
      document.getElementById('sandbox-form').reset();
      document.getElementById('sb-compiled-prompt').value = '';
      document.getElementById('sb-score-display').textContent = '0%';
      document.getElementById('sb-checklist').innerHTML = '';
      document.getElementById('btn-save-sandbox-xp').disabled = true;
    });

    document.getElementById('btn-copy-prompt').addEventListener('click', async () => {
      const txt = document.getElementById('sb-compiled-prompt').value;
      if (!txt) return;
      await navigator.clipboard.writeText(txt);
      showToast('คัดลอกชุดคำสั่งไปยังคลิปบอร์ดแล้ว', 'success');
    });

    document.getElementById('btn-save-sandbox-xp').addEventListener('click', async () => {
      showLoader('กำลังบันทึกผลการฝึกปฏิบัติลงฐานข้อมูล...');
      try {
        const res = await window.LearnexAPI.post('logSandboxPrompt', {
          promptText: state.lastSandboxPrompt,
          qualityScore: state.lastSandboxScore
        });
        hideLoader();
        showToast(res.message, res.success ? 'success' : 'error');
        if (res.success) await loadAuthenticatedWorkspace();
      } catch (err) {
        hideLoader();
        showToast(err.message, 'error');
      }
    });

    // Certificate Print
    document.getElementById('btn-print-certificate').addEventListener('click', () => {
      window.print();
    });

    // Community Q&A Create & Reply
    document.getElementById('new-question-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('qa-title').value.trim();
      const body = document.getElementById('qa-body').value.trim();
      const courseTag = document.getElementById('qa-course-tag').value;

      if (!title || !body) {
        showToast('กรุณากรอกหัวข้อและรายละเอียดคำถามให้ครบถ้วน', 'error');
        return;
      }

      showLoader('กำลังบันทึกกระทู้คำถาม...');
      try {
        const res = await window.LearnexAPI.post('createQuestion', { title, body, courseTag });
        hideLoader();
        showToast(res.message, res.success ? 'success' : 'error');
        if (res.success) {
          document.getElementById('new-question-form').reset();
          await loadAuthenticatedWorkspace();
          switchView('community');
        }
      } catch (err) {
        hideLoader();
        showToast(err.message, 'error');
      }
    });

    document.addEventListener('submit', async (e) => {
      const replyForm = e.target.closest('.reply-form');
      if (!replyForm) return;
      e.preventDefault();
      const qId = replyForm.dataset.replyQuestion;
      const input = replyForm.querySelector('input');
      const message = input.value.trim();
      if (!message) return;

      showLoader('กำลังส่งคำตอบ...');
      try {
        const res = await window.LearnexAPI.post('replyQuestion', { questionId: qId, message });
        hideLoader();
        showToast(res.message, res.success ? 'success' : 'error');
        if (res.success) {
          await loadAuthenticatedWorkspace();
          switchView('community');
        }
      } catch (err) {
        hideLoader();
        showToast(err.message, 'error');
      }
    });

    // Admin Tabs, Course Editor & Role Update
    document.querySelectorAll('[data-admin-tab]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const target = tabBtn.dataset.adminTab;
        document.querySelectorAll('[data-admin-tab]').forEach((b) => {
          b.classList.toggle('active', b === tabBtn);
          b.setAttribute('aria-selected', String(b === tabBtn));
        });
        document.querySelectorAll('.admin-tab-panel').forEach((panel) => {
          panel.hidden = panel.id !== 'admin-panel-' + target;
        });
      });
    });

    document.getElementById('btn-open-new-course').addEventListener('click', () => openCourseEditor(null));

    document.getElementById('course-editor-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        courseId: document.getElementById('edit-course-id').value.trim(),
        title: document.getElementById('edit-course-title').value.trim(),
        instructor: document.getElementById('edit-course-instructor').value.trim(),
        category: document.getElementById('edit-course-category').value,
        targetGroup: document.getElementById('edit-course-target').value,
        durationMinutes: Number(document.getElementById('edit-course-duration').value || 60),
        description: document.getElementById('edit-course-desc').value.trim(),
        videoUrl: document.getElementById('edit-course-video').value.trim(),
        status: document.getElementById('edit-course-status').value,
        quizQuestion: document.getElementById('edit-course-quiz-q').value.trim(),
        quizOptions: [
          document.getElementById('edit-course-opt-0').value.trim(),
          document.getElementById('edit-course-opt-1').value.trim(),
          document.getElementById('edit-course-opt-2').value.trim(),
          document.getElementById('edit-course-opt-3').value.trim()
        ],
        quizAnswerIndex: Number(document.getElementById('edit-course-correct-idx').value || 0)
      };

      if (!payload.title || !payload.description || !payload.quizQuestion) {
        showToast('กรุณากรอกข้อมูลหลักสูตรและคำถามให้ครบถ้วน', 'error');
        return;
      }

      showLoader('กำลังบันทึกข้อมูลหลักสูตรลง Google Sheets...');
      try {
        const res = await window.LearnexAPI.post('saveCourse', payload);
        hideLoader();
        showToast(res.message, res.success ? 'success' : 'error');
        if (res.success) {
          closeModal('modal-course-form');
          await loadAuthenticatedWorkspace();
          switchView('admin');
        }
      } catch (err) {
        hideLoader();
        showToast(err.message, 'error');
      }
    });

    document.addEventListener('change', async (e) => {
      const roleSelect = e.target.closest('.admin-role-select');
      if (!roleSelect) return;
      const userId = roleSelect.dataset.userId;
      const newRole = roleSelect.value;

      showLoader('กำลังอัปเดตสิทธิ์ผู้ใช้งาน...');
      try {
        const res = await window.LearnexAPI.post('updateUserRole', {
          userId: userId,
          role: newRole,
          status: 'active'
        });
        hideLoader();
        showToast(res.message, res.success ? 'success' : 'error');
        if (res.success) {
          await loadAuthenticatedWorkspace();
          switchView('admin');
        }
      } catch (err) {
        hideLoader();
        showToast(err.message, 'error');
      }
    });

    document.getElementById('btn-sync-db-schema').addEventListener('click', async () => {
      showLoader('กำลังตรวจสอบโครงสร้างฐานข้อมูล...');
      try {
        const res = await window.LearnexAPI.post('reinitializeDatabase');
        hideLoader();
        showToast(res.message, res.success ? 'success' : 'error');
      } catch (err) {
        hideLoader();
        showToast(err.message, 'error');
      }
    });

    // Escape key closes open modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop:not([hidden])').forEach((m) => {
          m.hidden = true;
        });
      }
    });
  }
})();