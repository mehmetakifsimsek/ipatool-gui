/* ═══════════════════════════════════════════════════════════
   IPATool GUI — Renderer
   ═══════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const api = window.api;

  /* ── DOM References ── */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // Pages
  const pages = {
    dashboard: $('#page-dashboard'),
    auth: $('#page-auth'),
    search: $('#page-search'),
    download: $('#page-download'),
    versions: $('#page-versions'),
    settings: $('#page-settings'),
    logs: $('#page-logs'),
  };

  const pageScrollPositions = {};
  const errorLogs = [];
  const logsBody = $('#logs-body');

  function logError(message) {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMessage = `[${timestamp}] ❌ ${message}`;
    errorLogs.push(formattedMessage);
    
    const div = document.createElement('div');
    div.style.marginBottom = '6px';
    div.style.color = '#ef4444';
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = formattedMessage;
    
    if (logsBody) {
      const emptyEl = $('#logs-empty', logsBody);
      if (emptyEl) emptyEl.style.display = 'none';
      logsBody.appendChild(div);
      logsBody.scrollTop = logsBody.scrollHeight;
    }
  }

  function logMessage(message, isSuccess = false) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = isSuccess ? '✅' : 'ℹ️';
    const formattedMessage = `[${timestamp}] ${prefix} ${message}`;
    errorLogs.push(formattedMessage);
    
    const div = document.createElement('div');
    div.style.marginBottom = '6px';
    div.style.color = isSuccess ? '#10b981' : '#e4e4e7';
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = formattedMessage;
    
    if (logsBody) {
      const emptyEl = $('#logs-empty', logsBody);
      if (emptyEl) emptyEl.style.display = 'none';
      logsBody.appendChild(div);
      logsBody.scrollTop = logsBody.scrollHeight;
    }
  }

  // Setup overlay
  const setupOverlay = $('#setup-overlay');
  const setupLog = $('#setup-log');
  const setupSpinner = $('#setup-spinner');
  const setupFooter = $('#setup-footer');

  // Dashboard
  const statusBinary = $('#status-binary');
  const statusAuth = $('#status-auth');
  const statusVersion = $('#status-version');
  const dotBinary = $('#dot-binary');
  const dotAuth = $('#dot-auth');

  // Auth
  const authLoginForm = $('#auth-login-form');
  const auth2FAForm = $('#auth-2fa-form');
  const authInfoPanel = $('#auth-info-panel');

  // Search
  const searchEmpty = $('#search-empty');
  const searchResults = $('#search-results');

  // Download
  const dlTerminal = $('#dl-terminal');
  const dlLog = $('#dl-log');
  const dlComplete = $('#dl-complete');
  const dlCompletePath = $('#dl-complete-path');
  const dlProgressContainer = $('#dl-progress-container');
  const dlProgressBarFill = $('#dl-progress-bar-fill');
  const dlProgressText = $('#dl-progress-text');
  const dlProgressStatus = $('#dl-progress-status');

  // Versions
  const versionsEmpty = $('#versions-empty');
  const versionsTableWrapper = $('#versions-table-wrapper');
  const versionsTbody = $('#versions-tbody');

  // State
  let currentPage = 'dashboard';
  let binaryReady = false;
  let isAuthenticated = false;
  let lastDownloadPath = '';
  let selectedAppArtworkUrl = '';
  let selectedAppName = '';
  let currentVersionsSessionId = 0;

  // Queue State
  const downloadQueue = [];
  let concurrentDownloadsLimit = 1;
  let isQueueRunning = false;


  /* ═══════════════════════════════════════════
     TOAST SYSTEM
     ═══════════════════════════════════════════ */
  const toastIcons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

  function showToast(message, type = 'info', duration = 4000, customLogMessage = null) {
    // Log the full, untruncated message to Application Logs first
    const logMsg = customLogMessage !== null ? customLogMessage : message;
    if (type === 'error') {
      logError(logMsg);
    } else if (type === 'success') {
      logMessage(logMsg, true);
    } else {
      logMessage(logMsg, false);
    }

    const container = $('#toast-container');
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;

    // Truncate message for UI display to maximum 2 lines (approx 90 chars total or 2 newlines)
    let displayMessage = message || '';
    const lines = displayMessage.split('\n');
    if (lines.length > 2 || displayMessage.length > 90) {
      if (lines.length > 2) {
        displayMessage = lines.slice(0, 2).join('\n');
        if (displayMessage.length > 90) {
          displayMessage = displayMessage.substring(0, 90);
        }
      } else {
        displayMessage = displayMessage.substring(0, 90);
      }
      displayMessage += '..........';
    }

    el.innerHTML = `<span class="toast__icon">${toastIcons[type] || ''}</span><span style="white-space: pre-line; word-break: break-word;">${escapeHtml(displayMessage)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      el.addEventListener('animationend', () => el.remove());
    }, duration);
  }

  function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
      const overlay = $('#confirm-overlay');
      const titleEl = $('#confirm-title');
      const msgEl = $('#confirm-message');
      const btnYes = $('#confirm-btn-yes');
      const btnNo = $('#confirm-btn-no');

      titleEl.textContent = title;
      msgEl.textContent = message;
      overlay.classList.add('visible');

      const cleanup = (value) => {
        overlay.classList.remove('visible');
        btnYes.replaceWith(btnYes.cloneNode(true));
        btnNo.replaceWith(btnNo.cloneNode(true));
        resolve(value);
      };

      $('#confirm-btn-yes').addEventListener('click', () => cleanup(true));
      $('#confirm-btn-no').addEventListener('click', () => cleanup(false));
    });
  }

  function showCancelModal(taskName) {
    return new Promise((resolve) => {
      const modal = $('#cancel-modal');
      const msg = $('#cancel-modal-message');
      const btnPause = $('#cancel-modal-btn-pause');
      const btnStop = $('#cancel-modal-btn-stop');
      const btnKeep = $('#cancel-modal-btn-keep');

      msg.textContent = `The download for "${taskName}" has been temporarily paused. What would you like to do?`;
      modal.classList.add('visible');

      const cleanup = (action) => {
        modal.classList.remove('visible');
        // Clear listeners by replacing buttons
        btnPause.replaceWith(btnPause.cloneNode(true));
        btnStop.replaceWith(btnStop.cloneNode(true));
        btnKeep.replaceWith(btnKeep.cloneNode(true));
        resolve(action);
      };

      $('#cancel-modal-btn-pause').addEventListener('click', () => cleanup('pause'));
      $('#cancel-modal-btn-stop').addEventListener('click', () => cleanup('stop'));
      $('#cancel-modal-btn-keep').addEventListener('click', () => cleanup('continue'));
    });
  }

  /* ═══════════════════════════════════════════
     NAVIGATION
     ═══════════════════════════════════════════ */
  function showPage(name) {
    if (!pages[name]) return;

    if (currentPage && $('#content')) {
      pageScrollPositions[currentPage] = $('#content').scrollTop;
    }

    currentPage = name;

    // Update pages
    Object.values(pages).forEach(p => p.classList.remove('page--active'));
    pages[name].classList.add('page--active');
    // Re-trigger animation
    pages[name].style.animation = 'none';
    // Force reflow
    void pages[name].offsetHeight;
    pages[name].style.animation = '';

    // Update nav
    $$('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === name);
    });

    if ($('#content')) {
      const savedScroll = pageScrollPositions[name] || 0;
      $('#content').scrollTop = savedScroll;
    }
  }

  // Sidebar nav clicks
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });

  // Quick action buttons
  $('#qa-search').addEventListener('click', () => showPage('search'));
  $('#qa-download').addEventListener('click', () => showPage('download'));

  /* ═══════════════════════════════════════════
     TITLEBAR
     ═══════════════════════════════════════════ */
  $('#btn-minimize').addEventListener('click', () => api.windowMinimize());
  $('#btn-maximize').addEventListener('click', () => api.windowMaximize());
  $('#btn-close').addEventListener('click', () => api.windowClose());

  /* ═══════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════ */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function updateSidebarBadge() {
    const badge = $('#sidebar-queue-badge');
    if (!badge) return;
    const activeOrQueuedCount = downloadQueue.filter(t => t.status === 'queued' || t.status === 'downloading' || t.status === 'paused').length;
    if (activeOrQueuedCount > 0) {
      badge.textContent = activeOrQueuedCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function triggerFlyToDownloadAnimation(sourceImgEl) {
    if (!sourceImgEl) return;

    const rect = sourceImgEl.getBoundingClientRect();
    const targetEl = $('.nav-item[data-page="download"]');
    if (!targetEl) return;
    const targetRect = targetEl.getBoundingClientRect();

    const flyer = document.createElement('div');
    flyer.style.position = 'fixed';
    flyer.style.left = `${rect.left}px`;
    flyer.style.top = `${rect.top}px`;
    flyer.style.width = `${rect.width}px`;
    flyer.style.height = `${rect.height}px`;
    flyer.style.zIndex = '99999';
    flyer.style.pointerEvents = 'none';
    flyer.style.borderRadius = '12px';
    flyer.style.boxShadow = '0 8px 24px rgba(99, 102, 241, 0.5)';
    flyer.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    flyer.style.background = 'var(--bg-card)';
    flyer.style.backgroundSize = 'cover';
    flyer.style.backgroundPosition = 'center';

    if (sourceImgEl.tagName === 'IMG') {
      flyer.style.backgroundImage = `url("${sourceImgEl.src}")`;
    } else {
      flyer.innerHTML = sourceImgEl.innerHTML || '📱';
      flyer.style.display = 'flex';
      flyer.style.alignItems = 'center';
      flyer.style.justifyContent = 'center';
      flyer.style.fontSize = '22px';
      flyer.style.color = '#fff';
    }

    document.body.appendChild(flyer);

    flyer.style.transition = 'all 1.35s cubic-bezier(0.25, 1.25, 0.45, 1)';

    requestAnimationFrame(() => {
      flyer.style.left = `${targetRect.left + 24}px`;
      flyer.style.top = `${targetRect.top + 16}px`;
      flyer.style.width = '12px';
      flyer.style.height = '12px';
      flyer.style.opacity = '0.15';
      flyer.style.transform = 'rotate(360deg) scale(0.1)';
    });

    setTimeout(() => {
      flyer.remove();
      
      targetEl.classList.remove('tab-pulse');
      void targetEl.offsetHeight; // force reflow
      targetEl.classList.add('tab-pulse');
      
      setTimeout(() => {
        targetEl.classList.remove('tab-pulse');
      }, 500);
    }, 1350);
  }

  function setLoading(btn, loading) {
    const text = $('.btn-text', btn);
    const loader = $('.btn-loader', btn);
    if (!text || !loader) return;
    if (loading) {
      text.classList.add('hidden');
      loader.classList.remove('hidden');
      btn.disabled = true;
    } else {
      text.classList.remove('hidden');
      loader.classList.add('hidden');
      btn.disabled = false;
    }
  }

  function appendLog(container, message) {
    const line = document.createElement('div');
    line.textContent = message;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  }

  function clearLog(container) {
    container.innerHTML = '';
  }

  /** Try to parse ipatool JSON output. Returns parsed object or the raw string. */
  function tryParseOutput(output) {
    if (!output) return null;
    // ipatool may output multiple JSON lines; take all of them
    const lines = output.trim().split('\n');
    const parsed = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line));
      } catch {
        // not JSON — ignore
      }
    }
    if (parsed.length === 1) return parsed[0];
    if (parsed.length > 1) return parsed;
    return output; // fallback raw string
  }

  /* ═══════════════════════════════════════════
     SETUP / BINARY CHECK
     ═══════════════════════════════════════════ */
  async function initApp() {
    try {
      const result = await api.checkBinary();
      if (result && result.exists) {
        binaryReady = true;
        statusBinary.textContent = 'Installed';
        dotBinary.classList.add('ok');
        if (result.path) {
          $('#input-set-binary').value = result.path;
        }
        await checkAuthStatus();
      } else {
        statusBinary.textContent = 'Not found';
        dotBinary.classList.add('err');
        startSetup();
      }
    } catch (err) {
      statusBinary.textContent = 'Error';
      dotBinary.classList.add('err');
      showToast('Failed to check binary: ' + (err.message || err), 'error');
    }

    // Load settings
    loadSettings();

    // Wire up Start Queue button click listener
    const btnStartQueue = $('#btn-start-queue');
    if (btnStartQueue) {
      btnStartQueue.addEventListener('click', async () => {
        if (isQueueRunning) {
          isQueueRunning = false;
          showToast('Download queue paused', 'info');
          
          // Loop through active downloads and suspend them
          const activeTasks = downloadQueue.filter(t => t.status === 'downloading');
          for (const task of activeTasks) {
            task.status = 'paused';
            task.output += '\n⏸️ Queue paused - suspending download...';
            const logBody = $(`#log-body-${task.id}`);
            if (logBody) logBody.textContent = task.output;
            api.pauseDownload({ taskId: task.id }); // asynchronous trigger
          }
        } else {
          isQueueRunning = true;
          showToast('Resuming download queue...', 'success');
          
          // Loop through paused downloads and resume them
          const pausedTasks = downloadQueue.filter(t => t.status === 'paused');
          for (const task of pausedTasks) {
            task.status = 'downloading';
            task.output += '\n▶️ Queue resumed - resuming download...';
            const logBody = $(`#log-body-${task.id}`);
            if (logBody) logBody.textContent = task.output;
            api.resumeDownload({ taskId: task.id }); // asynchronous trigger
          }
          
          // Trigger scheduler for any remaining capacity
          processQueue();
        }
        renderQueue();
        updateDownloadButtonText();
      });
    }

    // ── Global Queue Event Listeners ──────────────────────────────────────────
    api.onCommandOutput((data) => {
      if (data && typeof data === 'object' && data.taskId) {
        const task = downloadQueue.find(t => t.id === data.taskId);
        if (task && task.status === 'downloading') {
          const line = data.line || '';
          const trimmed = line.trim();
          let parsedLine = line;

          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              const obj = JSON.parse(trimmed);
              if (obj.success === true && obj.output) {
                parsedLine = obj.output;
              } else if (obj.success === false && obj.error) {
                parsedLine = `❌ Error: ${obj.error}`;
              } else if (obj.message) {
                parsedLine = obj.message;
              }
            } catch (_) {}
          }

          task.output += parsedLine + '\n';
          
          const logBodyEl = document.getElementById(`log-body-${task.id}`);
          if (logBodyEl) {
            logBodyEl.textContent = task.output;
            const logTerminal = document.getElementById(`log-terminal-${task.id}`);
            if (logTerminal && !logTerminal.classList.contains('hidden')) {
              logTerminal.scrollTop = logTerminal.scrollHeight;
            }
          }
        }
      }
    });

    api.onDownloadProgress((data) => {
      if (data && typeof data === 'object' && data.taskId) {
        const task = downloadQueue.find(t => t.id === data.taskId);
        if (task && task.status === 'downloading') {
          const percentage = Math.min(100, Math.max(0, data.percentage));
          task.progress = percentage;

          const fillEl = document.getElementById(`progress-fill-${task.id}`);
          const textEl = document.getElementById(`progress-text-${task.id}`);
          if (fillEl) fillEl.style.width = `${percentage}%`;
          if (textEl) textEl.textContent = `${percentage}%`;
        }
      }
    });
    // ──────────────────────────────────────────────────────────────────────────

    // Check for IPATool CLI updates
    checkCliUpdates();

    // Load GitHub avatars for credits
    loadCreditsAvatars();

    // Check for GUI Updates silently at startup
    checkGuiUpdatesAtStartup();
  }

  let localCliVersion = 'v2.3.0';
  let latestCliVersion = 'v2.3.0';

  async function checkCliUpdates() {
    try {
      // 1. Get local version
      const localRes = await api.getLocalCliVersion();
      localCliVersion = localRes || 'Unknown';

      // 2. Get latest remote version
      const remoteRes = await api.fetchIpatoolVersion();
      if (remoteRes && remoteRes.success && remoteRes.tag) {
        latestCliVersion = remoteRes.tag;
        statusVersion.textContent = remoteRes.tag;
      } else {
        latestCliVersion = 'v2.3.0';
        statusVersion.textContent = 'v2.3.0 (local)';
      }

      // Update Settings UI
      const cliVersionText = $('#cli-version-text');
      const btnUpdateCli = $('#btn-set-update-cli');
      const cliUpdateStatus = $('#cli-update-status');

      if (cliVersionText && btnUpdateCli) {
        cliVersionText.textContent = `Current: ${localCliVersion} | Latest: ${latestCliVersion}`;
        
        // Compare versions
        const hasUpdate = isNewerVersion(localCliVersion, latestCliVersion);
        if (hasUpdate) {
          btnUpdateCli.disabled = false;
          btnUpdateCli.classList.remove('btn--outline');
          btnUpdateCli.classList.add('btn--primary');
          
          if (cliUpdateStatus) {
            cliUpdateStatus.style.color = 'var(--warning)';
            cliUpdateStatus.textContent = `A new IPATool CLI update (${latestCliVersion}) is available!`;
            cliUpdateStatus.style.display = 'block';
          }
          
          // Toast on startup
          showToast(`A new IPATool CLI update is available: ${latestCliVersion}! Update it in Settings.`, 'warning');
        } else {
          btnUpdateCli.disabled = true;
          btnUpdateCli.classList.remove('btn--primary');
          btnUpdateCli.classList.add('btn--outline');
          
          if (cliUpdateStatus) {
            cliUpdateStatus.style.color = 'var(--success)';
            cliUpdateStatus.textContent = `IPATool CLI is up to date.`;
            cliUpdateStatus.style.display = 'block';
          }
        }
      }
    } catch (err) {
      console.error('Failed to check CLI updates:', err);
    }
  }

  function isNewerVersion(local, latest) {
    if (!local || !latest) return false;
    const cleanLocal = local.replace('v', '').trim();
    const cleanLatest = latest.replace('v', '').trim();
    if (cleanLocal.toLowerCase() === 'dev') return false; 
    if (cleanLocal === cleanLatest) return false;

    const localParts = cleanLocal.split('.').map(Number);
    const latestParts = cleanLatest.split('.').map(Number);

    for (let i = 0; i < Math.max(localParts.length, latestParts.length); i++) {
      const localPart = localParts[i] || 0;
      const latestPart = latestParts[i] || 0;
      if (latestPart > localPart) return true;
      if (latestPart < localPart) return false;
    }
    return false;
  }

  async function loadCreditsAvatars() {
    // Load Majd's avatar
    try {
      const majdResult = await api.fetchGithubAvatar({ username: 'majd' });
      if (majdResult && majdResult.success && majdResult.dataUrl) {
        const avatarMajd = $('#avatar-majd');
        avatarMajd.innerHTML = `<img src="${majdResult.dataUrl}" alt="Majd" />`;
      }
    } catch { /* ignore */ }

    // Load Mehmet's avatar
    try {
      const mehmetResult = await api.fetchGithubAvatar({ username: 'mehmetakifsimsek' });
      if (mehmetResult && mehmetResult.success && mehmetResult.dataUrl) {
        const avatarMehmet = $('#avatar-mehmet');
        avatarMehmet.innerHTML = `<img src="${mehmetResult.dataUrl}" alt="Mehmet" />`;
      }
    } catch { /* ignore */ }

    // Click handlers for credits
    $('#credit-majd').addEventListener('click', () => {
      api.openExternal({ url: 'https://github.com/majd' });
    });
    $('#credit-mehmet').addEventListener('click', () => {
      api.openExternal({ url: 'https://github.com/mehmetakifsimsek' });
    });
  }

  function startSetup() {
    setupOverlay.classList.add('visible');
    clearLog(setupLog);
    setupFooter.classList.add('hidden');
    setupSpinner.style.display = '';

    // Listen for download progress
    api.onDownloadLog((message) => {
      appendLog(setupLog, message);
    });

    api.downloadBinary().then(result => {
      setupSpinner.style.display = 'none';
      if (result && result.success) {
        binaryReady = true;
        statusBinary.textContent = 'Installed';
        dotBinary.classList.remove('err');
        dotBinary.classList.add('ok');
        appendLog(setupLog, '\n✅ Binary downloaded successfully!');
        setupFooter.classList.remove('hidden');
      } else {
        appendLog(setupLog, '\n❌ Download failed: ' + (result?.error || 'Unknown error'));
        setupFooter.classList.remove('hidden');
        setupFooter.querySelector('.setup-success').textContent = '❌ Setup failed. You can try again from Settings.';
      }
      api.removeAllListeners('download-log');
    }).catch(err => {
      setupSpinner.style.display = 'none';
      appendLog(setupLog, '\n❌ Error: ' + (err.message || err));
      setupFooter.classList.remove('hidden');
      setupFooter.querySelector('.setup-success').textContent = '❌ Setup failed.';
      api.removeAllListeners('download-log');
    });
  }

  $('#setup-continue').addEventListener('click', async () => {
    setupOverlay.classList.remove('visible');
    if (binaryReady) {
      await checkAuthStatus();
      // Update binary path
      const res = await api.checkBinary();
      if (res && res.path) $('#input-set-binary').value = res.path;
    }
  });

  /* ═══════════════════════════════════════════
     AUTH
     ═══════════════════════════════════════════ */
  async function checkAuthStatus() {
    try {
      const result = await api.authInfo();
      if (result && result.success) {
        const data = tryParseOutput(result.output);
        isAuthenticated = true;
        statusAuth.textContent = 'Signed in';
        dotAuth.classList.add('ok');
        showAuthLoggedIn(data);
      } else {
        isAuthenticated = false;
        statusAuth.textContent = 'Not signed in';
        dotAuth.classList.add('warn');
        showAuthLoggedOut();
      }
    } catch {
      isAuthenticated = false;
      statusAuth.textContent = 'Not signed in';
      dotAuth.classList.add('warn');
      showAuthLoggedOut();
    }
  }

  function showAuthLoggedOut() {
    authLoginForm.classList.remove('hidden');
    auth2FAForm.classList.add('hidden');
    authInfoPanel.classList.add('hidden');
  }

  function showAuthLoggedIn(data) {
    authLoginForm.classList.add('hidden');
    auth2FAForm.classList.add('hidden');
    authInfoPanel.classList.remove('hidden');

    let name = '—';
    let email = '—';
    if (data && typeof data === 'object') {
      // Try common fields
      name = data.name || data.Name || data.firstName || '—';
      email = data.email || data.Email || data.appleId || '—';
    }
    $('#auth-display-name').textContent = name;
    $('#auth-display-email').textContent = email;
  }

  // Login form
  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#btn-login');
    const emailVal = $('#input-email').value.trim();
    const passwordVal = $('#input-password').value;

    if (!emailVal || !passwordVal) {
      showToast('Please fill in all fields', 'warning');
      return;
    }

    setLoading(btn, true);
    try {
      const result = await api.authLogin({ email: emailVal, password: passwordVal });
      if (result && result.needs2FA) {
        showToast('2FA required — check your device', 'info');
        authLoginForm.classList.add('hidden');
        auth2FAForm.classList.remove('hidden');
        $('#input-2fa').focus();
      } else if (result && result.success) {
        showToast('Signed in successfully!', 'success');
        isAuthenticated = true;
        statusAuth.textContent = 'Signed in';
        dotAuth.classList.remove('warn');
        dotAuth.classList.add('ok');
        const data = tryParseOutput(result.output);
        showAuthLoggedIn(data);
      } else {
        showToast(parseErrorMessage(result), 'error');
      }
    } catch (err) {
      showToast('Login failed: ' + (err.message || err), 'error');
    }
    setLoading(btn, false);
  });

  // 2FA form
  $('#form-2fa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#btn-2fa');
    const code = $('#input-2fa').value.trim();
    if (!code) {
      showToast('Enter the verification code', 'warning');
      return;
    }

    setLoading(btn, true);
    try {
      const result = await api.auth2FA({ code });
      if (result && result.success) {
        showToast('Authenticated successfully!', 'success');
        isAuthenticated = true;
        statusAuth.textContent = 'Signed in';
        dotAuth.classList.remove('warn');
        dotAuth.classList.add('ok');
        await checkAuthStatus();
      } else {
        showToast(parseErrorMessage(result), 'error');
      }
    } catch (err) {
      showToast('Verification failed: ' + (err.message || err), 'error');
    }
    setLoading(btn, false);
  });

  // 2FA Back button
  $('#btn-2fa-back').addEventListener('click', async () => {
    auth2FAForm.classList.add('hidden');
    authLoginForm.classList.remove('hidden');
    $('#input-2fa').value = '';
    
    // Clear password for security and reset visibility icon
    $('#input-password').value = '';
    $('#input-password').setAttribute('type', 'password');
    $('#btn-toggle-password').textContent = '👁️';

    try {
      await api.cancelAuth();
    } catch (_) {}
  });

  // Password visibility toggle
  $('#btn-toggle-password').addEventListener('click', () => {
    const inputPass = $('#input-password');
    const btnToggle = $('#btn-toggle-password');
    if (inputPass && btnToggle) {
      const isPassword = inputPass.getAttribute('type') === 'password';
      inputPass.setAttribute('type', isPassword ? 'text' : 'password');
      btnToggle.textContent = isPassword ? '🙈' : '👁️';
    }
  });

  // Logout
  $('#btn-logout').addEventListener('click', async () => {
    const btn = $('#btn-logout');
    setLoading(btn, true);
    try {
      const result = await api.authRevoke();
      if (result && result.success) {
        showToast('Signed out', 'success');
        isAuthenticated = false;
        statusAuth.textContent = 'Not signed in';
        dotAuth.classList.remove('ok');
        dotAuth.classList.add('warn');
        showAuthLoggedOut();
        // Clear form
        $('#input-email').value = '';
        $('#input-password').value = '';
        $('#input-2fa').value = '';
      } else {
        showToast(parseErrorMessage(result), 'error');
      }
    } catch (err) {
      showToast('Logout failed: ' + (err.message || err), 'error');
    }
    setLoading(btn, false);
  });

  /* ═══════════════════════════════════════════
     SEARCH
     ═══════════════════════════════════════════ */
  async function performSearch() {
    const query = $('#input-search').value.trim();
    if (!query) {
      showToast('Enter a search term', 'warning');
      return;
    }

    const btn = $('#btn-search');
    const limit = parseInt($('#select-limit').value, 10);

    // Show loading skeletons
    searchEmpty.classList.add('hidden');
    searchResults.classList.remove('hidden');
    searchResults.innerHTML = '';
    for (let i = 0; i < Math.min(limit, 6); i++) {
      searchResults.innerHTML += `
        <div class="skeleton-card">
          <div class="skeleton-line skeleton-line--title"></div>
          <div class="skeleton-line skeleton-line--sub"></div>
          <div class="skeleton-line skeleton-line--short"></div>
        </div>`;
    }

    setLoading(btn, true);
    try {
      // Load country from settings
      const settings = await api.getSettings();
      const country = settings?.country || undefined;

      const result = await api.search({ query, limit, country });
      if (result && result.success) {
        const data = tryParseOutput(result.output);
        renderSearchResults(data);
      } else {
        searchResults.innerHTML = '';
        searchEmpty.classList.remove('hidden');
        showToast(parseErrorMessage(result), 'error');
      }
    } catch (err) {
      searchResults.innerHTML = '';
      searchEmpty.classList.remove('hidden');
      showToast('Search failed: ' + (err.message || err), 'error');
    }
    setLoading(btn, false);
  }

  $('#btn-search').addEventListener('click', performSearch);
  $('#input-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performSearch();
  });

  function renderSearchResults(data) {
    searchResults.innerHTML = '';

    let apps = [];
    if (Array.isArray(data)) {
      // Could be array of JSON lines; flatten
      for (const item of data) {
        if (Array.isArray(item)) apps.push(...item);
        else if (item && typeof item === 'object') {
          // Might have a nested array field
          const arrField = Object.values(item).find(v => Array.isArray(v));
          if (arrField) apps.push(...arrField);
          else apps.push(item);
        }
      }
    } else if (data && typeof data === 'object') {
      const arrField = Object.values(data).find(v => Array.isArray(v));
      if (arrField) apps = arrField;
      else apps = [data];
    }

    if (apps.length === 0) {
      searchResults.classList.add('hidden');
      searchEmpty.classList.remove('hidden');
      $('#search-empty .empty-state__title').textContent = 'No Results';
      $('#search-empty .empty-state__desc').textContent = 'Try a different search term';
      return;
    }

    for (const app of apps) {
      const name = app.name || app.Name || app.trackName || 'Unknown App';
      const bundle = app.bundleID || app.bundleId || app.bundle_id || '—';
      const version = app.version || app.Version || '—';
      const price = app.price !== undefined ? (app.price === 0 ? 'Free' : `$${app.price}`) : (app.Price || '—');
      const artworkUrl = app.artworkURL || app.artworkUrl || app.artworkUrl100 || '';

      const card = document.createElement('div');
      card.className = 'app-card';
      card.innerHTML = `
        <div style="display: flex; gap: 15px; align-items: center; margin-bottom: 12px;">
          ${artworkUrl ? `<img src="${escapeHtml(artworkUrl)}" style="width: 48px; height: 48px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08);" />` : `<div style="width: 48px; height: 48px; border-radius: 10px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; font-size: 20px; border: 1px solid rgba(255,255,255,0.08);">📱</div>`}
          <div style="flex: 1; min-width: 0;">
            <div class="app-card__name" style="margin-bottom: 2px;">${escapeHtml(name)}</div>
            <div class="app-card__bundle">${escapeHtml(bundle)}</div>
          </div>
        </div>
        <div class="app-card__meta">
          <span class="app-card__tag"><strong>Version:</strong> ${escapeHtml(String(version))}</span>
          <span class="app-card__tag"><strong>Price:</strong> ${escapeHtml(String(price))}</span>
        </div>
        <div class="app-card__actions">
          <button class="btn btn--primary btn--sm btn-card-dl" data-bundle="${escapeHtml(bundle)}" data-artwork="${escapeHtml(artworkUrl)}" data-appname="${escapeHtml(name)}">📥 Add to Queue</button>
          <button class="btn btn--outline btn--sm btn-card-ver" data-bundle="${escapeHtml(bundle)}" data-artwork="${escapeHtml(artworkUrl)}" data-appname="${escapeHtml(name)}">📋 Versions</button>
        </div>
      `;
      searchResults.appendChild(card);
    }

    // Card action handlers
    $$('.btn-card-dl', searchResults).forEach(btn => {
      btn.addEventListener('click', async () => {
        const bundle = btn.dataset.bundle;
        if (bundle && bundle !== '—') {
          const artUrl = btn.dataset.artwork || '';
          const appName = btn.dataset.appname || '';
          
          selectedAppArtworkUrl = artUrl;
          selectedAppName = appName;

          // Check if this app version is already in the download queue
          const isDuplicate = downloadQueue.some(t => 
            t.bundleId.toLowerCase() === bundle.toLowerCase() && 
            (t.versionId ? String(t.versionId).trim() : '') === ''
          );
          if (isDuplicate) {
            showToast(`"${appName}" is already in the download list`, 'warning');
            return;
          }

          // Get default output directory from settings
          const settings = await api.getSettings();
          const outputDir = settings?.outputDir || lastDownloadPath || '';

          // Create a new queued task
          const taskId = `dl-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const newTask = {
            id: taskId,
            bundleId: bundle,
            versionId: null,
            appName: appName,
            appIcon: artUrl || 'icon.ico',
            purchase: $('#check-purchase') ? $('#check-purchase').checked : true,
            outputDir: outputDir,
            status: 'queued',
            progress: 0,
            output: 'Waiting in queue...',
            filePath: null,
            error: null,
            addedTime: Date.now()
          };

          downloadQueue.push(newTask);
          
          // Trigger genie flying animation
          const card = btn.closest('.app-card');
          const cardIcon = card ? (card.querySelector('img') || card.querySelector('div[style*="width: 48px"]')) : null;
          if (cardIcon) {
            triggerFlyToDownloadAnimation(cardIcon);
          }

          showToast(`Added to queue: ${appName}`, 'success');

          // Refresh UI
          renderQueue();
          updateDownloadButtonText();
          
          // Trigger scheduler in case the queue is already running
          processQueue();
        }
      });
    });

    $$('.btn-card-ver', searchResults).forEach(btn => {
      btn.addEventListener('click', () => {
        const bundle = btn.dataset.bundle;
        if (bundle && bundle !== '—') {
          currentVersionsSessionId++;
          api.cancelVersionDetails();
          const currentBundle = $('#input-ver-bundle').value.trim();

          const hasVersions = versionsTbody.children.length > 0;
          
          const artUrl = btn.dataset.artwork || '';
          const appName = btn.dataset.appname || '';
          selectedAppArtworkUrl = artUrl;
          selectedAppName = appName;

          showPage('versions');
          $('#input-ver-bundle').value = bundle;
          
          if (bundle !== currentBundle || !hasVersions) {
            $('#btn-versions').click();
          }
        }
      });
    });
  }

  /* ═══════════════════════════════════════════
     DOWNLOAD
     ═══════════════════════════════════════════ */
  function updateFormAppIcon() {
    const iconContainer = $('#dl-form-app-icon-container');
    const iconImg = $('#dl-form-app-icon');
    if (selectedAppArtworkUrl) {
      iconImg.src = selectedAppArtworkUrl;
      iconContainer.style.display = 'block';
    } else {
      iconContainer.style.display = 'none';
      iconImg.src = '';
    }
    updateDownloadButtonText();
  }

  // ── Queue System Logic ────────────────────────────────────────────────────────
  function updateDownloadButtonText() {
    const btn = $('#btn-dl-start');
    if (!btn) return;
    const btnText = $('.btn-text', btn);
    
    // Check if the bundle ID input is empty
    const bundleInput = $('#input-dl-bundle');
    const isFormEmpty = !bundleInput || !bundleInput.value.trim();

    if (isFormEmpty) {
      // If the form is empty, this button acts as a queue toggle button
      if (isQueueRunning) {
        if (btnText) btnText.textContent = '⏸️ Pause Queue';
        btn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
      } else {
        if (btnText) btnText.textContent = '▶️ Start Queue Download';
        btn.style.background = 'linear-gradient(135deg, var(--accent-start), var(--accent-end))';
      }
    } else {
      // If the form is NOT empty, this button adds the form entry to the queue
      btn.style.background = ''; // reset to default CSS style
      const hasQueueItems = downloadQueue.length > 0;
      if (hasQueueItems) {
        if (btnText) btnText.textContent = '📥 Add to Queue';
      } else {
        if (btnText) btnText.textContent = '⬇️ Start Download';
      }
    }
  }

  // FIFO scheduler
  async function processQueue() {
    // Check if there are any active/queued/downloading tasks left in the queue
    const hasActiveTasks = downloadQueue.some(t => t.status === 'queued' || t.status === 'downloading' || t.status === 'paused');
    if (!hasActiveTasks) {
      isQueueRunning = false;
      updateDownloadButtonText();
      renderQueue();
      return;
    }

    if (!isQueueRunning) return; // Do not start new downloads if the queue is not running
    
    const downloadingCount = downloadQueue.filter(t => t.status === 'downloading').length;
    if (downloadingCount < concurrentDownloadsLimit) {
      const nextTask = downloadQueue.find(t => t.status === 'queued');
      if (nextTask) {
        startTaskDownload(nextTask);
        processQueue(); // check for more capacity
      }
    }
  }

  async function startTaskDownload(task) {
    task.status = 'downloading';
    task.progress = 0;
    task.output = `Initializing download for ${task.appName} (${task.bundleId})...\n`;
    renderQueue();
    updateDownloadButtonText();

    try {
      const params = {
        taskId: task.id,
        bundleId: task.bundleId,
        purchase: task.purchase,
        outputDir: task.outputDir
      };
      if (task.versionId) params.versionId = task.versionId;

      const result = await api.downloadIpa(params);

      // If task was cancelled during download, do nothing further (it's already handled)
      if (task.status === 'cancelled') {
        return;
      }

      if (result && result.success) {
        task.status = 'completed';
        task.progress = 100;
        task.output += '\n✅ Download complete!';
        
        // Extract final file path
        let filePath = '';
        try {
          const data = JSON.parse(result.output);
          if (data && data.path) filePath = data.path;
        } catch (_) {}

        if (!filePath) {
          const match = result.output.match(/[^\s"]+\.ipa/i);
          if (match) filePath = match[0];
        }

        task.filePath = filePath || task.outputDir;
        showToast(`Download complete: ${task.appName}!`, 'success');
      } else {
        task.status = 'failed';
        task.error = result.error || 'Unknown error occurred during download';
        task.output += `\n❌ Error: ${task.error}`;

        // Build detailed tree-indented error log for Application Logs
        const mainError = `Download failed: ${task.appName}`;
        let detailedError = `${task.appName} (${task.bundleId})`;
        
        const errorLines = [];
        if (task.error) {
          const cleanErr = task.error.replace(/^❌\s*Error:\s*/i, '').replace(/^Error:\s*/i, '').trim();
          if (cleanErr) errorLines.push(cleanErr);
        }
        
        if (task.output) {
          const lines = task.output.split('\n');
          for (const line of lines) {
            const cleaned = line.trim();
            if (cleaned.includes('Error:') || cleaned.includes('error:')) {
              const match = cleaned.match(/(?:error|Error):\s*(.*)/);
              if (match && match[1]) {
                const cleanErr = match[1].trim();
                if (cleanErr && !errorLines.includes(cleanErr)) {
                  errorLines.push(cleanErr);
                }
              }
            }
          }
        }
        
        if (errorLines.length > 0) {
          detailedError += '\n';
          errorLines.forEach((err, idx) => {
            const isLast = idx === errorLines.length - 1;
            const prefix = isLast ? '   └── ' : '   ├── ';
            detailedError += `${prefix}${err}\n`;
          });
          detailedError = detailedError.trimEnd();
        }

        showToast(mainError, 'error', 4000, detailedError);
      }
    } catch (err) {
      if (task.status === 'cancelled') return;
      task.status = 'failed';
      task.error = err.message || String(err);
      task.output += `\n❌ Error: ${task.error}`;

      const mainError = `Download failed: ${task.appName}`;
      let detailedError = `${task.appName} (${task.bundleId})`;
      
      const errorLines = [];
      if (task.error) {
        const cleanErr = task.error.replace(/^❌\s*Error:\s*/i, '').replace(/^Error:\s*/i, '').trim();
        if (cleanErr) errorLines.push(cleanErr);
      }
      
      if (task.output) {
        const lines = task.output.split('\n');
        for (const line of lines) {
          const cleaned = line.trim();
          if (cleaned.includes('Error:') || cleaned.includes('error:')) {
            const match = cleaned.match(/(?:error|Error):\s*(.*)/);
            if (match && match[1]) {
              const cleanErr = match[1].trim();
              if (cleanErr && !errorLines.includes(cleanErr)) {
                errorLines.push(cleanErr);
              }
            }
          }
        }
      }
      
      if (errorLines.length > 0) {
        detailedError += '\n';
        errorLines.forEach((err, idx) => {
          const isLast = idx === errorLines.length - 1;
          const prefix = isLast ? '   └── ' : '   ├── ';
          detailedError += `${prefix}${err}\n`;
        });
        detailedError = detailedError.trimEnd();
      }

      showToast(mainError, 'error', 4000, detailedError);
    } finally {
      renderQueue();
      updateDownloadButtonText();
      processQueue();
    }
  }

  function renderQueue() {
    // Always keep sidebar badge in sync
    updateSidebarBadge();

    const queueContainer = $('#queue-container');
    const queueList = $('#queue-list');
    const badgeCount = $('#queue-count-badge');

    if (!queueContainer || !queueList || !badgeCount) return;

    if (downloadQueue.length === 0) {
      queueContainer.classList.add('hidden');
      return;
    }

    queueContainer.classList.remove('hidden');
    badgeCount.textContent = downloadQueue.length;

    // Update the Start Queue button state and text
    const btnStartQueue = $('#btn-start-queue');
    if (btnStartQueue) {
      const hasActiveOrQueued = downloadQueue.some(t => t.status === 'queued' || t.status === 'downloading' || t.status === 'paused');
      if (hasActiveOrQueued) {
        btnStartQueue.classList.remove('hidden');
        if (isQueueRunning) {
          btnStartQueue.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
          btnStartQueue.innerHTML = '⏸️ Pause Queue';
        } else {
          btnStartQueue.style.background = 'linear-gradient(135deg, var(--accent-start), var(--accent-end))';
          btnStartQueue.innerHTML = '▶️ Start Queue Download';
        }
      } else {
        btnStartQueue.classList.add('hidden');
      }
    }

    queueList.innerHTML = '';
    
    downloadQueue.forEach(task => {
      const card = document.createElement('div');
      card.className = 'queue-item glass-panel';
      card.id = `queue-item-${task.id}`;
      card.style.padding = '16px';
      card.style.borderRadius = '12px';
      card.style.background = 'rgba(255, 255, 255, 0.03)';
      card.style.border = '1px solid var(--border-subtle)';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '12px';

      const canCancel = task.status === 'queued' || task.status === 'downloading' || task.status === 'paused';
      const statusLabel = task.status.charAt(0).toUpperCase() + task.status.slice(1);

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
          <div style="display: flex; gap: 12px; align-items: center; min-width: 0; flex: 1;">
            <img src="${task.appIcon || 'icon.ico'}" style="width: 44px; height: 44px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.15); flex-shrink: 0;" alt="Icon" onerror="this.src='icon.ico'" />
            <div style="min-width: 0; flex: 1;">
              <h4 style="margin: 0; font-size: 14.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(task.appName)}">${escapeHtml(task.appName)}</h4>
              <span style="font-size: 12.5px; color: var(--text-secondary); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(task.bundleId)} ${task.versionId ? `• Version: ${escapeHtml(task.versionId)}` : ''}
              </span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <span class="status-badge badge--${task.status}" id="status-badge-${task.id}">${statusLabel}</span>
            ${task.status === 'failed' || task.status === 'cancelled' ? `
              <button class="btn btn--outline btn--sm" data-action="retry" data-id="${task.id}" style="padding: 2px 8px; font-size: 11.5px; height: 26px; border-radius: 6px; display: flex; align-items: center; gap: 4px; cursor: pointer; border-color: rgba(99,102,241,0.3); color: var(--text-primary);" title="Retry Download">🔄 Retry</button>
            ` : ''}
            ${task.status === 'paused' ? `
              <button class="btn btn--outline btn--sm" data-action="continue" data-id="${task.id}" style="padding: 2px 8px; font-size: 11.5px; height: 26px; border-radius: 6px; display: flex; align-items: center; gap: 4px; cursor: pointer; border-color: rgba(16,185,129,0.3); color: var(--success);" title="Continue Download">▶️ Continue</button>
            ` : ''}
            <button class="btn-item-action" data-action="cancel" data-id="${task.id}" style="background: none; border: none; cursor: pointer; font-size: 13px; color: var(--text-muted); display: flex; align-items: center; justify-content: center;" title="${canCancel ? 'Cancel' : 'Remove'}">
              ✖
            </button>
          </div>
        </div>

        <!-- Progress section -->
        <div id="progress-section-${task.id}" class="${task.status === 'downloading' || task.status === 'paused' || task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled' ? '' : 'hidden'}">
          <div class="progress-bar-win7" style="height: 8px; margin-bottom: 6px; background: rgba(0,0,0,0.15); border-radius: 4px; overflow: hidden;">
            <div class="progress-bar-fill-win7" id="progress-fill-${task.id}" style="width: ${task.progress}%;">
              <div class="progress-bar-glow"></div>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary);">
            <span id="progress-status-${task.id}">
              ${task.status === 'completed' ? '✅ Download complete' : task.status === 'failed' ? '❌ Download failed' : task.status === 'cancelled' ? '❌ Download stopped' : task.status === 'paused' ? '⏸️ Paused' : 'Downloading...'}
            </span>
            <span id="progress-text-${task.id}" style="font-weight: 600;">${task.progress}%</span>
          </div>
        </div>

        <!-- Completed path row -->
        <div id="complete-section-${task.id}" class="${task.status === 'completed' && task.filePath ? '' : 'hidden'}" style="margin-top: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(16,185,129,0.05); border: 1px dashed rgba(16,185,129,0.2); padding: 8px 12px; border-radius: 8px; font-size: 12.5px; gap: 8px;">
            <span style="color: var(--success); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; text-align: left;" title="${escapeHtml(task.filePath)}">📂 ${escapeHtml(task.filePath)}</span>
            <button class="btn btn--outline btn--sm" data-action="open" data-path="${escapeHtml(task.filePath)}" style="padding: 4px 8px; font-size: 11.5px; height: 26px; border-radius: 4px; flex-shrink: 0; cursor: pointer;">Open Folder</button>
          </div>
        </div>

        <!-- Error Alert Row -->
        <div id="error-section-${task.id}" class="${task.status === 'failed' && task.error ? '' : 'hidden'}" style="margin-top: 4px;">
          <div style="background: rgba(239,68,68,0.05); border: 1px dashed rgba(239,68,68,0.2); padding: 8px 12px; border-radius: 8px; font-size: 12.5px; color: var(--danger); line-height: 1.4; text-align: left;">
            ❌ Error: ${escapeHtml(task.error)}
          </div>
        </div>

        <!-- Logs Toggle and Drawer -->
        <div style="margin-top: 4px;">
          <button class="btn-toggle-log" data-id="${task.id}" style="background: none; border: none; color: var(--text-secondary); font-size: 12px; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 6px; font-weight: 500;">
            <span id="log-arrow-${task.id}">▶</span> Show Console Logs
          </button>
          <div class="terminal hidden" id="log-terminal-${task.id}" style="margin-top: 8px; height: 150px; padding: 10px; font-family: 'Cascadia Code', 'Consolas', monospace; font-size: 11.5px; overflow-y: auto; background: rgba(0,0,0,0.5); border-radius: 8px; border: 1px solid var(--border-subtle);">
            <div id="log-body-${task.id}" style="color: #a3b8cc; line-height: 1.4; white-space: pre-wrap; word-break: break-all; text-align: left;">${task.output || 'Awaiting download initialization...'}</div>
          </div>
        </div>
      `;

      // Retry card action (for failed or cancelled status)
      if (task.status === 'failed' || task.status === 'cancelled') {
        const btnRetry = $('button[data-action="retry"]', card);
        if (btnRetry) {
          btnRetry.addEventListener('click', (e) => {
            e.stopPropagation();
            task.status = 'queued';
            task.progress = 0;
            task.output = 'Retrying download...';
            task.error = null;
            task.filePath = null;
            
            showToast(`Re-queueing download: ${task.appName}`, 'success');
            renderQueue();
            updateDownloadButtonText();
            processQueue();
          });
        }
      }

      // Continue/Resume card action (for paused status)
      if (task.status === 'paused') {
        const btnContinue = $('button[data-action="continue"]', card);
        if (btnContinue) {
          btnContinue.addEventListener('click', async (e) => {
            e.stopPropagation();
            btnContinue.disabled = true;
            showToast(`Resuming download: ${task.appName}...`, 'info');
            task.output += '\n▶️ Resuming download...';
            const logBody = $(`#log-body-${task.id}`);
            if (logBody) logBody.textContent = task.output;

            const res = await api.resumeDownload({ taskId: task.id });
            if (res && res.success) {
              task.status = 'downloading';
              showToast(`Resumed download: ${task.appName}`, 'success');
            } else {
              task.output += `\n❌ Failed to resume download: ${res?.error || 'Unknown error'}`;
              showToast(`Failed to resume: ${task.appName}`, 'error');
            }
            renderQueue();
            updateDownloadButtonText();
            processQueue();
          });
        }
      }

      // Cancel / Remove card action
      const btnCancel = $('.btn-item-action', card);
      if (btnCancel) {
        btnCancel.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (task.status === 'queued') {
            task.status = 'cancelled';
            task.error = 'Cancelled by user in queue';
            showToast(`Removed from queue: ${task.appName}`, 'info');
            renderQueue();
            updateDownloadButtonText();
            processQueue();
          } else if (task.status === 'downloading') {
            btnCancel.disabled = true;
            
            // 1. Immediately pause the download at OS-level and render paused state
            task.output += '\n⏸️ Automatically pausing download to wait for user decision...';
            const logBody = $(`#log-body-${task.id}`);
            if (logBody) logBody.textContent = task.output;
            
            const pauseRes = await api.pauseDownload({ taskId: task.id });
            if (pauseRes && pauseRes.success) {
              task.status = 'paused';
            } else {
              task.output += `\n❌ Failed to automatically pause download: ${pauseRes?.error || 'Unknown error'}`;
            }
            renderQueue();
            updateDownloadButtonText();
            processQueue();

            // 2. Show the interactive modal to await user action
            const action = await showCancelModal(task.appName);
            if (action === 'continue') {
              task.output += '\n▶️ Resuming download per user decision...';
              if (logBody) logBody.textContent = task.output;
              
              const resumeRes = await api.resumeDownload({ taskId: task.id });
              if (resumeRes && resumeRes.success) {
                task.status = 'downloading';
                showToast(`Resumed download: ${task.appName}`, 'success');
              } else {
                task.output += `\n❌ Failed to resume download: ${resumeRes?.error || 'Unknown error'}`;
                showToast(`Failed to resume: ${task.appName}`, 'error');
              }
              renderQueue();
              updateDownloadButtonText();
              processQueue();
            } else if (action === 'stop') {
              task.output += '\n⏹️ Stopping download per user decision (killing process)...';
              if (logBody) logBody.textContent = task.output;
              
              const stopRes = await api.cancelDownload({ taskId: task.id });
              task.status = 'cancelled';
              task.progress = 0;
              task.error = 'Stopped by user';
              task.output += '\n❌ Download stopped by user.';
              showToast(`Stopped download: ${task.appName}`, 'warning');
              renderQueue();
              updateDownloadButtonText();
              processQueue();
            } else {
              // 'pause' - Keep paused (it is already paused, so we just re-enable control)
              task.output += '\n⏸️ Keeping download paused per user decision.';
              if (logBody) logBody.textContent = task.output;
              showToast(`Download kept paused: ${task.appName}`, 'info');
              renderQueue();
              updateDownloadButtonText();
              processQueue();
            }
          } else if (task.status === 'paused') {
            btnCancel.disabled = true;
            // Terminate the suspended process and stop the download
            task.output += '\n⏹️ Stopping and cancelling paused download...';
            const logBody = $(`#log-body-${task.id}`);
            if (logBody) logBody.textContent = task.output;
            
            const res = await api.cancelDownload({ taskId: task.id });
            task.status = 'cancelled';
            task.progress = 0;
            task.error = 'Stopped by user';
            task.output += '\n❌ Download stopped and cancelled by user.';
            showToast(`Stopped download: ${task.appName}`, 'warning');
            renderQueue();
            updateDownloadButtonText();
            processQueue();
          } else {
            // Remove completed, failed, or cancelled tasks from queue list
            const idx = downloadQueue.indexOf(task);
            if (idx !== -1) {
              downloadQueue.splice(idx, 1);
            }
            renderQueue();
            updateDownloadButtonText();
            processQueue();
          }
        });
      }

      // Open folder action
      const btnOpen = $('button[data-action="open"]', card);
      if (btnOpen) {
        btnOpen.addEventListener('click', (e) => {
          e.stopPropagation();
          api.openFileLocation({ path: btnOpen.dataset.path });
        });
      }

      // Toggle logs action
      const btnToggleLog = $('.btn-toggle-log', card);
      const logTerminal = $(`#log-terminal-${task.id}`, card);
      const logArrow = $(`#log-arrow-${task.id}`, card);
      if (btnToggleLog && logTerminal && logArrow) {
        btnToggleLog.addEventListener('click', (e) => {
          e.stopPropagation();
          const isHidden = logTerminal.classList.contains('hidden');
          if (isHidden) {
            logTerminal.classList.remove('hidden');
            logArrow.textContent = '▼';
            logTerminal.scrollTop = logTerminal.scrollHeight;
          } else {
            logTerminal.classList.add('hidden');
            logArrow.textContent = '▶';
          }
        });
      }

      queueList.appendChild(card);
    });
  }

  // Handle Form Submission
  $('#form-download').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bundleId = $('#input-dl-bundle').value.trim();

    if (!bundleId) {
      // Form is empty, so toggle the queue!
      const hasActiveOrQueued = downloadQueue.some(t => t.status === 'queued' || t.status === 'downloading' || t.status === 'paused');
      if (!hasActiveOrQueued) {
        showToast('Enter a bundle identifier or add apps to the queue first', 'warning');
        return;
      }
      isQueueRunning = !isQueueRunning;
      if (isQueueRunning) {
        showToast('Starting queue download', 'success');
        processQueue();
      } else {
        showToast('Queue paused', 'info');
      }
      renderQueue();
      updateDownloadButtonText();
      return;
    }

    const versionId = $('#input-dl-ver').value.trim();
    const outputDir = $('#input-dl-output').value.trim();
    const purchase = $('#check-purchase').checked;

    // Check if this app version is already in the download queue
    const targetVersion = versionId ? String(versionId).trim() : '';
    const isDuplicate = downloadQueue.some(t => 
      t.bundleId.toLowerCase() === bundleId.toLowerCase() && 
      (t.versionId ? String(t.versionId).trim() : '') === targetVersion
    );
    if (isDuplicate) {
      showToast(`"${selectedAppName || bundleId}" (version: ${versionId || 'latest'}) is already in the download list`, 'warning');
      return;
    }

    const taskId = `dl-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const appName = selectedAppName || bundleId;
    const appIcon = selectedAppArtworkUrl || 'icon.ico';

    showToast(`Added to download queue: ${appName}`, 'success');

    const newTask = {
      id: taskId,
      bundleId,
      versionId: versionId || null,
      appName,
      appIcon,
      purchase,
      outputDir: outputDir || lastDownloadPath || '',
      status: 'queued',
      progress: 0,
      output: 'Waiting in queue...',
      filePath: null,
      error: null,
      addedTime: Date.now()
    };

    downloadQueue.push(newTask);
    
    // Clear inputs and artwork after successful queue add
    $('#input-dl-bundle').value = '';
    $('#input-dl-ver').value = '';
    selectedAppName = '';
    selectedAppArtworkUrl = '';
    updateFormAppIcon();

    // Refresh UI
    renderQueue();
    updateDownloadButtonText();
    
    // Trigger scheduler
    processQueue();
  });

  // Listen to input changes on bundle ID field to instantly update button text and clear metadata
  $('#input-dl-bundle').addEventListener('input', () => {
    selectedAppArtworkUrl = '';
    selectedAppName = '';
    updateFormAppIcon();
    updateDownloadButtonText();
  });

  // Clear completed downloads action
  $('#btn-clear-completed').addEventListener('click', () => {
    const activeTasks = downloadQueue.filter(t => t.status === 'downloading' || t.status === 'queued');
    downloadQueue.length = 0;
    downloadQueue.push(...activeTasks);
    renderQueue();
    updateDownloadButtonText();
    processQueue();
    showToast('Completed and failed downloads cleared from queue list', 'info');
  });

  $('#btn-dl-browse').addEventListener('click', async () => {
    const result = await api.selectDirectory();
    if (result && result.path) {
      $('#input-dl-output').value = result.path;
    }
  });



  /* ═══════════════════════════════════════════
     VERSIONS
     ═══════════════════════════════════════════ */
  $('#btn-versions').addEventListener('click', async () => {
    const btn = $('#btn-versions');
    const bundleId = $('#input-ver-bundle').value.trim();
    if (!bundleId) {
      showToast('Enter a bundle identifier', 'warning');
      return;
    }

    currentVersionsSessionId++;
    api.cancelVersionDetails();

    setLoading(btn, true);

    try {
      const result = await api.listVersions({ bundleId });
      if (result && result.success) {
        const data = tryParseOutput(result.output);
        renderVersions(data);
      } else {
        showToast(parseErrorMessage(result), 'error');
      }
    } catch (err) {
      showToast('Failed to list versions: ' + (err.message || err), 'error');
    }
    setLoading(btn, false);
  });

  // Also trigger on Enter
  $('#input-ver-bundle').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btn-versions').click();
  });

  function renderVersions(data) {
    const mySessionId = currentVersionsSessionId;
    versionsTbody.innerHTML = '';
    const btnLoadAll = $('#btn-versions-load-all');

    let versions = [];
    if (Array.isArray(data)) {
      for (const item of data) {
        if (Array.isArray(item)) versions.push(...item);
        else if (item && typeof item === 'object') {
          const arrField = Object.values(item).find(v => Array.isArray(v));
          if (arrField) versions.push(...arrField);
          else versions.push(item);
        }
      }
    } else if (data && typeof data === 'object') {
      const arrField = Object.values(data).find(v => Array.isArray(v));
      if (arrField) versions = arrField;
      else versions = [data];
    }

    // Reverse list to show the latest versions first
    versions.reverse();

    if (versions.length === 0) {
      versionsTableWrapper.classList.add('hidden');
      versionsEmpty.classList.remove('hidden');
      $('#versions-empty .empty-state__title').textContent = 'No Versions Found';
      if (btnLoadAll) btnLoadAll.classList.add('hidden');
      return;
    }

    versionsEmpty.classList.add('hidden');
    versionsTableWrapper.classList.remove('hidden');
    if (btnLoadAll) btnLoadAll.classList.remove('hidden');

    const pendingLoads = [];

    versions.forEach((v, i) => {
      let externalId = '—';

      if (v && typeof v === 'object') {
        externalId = v.externalVersionId || v.ExternalVersionId || v.id || v.ID || '—';
      } else if (typeof v === 'string' || typeof v === 'number') {
        externalId = String(v);
      }

      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.title = 'Click to use this Version ID for download';

      const tdNum = document.createElement('td');
      tdNum.textContent = i + 1;

      const tdVer = document.createElement('td');
      tdVer.innerHTML = `<span style="color:var(--text-muted)">—</span>`;

      const tdId = document.createElement('td');
      tdId.style.fontFamily = "'Cascadia Code', 'Consolas', monospace";
      tdId.style.fontSize = '12px';
      tdId.style.color = 'var(--accent-text)';
      tdId.textContent = externalId;

      const tdDate = document.createElement('td');
      tdDate.innerHTML = `<span style="color:var(--text-muted)">—</span>`;

      const tdActions = document.createElement('td');
      
      const btnLoad = document.createElement('button');
      btnLoad.className = 'btn btn--xs btn--outline';
      btnLoad.textContent = 'Load Details';
      btnLoad.style.marginRight = '8px';

      const btnSelect = document.createElement('button');
      btnSelect.className = 'btn btn--xs';
      btnSelect.textContent = 'Select';

      tdActions.appendChild(btnLoad);
      tdActions.appendChild(btnSelect);

      tr.appendChild(tdNum);
      tr.appendChild(tdVer);
      tr.appendChild(tdId);
      tr.appendChild(tdDate);
      tr.appendChild(tdActions);

      const selectVersion = async () => {
        const bundleId = $('#input-ver-bundle').value.trim();
        if (!bundleId) {
          showToast('No bundle identifier found', 'warning');
          return;
        }

        const settings = await api.getSettings();
        const outputDir = settings?.outputDir || lastDownloadPath || '';
        const purchase = $('#check-purchase') ? $('#check-purchase').checked : true;

        const taskId = `dl-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const appName = selectedAppName || bundleId;
        const appIcon = selectedAppArtworkUrl || 'icon.ico';
        const versionId = externalId;

        // Check if this app version is already in the download queue
        const targetVersion = versionId ? String(versionId).trim() : '';
        const isDuplicate = downloadQueue.some(t => 
          t.bundleId.toLowerCase() === bundleId.toLowerCase() && 
          (t.versionId ? String(t.versionId).trim() : '') === targetVersion
        );
        if (isDuplicate) {
          showToast(`"${appName}" (version: ${versionId || 'latest'}) is already in the download list`, 'warning');
          return;
        }

        const newTask = {
          id: taskId,
          bundleId,
          versionId: versionId || null,
          appName,
          appIcon,
          purchase,
          outputDir: outputDir || '',
          status: 'queued',
          progress: 0,
          output: 'Waiting in queue...',
          filePath: null,
          error: null,
          addedTime: Date.now()
        };

        showToast(`Added to download queue: ${appName} (version: ${versionId})`, 'success');

        downloadQueue.push(newTask);
        renderQueue();
        updateDownloadButtonText();
        processQueue();
      };

      const loadDetails = async () => {
        if (mySessionId !== currentVersionsSessionId) return;
        if (btnLoad.disabled) return;
        btnLoad.disabled = true;
        btnLoad.textContent = 'Loading...';
        tdVer.innerHTML = `<span class="btn-loader" style="display:inline-block; vertical-align: middle;"></span>`;

        try {
          const bundleId = $('#input-ver-bundle').value.trim();
          const result = await api.getVersionMetadata({ bundleId, versionId: externalId });
          if (mySessionId !== currentVersionsSessionId) return;
          if (result && result.success) {
            const meta = tryParseOutput(result.output);
            let displayVer = '—';
            let releaseDateStr = '—';

            if (meta) {
              displayVer = meta.displayVersion || meta.DisplayVersion || '—';
              const dateRaw = meta.releaseDate || meta.ReleaseDate;
              if (dateRaw) {
                const d = new Date(dateRaw);
                if (!isNaN(d.getTime())) {
                  releaseDateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                } else {
                  releaseDateStr = String(dateRaw).split('T')[0];
                }
              }
            }

            tdVer.innerHTML = `<strong>v${escapeHtml(String(displayVer))}</strong>`;
            tdDate.textContent = releaseDateStr;
            btnLoad.textContent = 'Loaded';
            btnLoad.className = 'btn btn--xs btn--success';
          } else {
            showToast('Failed to load metadata: ' + parseErrorMessage(result), 'error');
            btnLoad.disabled = false;
            btnLoad.textContent = 'Retry';
            tdVer.innerHTML = `<span style="color:var(--danger)">Error</span>`;
          }
        } catch (err) {
          if (mySessionId !== currentVersionsSessionId) return;
          showToast('Failed to load metadata: ' + (err.message || err), 'error');
          btnLoad.disabled = false;
          btnLoad.textContent = 'Retry';
          tdVer.innerHTML = `<span style="color:var(--danger)">Error</span>`;
        }
      };

      pendingLoads.push({
        btn: btnLoad,
        fn: loadDetails
      });

      tr.addEventListener('click', () => {
        loadDetails();
      });

      btnSelect.addEventListener('click', (e) => {
        e.stopPropagation();
        selectVersion();
      });

      btnLoad.addEventListener('click', (e) => {
        e.stopPropagation();
        loadDetails();
      });

      versionsTbody.appendChild(tr);
    });

    // Wire up "Load All Details" button sequentially in a concurrency pool of 5 with 30 & 100 loaded items threshold prompts
    if (btnLoadAll) {
      const newBtnLoadAll = btnLoadAll.cloneNode(true);
      btnLoadAll.parentNode.replaceChild(newBtnLoadAll, btnLoadAll);
      
      let isBulkLoading = false;
      let stopBulkLoading = false;

      newBtnLoadAll.addEventListener('click', async () => {
        if (isBulkLoading) {
          stopBulkLoading = true;
          newBtnLoadAll.disabled = true;
          $('.btn-text', newBtnLoadAll).textContent = 'Stopping...';
          return;
        }

        // Filter out already loaded items
        const itemsToLoad = pendingLoads.filter(item => !(item.btn.disabled && item.btn.textContent === 'Loaded'));
        if (itemsToLoad.length === 0) {
          showToast('All details are already loaded', 'info');
          return;
        }

        isBulkLoading = true;
        stopBulkLoading = false;
        newBtnLoadAll.classList.remove('btn--outline');
        newBtnLoadAll.classList.add('btn--danger');
        $('.btn-text', newBtnLoadAll).textContent = 'Stop Load Details';
        $('.btn-loader', newBtnLoadAll).classList.remove('hidden');
        
        let loadedCount = 0;
        let index = 0;
        let activeRequests = 0;
        
        const worker = async () => {
          while (index < itemsToLoad.length && !stopBulkLoading && mySessionId === currentVersionsSessionId) {
            const currentItem = itemsToLoad[index++];
            if (currentItem) {
              activeRequests++;
              try {
                if (mySessionId === currentVersionsSessionId && !stopBulkLoading) {
                  await currentItem.fn();
                  loadedCount++;
                }
              } catch (_) {}
              activeRequests--;
            }
          }
        };


        const concurrency = 5;
        const workers = Array.from({ length: Math.min(concurrency, itemsToLoad.length) }, worker);
        await Promise.all(workers);
        
        // Reset button state
        isBulkLoading = false;
        stopBulkLoading = false;
        newBtnLoadAll.disabled = false;
        newBtnLoadAll.classList.remove('btn--danger');
        newBtnLoadAll.classList.add('btn--outline');
        $('.btn-text', newBtnLoadAll).textContent = 'Load All Details';
        $('.btn-loader', newBtnLoadAll).classList.add('hidden');
      });
    }
  }

  /* ═══════════════════════════════════════════
     SETTINGS
     ═══════════════════════════════════════════ */
  async function loadSettings() {
    try {
      const settings = await api.getSettings();
      if (settings) {
        if (settings.outputDir) {
          $('#input-set-output').value = settings.outputDir;
          $('#input-dl-output').value = settings.outputDir; // pre-fill download page too
        }
        if (settings.country) {
          $('#input-set-country').value = settings.country;
        }
        if (settings.concurrentDownloads) {
          $('#select-set-concurrent').value = String(settings.concurrentDownloads);
          concurrentDownloadsLimit = parseInt(settings.concurrentDownloads, 10);
        }
      }
    } catch {
      // ignore
    }
  }

  $('#btn-set-browse').addEventListener('click', async () => {
    const result = await api.selectDirectory();
    if (result && result.path) {
      $('#input-set-output').value = result.path;
    }
  });

  $('#btn-set-save').addEventListener('click', async () => {
    const btn = $('#btn-set-save');
    setLoading(btn, true);
    try {
      const settings = {
        outputDir: $('#input-set-output').value.trim(),
        country: $('#input-set-country').value.trim().toUpperCase(),
        concurrentDownloads: parseInt($('#select-set-concurrent').value, 10),
      };
      await api.saveSettings(settings);
      concurrentDownloadsLimit = settings.concurrentDownloads;
      showToast('Settings saved!', 'success');
      // Sync download page
      if (settings.outputDir) $('#input-dl-output').value = settings.outputDir;
      // Trigger processQueue in case concurrency limit was increased
      processQueue();
    } catch (err) {
      showToast('Failed to save: ' + (err.message || err), 'error');
    }
    setLoading(btn, false);
  });

  // Re-download binary
  $('#btn-set-redownload').addEventListener('click', () => {
    startSetup();
  });

  // Clean temp files
  $('#btn-set-clean-temp').addEventListener('click', async () => {
    const btn = $('#btn-set-clean-temp');
    setLoading(btn, true);
    try {
      const result = await api.cleanTempFiles();
      if (result && result.success) {
        if (result.deletedCount > 0) {
          showToast(`Successfully cleaned up ${result.deletedCount} temporary file(s).`, 'success');
        } else {
          showToast('No temporary files found to clean up.', 'info');
        }
      } else {
        showToast('Clean up failed: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      showToast('Clean up failed: ' + (err.message || err), 'error');
    }
    setLoading(btn, false);
  });

  // Reset login info / Sign out
  $('#btn-set-reset-auth').addEventListener('click', async () => {
    const btn = $('#btn-set-reset-auth');
    setLoading(btn, true);
    try {
      const result = await api.authRevoke();
      if (result && result.success) {
        showToast('Login information has been reset. Signed out successfully.', 'success');
        isAuthenticated = false;
        statusAuth.textContent = 'Not signed in';
        dotAuth.classList.remove('ok');
        dotAuth.classList.add('warn');
        showAuthLoggedOut();
        // Clear form
        $('#input-email').value = '';
        $('#input-password').value = '';
        $('#input-2fa').value = '';
      } else {
        showToast(parseErrorMessage(result), 'error');
      }
    } catch (err) {
      showToast('Reset failed: ' + (err.message || err), 'error');
    }
    setLoading(btn, false);
  });

  // Update IPATool CLI
  $('#btn-set-update-cli').addEventListener('click', async () => {
    const btn = $('#btn-set-update-cli');
    const statusEl = $('#cli-update-status');
    setLoading(btn, true);
    
    showToast(`Starting IPATool CLI update to ${latestCliVersion}...`, 'info');
    
    // Open setup overlay to stream download logs
    setupOverlay.classList.add('visible');
    clearLog(setupLog);
    setupFooter.classList.add('hidden');
    setupSpinner.style.display = '';

    // Listen for download progress
    api.onDownloadLog((message) => {
      appendLog(setupLog, message);
    });

    try {
      const cleanTag = latestCliVersion.replace('v', '').trim();
      const result = await api.downloadBinary({ version: cleanTag });
      setupSpinner.style.display = 'none';
      
      if (result && result.success) {
        binaryReady = true;
        statusBinary.textContent = 'Installed';
        dotBinary.classList.remove('err');
        dotBinary.classList.add('ok');
        appendLog(setupLog, `\n✅ IPATool CLI successfully updated to ${latestCliVersion}!`);
        setupFooter.classList.remove('hidden');
        
        // Refresh version display
        await checkCliUpdates();
      } else {
        appendLog(setupLog, '\n❌ Update failed: ' + (result?.error || 'Unknown error'));
        setupFooter.classList.remove('hidden');
        setupFooter.querySelector('.setup-success').textContent = '❌ Update failed.';
      }
    } catch (err) {
      setupSpinner.style.display = 'none';
      appendLog(setupLog, '\n❌ Error: ' + (err.message || err));
      setupFooter.classList.remove('hidden');
      setupFooter.querySelector('.setup-success').textContent = '❌ Update failed.';
    } finally {
      api.removeAllListeners('download-log');
      setLoading(btn, false);
    }
  });

  // GUI update check click handler
  $('#btn-set-check-update').addEventListener('click', async () => {
    const btn = $('#btn-set-check-update');
    const statusEl = $('#gui-update-status');
    setLoading(btn, true);
    statusEl.style.display = 'none';
    
    try {
      const res = await api.checkGuiUpdate();
      if (res && res.success) {
        $('#gui-version-text').textContent = `Current Version: ${res.localVersion}`;
        if (res.hasUpdate) {
          statusEl.style.color = 'var(--warning)';
          statusEl.innerHTML = `A new version (${res.latestVersion}) is available! <button class="btn btn--primary btn--sm" id="btn-gui-silent-update" style="margin-left: 10px; padding: 4px 10px; font-size: 12px; cursor: pointer;">⚡ Update Now</button>`;
          statusEl.style.display = 'block';
          
          $('#btn-gui-silent-update').addEventListener('click', async () => {
            if (!res.downloadUrl) {
              showToast('Direct download URL not found. Opening browser instead...', 'info');
              api.openExternal({ url: res.releaseUrl });
              return;
            }
            
            const confirm = await showConfirmDialog('Update Application', `Do you want to download and install the new GUI update (${res.latestVersion}) now? The app will restart automatically.`);
            if (!confirm) return;
            
            const btnSilent = $('#btn-gui-silent-update');
            btnSilent.disabled = true;
            btnSilent.textContent = 'Downloading (0%)...';
            
            api.onGuiUpdateProgress((percentage) => {
              btnSilent.textContent = `Downloading (${percentage}%)...`;
            });
            
            try {
              showToast('Downloading GUI update in the background...', 'info');
              const result = await api.downloadGuiUpdate({ url: res.downloadUrl });
              if (result && result.success) {
                btnSilent.textContent = 'Installing...';
                showToast('Installation started! The application is restarting...', 'success');
              } else {
                showToast('Update failed: ' + (result?.error || 'Unknown error'), 'error');
                btnSilent.disabled = false;
                btnSilent.textContent = '⚡ Update Now';
              }
            } catch (err) {
              showToast('Update failed: ' + (err.message || err), 'error');
              btnSilent.disabled = false;
              btnSilent.textContent = '⚡ Update Now';
            } finally {
              api.removeAllListeners('gui-update-progress');
            }
          });
          
          showToast(`A new GUI version is available: ${res.latestVersion}`, 'warning');
        } else {
          statusEl.style.color = 'var(--success)';
          statusEl.textContent = `Your app is up to date! (${res.localVersion})`;
          statusEl.style.display = 'block';
          showToast('Your app is up to date!', 'success');
        }
      } else {
        showToast('Update check failed: ' + (res?.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      showToast('Update check failed: ' + (err.message || err), 'error');
    }
    setLoading(btn, false);
  });

  async function checkGuiUpdatesAtStartup() {
    try {
      const res = await api.checkGuiUpdate();
      if (res && res.success) {
        $('#gui-version-text').textContent = `Current Version: ${res.localVersion}`;
        if (res.hasUpdate) {
          showToast(`A new GUI version is available (${res.latestVersion})! Check Settings to update.`, 'warning');
          
          // Pre-fill update status if settings page is opened
          const statusEl = $('#gui-update-status');
          if (statusEl) {
            statusEl.style.color = 'var(--warning)';
            statusEl.innerHTML = `A new version (${res.latestVersion}) is available! <button class="btn btn--primary btn--sm" id="btn-gui-silent-update" style="margin-left: 10px; padding: 4px 10px; font-size: 12px; cursor: pointer;">⚡ Update Now</button>`;
            statusEl.style.display = 'block';
            
            $('#btn-gui-silent-update').addEventListener('click', async () => {
              if (!res.downloadUrl) {
                api.openExternal({ url: res.releaseUrl });
                return;
              }
              const confirm = await showConfirmDialog('Update Application', `Do you want to download and install the new GUI update (${res.latestVersion}) now? The app will restart automatically.`);
              if (!confirm) return;
              
              const btnSilent = $('#btn-gui-silent-update');
              btnSilent.disabled = true;
              btnSilent.textContent = 'Downloading (0%)...';
              
              api.onGuiUpdateProgress((percentage) => {
                btnSilent.textContent = `Downloading (${percentage}%)...`;
              });
              
              try {
                showToast('Downloading GUI update in the background...', 'info');
                const result = await api.downloadGuiUpdate({ url: res.downloadUrl });
                if (result && result.success) {
                  btnSilent.textContent = 'Installing...';
                  showToast('Installation started! The application is restarting...', 'success');
                } else {
                  showToast('Update failed: ' + (result?.error || 'Unknown error'), 'error');
                  btnSilent.disabled = false;
                  btnSilent.textContent = '⚡ Update Now';
                }
              } catch (err) {
                showToast('Update failed: ' + (err.message || err), 'error');
                btnSilent.disabled = false;
                btnSilent.textContent = '⚡ Update Now';
              } finally {
                api.removeAllListeners('gui-update-progress');
              }
            });
          }
        }
      }
    } catch (_) {}
  }

  /* ═══════════════════════════════════════════
     ERROR PARSING
     ═══════════════════════════════════════════ */
  function parseErrorMessage(result) {
    if (!result) return 'Unknown error';
    
    // Check output first since CLI errors will print details to stdout/stderr
    if (result.output) {
      const data = tryParseOutput(result.output);
      if (data && typeof data === 'object') {
        return data.error || data.message || data.Message || result.output;
      }
      // Strip ANSI escape codes
      const cleaned = result.output.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
      if (cleaned) return cleaned;
    }
    
    if (result.error) return result.error;
    return 'Operation failed';
  }

  /* ═══════════════════════════════════════════
     LOGS
     ═══════════════════════════════════════════ */
  $('#btn-logs-clear').addEventListener('click', () => {
    errorLogs.length = 0;
    logsBody.innerHTML = '<div class="log-empty" id="logs-empty" style="color: var(--text-muted); text-align: center; margin-top: 150px;">No error logs recorded.</div>';
    showToast('Logs cleared', 'success');
  });

  $('#btn-logs-copy').addEventListener('click', () => {
    if (errorLogs.length === 0) {
      showToast('No logs to copy', 'warning');
      return;
    }
    const logText = errorLogs.join('\n');
    navigator.clipboard.writeText(logText).then(() => {
      showToast('Logs copied to clipboard', 'success');
    }).catch(err => {
      showToast('Failed to copy logs: ' + err, 'error');
    });
  });

  /* ═══════════════════════════════════════════
     THEME TOGGLE
     ═══════════════════════════════════════════ */
  function initTheme() {
    let savedTheme = localStorage.getItem('theme');
    if (!savedTheme) {
      savedTheme = 'light';
      localStorage.setItem('theme', 'light');
    }
    const isLight = savedTheme === 'light';
    if (isLight) {
      document.body.classList.add('light-theme');
      $('#theme-toggle-icon').textContent = '🌙';
      $('#theme-toggle-label').textContent = 'Dark Mode';
    } else {
      document.body.classList.remove('light-theme');
      $('#theme-toggle-icon').textContent = '☀️';
      $('#theme-toggle-label').textContent = 'Light Mode';
    }
  }

  $('#btn-toggle-theme').addEventListener('click', () => {
    const isLightNow = document.body.classList.toggle('light-theme');
    if (isLightNow) {
      localStorage.setItem('theme', 'light');
      $('#theme-toggle-icon').textContent = '🌙';
      $('#theme-toggle-label').textContent = 'Dark Mode';
      showToast('Switched to Light Mode', 'info');
    } else {
      localStorage.setItem('theme', 'dark');
      $('#theme-toggle-icon').textContent = '☀️';
      $('#theme-toggle-label').textContent = 'Light Mode';
      showToast('Switched to Dark Mode', 'info');
    }
  });

  /* ═══════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════ */
  initTheme();
  initApp();
})();
