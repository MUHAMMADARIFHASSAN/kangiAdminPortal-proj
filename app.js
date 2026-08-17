/* ============================================================
   app.js — Kangi NFT QR Manager
   Full flow: Login → Dashboard → Create NFT → Manage QRs → Redeem
   All data operations go through service.js → PlayFab CloudScript
   ============================================================ */
(function () {
  'use strict';

  /* ─── DOM shorthand ─── */
  const $ = (id) => document.getElementById(id);

  /* ─── Element refs ─── */
  const el = {
    /* Auth */
    loginView:      $('loginView'),
    loginForm:      $('loginForm'),
    loginEmail:     $('loginUsername'),
    loginPass:      $('loginPassword'),
    loginBtn:       $('loginBtn'),
    loginAlert:     $('loginAlert'),

    /* Shell */
    appView:        $('appView'),
    logoutBtn:      $('logoutBtn'),
    pageTitle:      $('pageTitle'),
    pageSub:        $('pageSubtitle'),
    sidebarUser:    $('sidebarUsername'),
    userAvatar:     $('userAvatar'),
    themeToggle:    $('themeToggle'),
    iconMoon:       $('iconMoon'),
    iconSun:        $('iconSun'),
    refreshBtn:     $('refreshBtn'),
    menuToggleBtn:  $('menuToggleBtn'),
    sidebarOverlay: $('sidebarOverlay'),

    /* Settings */
    settingsView:        $('settingsView'),
    settingsUser:        $('settingsUser'),
    settingsEmail:       $('settingsEmail'),
    settingsAvatar:      $('settingsAvatar'),
    settingsThemeToggle: $('settingsThemeToggle'),
    settingsRefreshBtn:  $('settingsRefreshBtn'),

    /* Dashboard */
    statNfts:       $('statNfts'),
    statCodes:      $('statCodes'),
    statRedeemed:   $('statRedeemed'),
    recentList:     $('recentNftsList'),

    /* Create */
    createAlert:    $('createAlert'),
    nftForm:        $('nftForm'),
    nftCharacter:   $('nftCharacter'),
    nftName:        $('nftName'),
    nftCount:       $('nftCount'),
    nftImage:       $('nftImage'),
    nftDesc:        $('nftDesc'),
    createBtn:      $('createNftBtn'),
    fileDrop:       $('fileDrop'),
    fileDropInner:  $('fileDropInner'),
    filePreview:    $('filePreview'),
    filePreviewWrap:$('filePreviewWrap'),
    filePreviewName:$('filePreviewName'),

    /* Manage */
    nftLibrary:     $('nftLibrary'),
    clearAllBtn:    $('clearAllBtn'),

    /* Redeem */
    redeemAlert:    $('redeemAlert'),
    redeemToken:    $('redeemToken'),
    redeemBtn:      $('redeemBtn'),
    redeemResult:   $('redeemResult'),

    /* Sounds */
    soundsLibrary:  $('soundsLibrary'),
    btnFilterAllSongs: $('btnFilterAllSongs'),
    btnFilterPendingSongs: $('btnFilterPendingSongs'),
    btnFilterApprovedSongs: $('btnFilterApprovedSongs'),
    soundsAlert:    $('soundsAlert'),

    /* User Management */
    usersAlert:         $('usersAlert'),
    usersList:          $('usersList'),
    loadUsersBtn:       $('loadUsersBtn'),
    userSearchInput:    $('userSearchInput'),
    clearSearchBtn:     $('clearSearchBtn'),
    userSearchStats:    $('userSearchStats'),
    /* User Details Modal */
    userDetailsModal:   $('userDetailsModal'),
    closeUserModal:     $('closeUserModal'),
    userDetailsBody:    $('userDetailsBody'),
    userDetailsFooter:  $('userDetailsFooter'),
    userModalActionsBar:$('userModalActionsBar'),
    modalMakeAdminBtn:  $('modalMakeAdminBtn'),
    modalRevokeAdminBtn:$('modalRevokeAdminBtn'),
    modalUnbanBtn:      $('modalUnbanBtn'),
    modalNotifInput:    $('modalNotifInput'),
    modalSendNotifBtn:  $('modalSendNotifBtn'),
    modalActionAlert:   $('modalActionAlert'),
    /* Ban Duration Modal (kept for legacy, no longer used for ban flow) */
    banDurationModal:   $('banDurationModal'),
    closeBanModal:      $('closeBanModal'),
    cancelBanBtn:       $('cancelBanBtn'),
    banUserName:        $('banUserName')
  };

  /* ─── App state ─── */
  const state = { 
    nfts: [], 
    songs: [], 
    songFilter: 'all',
    allUsers: [],
    filteredUsers: [],
    selectedUser: null,
    banTarget: null
  };

  /* ─── View metadata ─── */
  const VIEWS = {
    dashboard: { title: 'Dashboard',  sub: 'Overview of your TCG collection and activity' },
    create:    { title: 'Create TCG QR', sub: 'Upload a TCG image and generate unique QR codes' },
    manage:    { title: 'Manage QRs', sub: 'Browse all TCG batches, download QRs and copy redeem links' },
    sounds:    { title: 'Sounds Library', sub: 'Approve or delete audio files submitted to the server' },
    redeem:    { title: 'Redeem',     sub: 'Verify and process a one-time QR code redemption' },
    users:     { title: 'User Management', sub: 'Grant or revoke administrator access for platform users' },
    messages:  { title: 'User Messages', sub: 'Support messages sent by players from the app' },
    settings:  { title: 'Settings & Account', sub: 'Manage administrator profile, application settings, and account session' }
  };

  /* ================================================================
     BOOT
     ================================================================ */
  function boot() {
    KangiService.init();
    _applyTheme(localStorage.getItem('kangi_theme') || 'dark');
    _bindLogin();
    _bindLogout();
    _bindNav();
    _bindCreate();
    _bindFileDrop();
    _bindSounds();
    _bindRedeem();
    _bindClearAll();
    _bindRefresh();
    _bindMenuToggle();
    _bindTheme();
    _bindSettings();
    _bindUserManagement();
    _bindUserSearch();
    _bindUserModals();
    _bindMessages();
  }

  /* ================================================================
     AUTH — Login with PlayFab Email + Password + isAdmin check
     ================================================================ */
  function _bindLogin() {
    /* Set email type & clear any prefilled values */
    el.loginEmail.type        = 'email';
    el.loginEmail.placeholder = 'Enter your email address';
    el.loginEmail.value       = '';
    el.loginPass.value        = '';

    /* Remove hint if present */
    const hint = el.loginView.querySelector('.auth-hint');
    if (hint) hint.remove();

    el.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email    = el.loginEmail.value.trim();
      const password = el.loginPass.value;

      if (!email || !password) {
        return _alert(el.loginAlert, 'error', 'Please enter your email and password.');
      }

      _setLoading(el.loginBtn, true);
      _hideEl(el.loginAlert);

      try {
        const res = await KangiService.login(email, password);
        _onLoginSuccess(res);
      } catch (msg) {
        _alert(el.loginAlert, 'error', msg);
      } finally {
        _setLoading(el.loginBtn, false);
      }
    });
  }

  function _onLoginSuccess(res) {
    const name = res.displayName || res.email.split('@')[0];
    el.sidebarUser.textContent = name;
    if (el.userAvatar) el.userAvatar.textContent = name.charAt(0).toUpperCase();

    if (el.settingsUser) el.settingsUser.textContent = name;
    if (el.settingsEmail) el.settingsEmail.textContent = res.email || 'admin@kangi.app';
    if (el.settingsAvatar) el.settingsAvatar.textContent = name.charAt(0).toUpperCase();

    el.loginView.classList.add('hidden');
    el.appView.classList.remove('hidden');

    _switchView('dashboard');
    _loadAllData();
    _checkHashRedeem();

    /* Register this admin in the shared user registry (fire-and-forget) */
    KangiService.registerUser().catch(() => {});
  }

  /* ================================================================
     LOGOUT
     ================================================================ */
  function _bindLogout() {
    document.querySelectorAll('#logoutBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Are you sure you want to sign out of your admin session?')) return;
        KangiService.logout();
        state.nfts  = [];
        state.songs = [];
        el.appView.classList.add('hidden');
        el.loginView.classList.remove('hidden');
        el.loginEmail.value = '';
        el.loginPass.value  = '';
        _hideEl(el.loginAlert);
        location.hash = '';
      });
    });
  }

  /* ================================================================
     SETTINGS
     ================================================================ */
  function _bindSettings() {
    if (el.settingsThemeToggle) {
      el.settingsThemeToggle.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'dark';
        _applyTheme(cur === 'dark' ? 'light' : 'dark');
      });
    }
    if (el.settingsRefreshBtn) {
      el.settingsRefreshBtn.addEventListener('click', async () => {
        el.settingsRefreshBtn.disabled = true;
        el.settingsRefreshBtn.textContent = 'Syncing...';
        await _loadAllData();
        await _loadSongsData();
        el.settingsRefreshBtn.disabled = false;
        el.settingsRefreshBtn.textContent = 'Refresh Data';
      });
    }

    /* ── Cloudinary config — load saved values on page init ── */
    const cloudNameInput  = $('cloudinaryCloudName');
    const presetInput     = $('cloudinaryUploadPreset');
    const saveBtn         = $('saveCloudinaryBtn');
    const cloudAlert      = $('cloudinaryAlert');

    if (cloudNameInput && presetInput) {
      // Pre-fill with saved config
      const saved = KangiService.getCloudinaryConfig();
      if (saved) {
        cloudNameInput.value = saved.cloudName;
        presetInput.value    = saved.uploadPreset;
      }

      saveBtn?.addEventListener('click', () => {
        const cloudName    = cloudNameInput.value.trim();
        const uploadPreset = presetInput.value.trim();

        if (!cloudName || !uploadPreset) {
          _alert(cloudAlert, 'error', 'Both Cloud Name and Upload Preset are required.');
          return;
        }

        KangiService.saveCloudinaryConfig(cloudName, uploadPreset);
        _alert(cloudAlert, 'success', '✓ Cloudinary settings saved.');
        setTimeout(() => cloudAlert.classList.add('hidden'), 3000);
      });

      // Reset to built-in defaults
      $('resetCloudinaryBtn')?.addEventListener('click', () => {
        localStorage.removeItem('kangi_cloudinary_config');
        cloudNameInput.value = '';
        presetInput.value    = '';
        _alert(cloudAlert, 'success', '✓ Reset to default credentials (djgvzbxvt / Community_Feed).');
        setTimeout(() => cloudAlert.classList.add('hidden'), 3000);
      });
    }
  }

  /* ================================================================
     NAVIGATION
     ================================================================ */
  function _bindNav() {
    document.querySelectorAll('[data-view]').forEach(btn =>
      btn.addEventListener('click', () => _switchView(btn.dataset.view))
    );
    /* Quick action tiles on dashboard */
    document.querySelectorAll('[data-nav]').forEach(btn =>
      btn.addEventListener('click', () => _switchView(btn.dataset.nav))
    );
  }

  // ------------------------------------------------
  // MENU TOGGLE – mobile sidebar open/close
  // ------------------------------------------------
  function _bindMenuToggle() {
    const sidebar = $('sidebar');
    const overlay = el.sidebarOverlay || $('sidebarOverlay');

    function toggleMenu(e) {
      if (e) e.stopPropagation();
      const isOpen = sidebar ? sidebar.classList.toggle('open') : false;
      if (overlay) overlay.classList.toggle('open', isOpen);
      if (el.menuToggleBtn) {
        el.menuToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }
    }

    function closeMenu() {
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
      if (el.menuToggleBtn) {
        el.menuToggleBtn.setAttribute('aria-expanded', 'false');
      }
    }

    if (el.menuToggleBtn) {
      el.menuToggleBtn.addEventListener('click', toggleMenu);
    }
    if (overlay) {
      overlay.addEventListener('click', closeMenu);
    }
  }

  async function _switchView(name) {
    document.querySelectorAll('.view').forEach(v => {
      v.classList.remove('active');
      v.classList.remove('hidden');
    });
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

    /* Close mobile menu when view changes */
    const sidebar = $('sidebar');
    const overlay = el.sidebarOverlay || $('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    if (el.menuToggleBtn) el.menuToggleBtn.setAttribute('aria-expanded', 'false');

    const view = $(`${name}View`);
    if (view) {
      view.classList.remove('hidden');
      view.classList.add('active');
    }

    const navBtn = document.querySelector(`.nav-item[data-view="${name}"]`);
    if (navBtn) navBtn.classList.add('active');

    const meta = VIEWS[name] || { title: name, sub: '' };
    el.pageTitle.textContent = meta.title;
    el.pageSub.textContent   = meta.sub;

    if (name === 'sounds') {
      await _loadSongsData();
    }
    if (name === 'users') {
      await _loadUsers();
    }
    if (name === 'messages') {
      await _loadMessages();
    }
  }

  /* ================================================================
     DATA — Load from PlayFab via CloudScript
     ================================================================ */
  async function _loadAllData() {
    try {
      const res  = await KangiService.getNfts();
      state.nfts = (res && Array.isArray(res.nfts)) ? res.nfts : [];
    } catch (e) {
      console.error('[Kangi] Data load error:', e);
      state.nfts = [];
    }
    _renderAll();
  }

  function _renderAll() {
    _renderStats();
    _renderRecent();
    _renderLibrary();
  }

  /* ─── Stats ─── */
  function _renderStats() {
    const codes    = state.nfts.flatMap(n => n.codes || []);
    const redeemed = codes.filter(c => c.redeemed).length;
    _countUp(el.statNfts,     state.nfts.length);
    _countUp(el.statCodes,    codes.length);
    _countUp(el.statRedeemed, redeemed);
  }

  function _countUp(el, target) {
    const start = parseInt(el.textContent) || 0;
    if (start === target) return;
    const step = target > start ? 1 : -1;
    let cur = start;
    const timer = setInterval(() => {
      cur += step;
      el.textContent = cur;
      if (cur === target) clearInterval(timer);
    }, 40);
  }

  /* ─── Recent TCGs (dashboard) ─── */
  function _renderRecent() {
    if (!state.nfts.length) {
      el.recentList.innerHTML = _emptyHTML('No TCGs created yet');
      return;
    }
    el.recentList.innerHTML = state.nfts.slice(0, 5).map(nft => {
      const total    = (nft.codes || []).length;
      const redeemed = (nft.codes || []).filter(c => c.redeemed).length;
      const avail    = total - redeemed;
      return `
        <div class="recent-item">
          <img class="recent-thumb" src="${nft.image}" alt="${_esc(nft.name)}" />
          <div class="recent-info">
            <div class="recent-name">${_esc(nft.name)}</div>
            <div class="recent-sub">${total} QR codes · ${redeemed} redeemed</div>
          </div>
          <span class="chip ${avail > 0 ? 'chip--teal' : 'chip--red'}">${avail} left</span>
        </div>`;
    }).join('');
  }

  /* ─── TCG Library (Manage QRs) ─── */
  function _renderLibrary() {
    if (!state.nfts.length) {
      el.nftLibrary.innerHTML = `
        <div class="empty-state">
          ${_nftSvg()}
          <p>No TCGs in your library yet</p>
          <button class="btn btn-primary btn-sm" onclick="document.querySelector('[data-view=create]').click()">Create your first TCG</button>
        </div>`;
      return;
    }

    el.nftLibrary.innerHTML = '';
    state.nfts.forEach((nft, ni) => {
      const codes    = nft.codes || [];
      const redeemed = codes.filter(c => c.redeemed).length;
      const pct      = codes.length ? Math.round((redeemed / codes.length) * 100) : 0;

      const entry = document.createElement('div');
      entry.className = 'nft-entry';

      /* ── Header ── */
      const head = document.createElement('div');
      head.className = 'nft-entry-head';
      head.innerHTML = `
        <img class="nft-thumb" src="${nft.image}" alt="${_esc(nft.name)}" />
        <div class="nft-meta">
          <strong>${_esc(nft.name)}</strong>
          ${nft.description ? `<div class="nft-desc-text">${_esc(nft.description)}</div>` : ''}
          <div class="nft-meta-row">
            <span class="chip chip--purple">${codes.length} QR codes</span>
            <span class="chip chip--green">${redeemed} redeemed</span>
            <span class="chip chip--teal">${codes.length - redeemed} remaining</span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar" style="width:${pct}%"></div>
          </div>
        </div>
        <svg viewBox="0 0 20 20" fill="currentColor" class="chevron" style="width:18px;height:18px;color:var(--text-3);flex-shrink:0;transition:transform .25s ease;">
          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>`;

      /* ── Body (QR rows) ── */
      const body = document.createElement('div');
      body.className = 'nft-entry-body';

      codes.forEach((code) => {
        const row = document.createElement('div');
        row.className = 'qr-row';
        row.innerHTML = `
          <div class="qr-box" id="qr-box-${_safeId(code.token)}"></div>
          <div class="qr-details">
            <div class="qr-serial">${_esc(code.serial)}</div>
            <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.35rem;">
              <span class="chip ${code.redeemed ? 'chip--red' : 'chip--green'}">
                ${code.redeemed ? '✓ Redeemed' : '● Available'}
              </span>
              ${code.redeemed && code.redeemedAt
                ? `<span class="qr-url">at ${new Date(code.redeemedAt).toLocaleString()}</span>`
                : ''}
            </div>
            <div class="qr-url" title="${_esc(code.url)}">${_esc(code.url)}</div>
            <div class="qr-actions-row">
              <button class="btn btn-ghost btn-sm" data-action="download" data-token="${code.token}">
                <svg viewBox="0 0 20 20" fill="currentColor" style="width:13px;height:13px;"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                Download QR
              </button>
              <button class="btn btn-ghost btn-sm" data-action="copy" data-url="${code.url}">
                <svg viewBox="0 0 20 20" fill="currentColor" style="width:13px;height:13px;"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/></svg>
                Copy Link
              </button>
              ${!code.redeemed ? `
              <button class="btn btn-ghost btn-sm" data-action="open-redeem" data-token="${code.token}">
                <svg viewBox="0 0 20 20" fill="currentColor" style="width:13px;height:13px;"><path fill-rule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
                Open Redeem
              </button>` : ''}
            </div>
          </div>`;
        body.appendChild(row);
      });

      entry.appendChild(head);
      entry.appendChild(body);
      el.nftLibrary.appendChild(entry);

      /* ── Accordion toggle ── */
      let qrsGenerated = false;
      head.addEventListener('click', () => {
        const isOpen = body.classList.toggle('open');
        const chev   = head.querySelector('.chevron');
        if (chev) chev.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';

        /* Generate QR codes lazily on first open */
        if (isOpen && !qrsGenerated) {
          qrsGenerated = true;
          codes.forEach(code => {
            const box = document.getElementById(`qr-box-${_safeId(code.token)}`);
            if (box && !box.querySelector('canvas, img')) {
              try {
                new QRCode(box, {
                  text:         code.url,
                  width:        110,
                  height:       110,
                  correctLevel: QRCode.CorrectLevel.H
                });
              } catch (err) {
                box.textContent = '—';
                console.warn('QR gen error:', err);
              }
            }
          });
        }
      });

      /* ── Action button delegation ── */
      body.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        e.stopPropagation();

        const action = btn.dataset.action;

        if (action === 'download') {
          const box    = document.getElementById(`qr-box-${_safeId(btn.dataset.token)}`);
          const canvas = box?.querySelector('canvas');
          if (canvas) {
            const a  = document.createElement('a');
            a.href   = canvas.toDataURL('image/png');
            a.download = `${btn.dataset.token}.png`;
            a.click();
          } else {
            alert('Please open the TCG panel first so the QR can render, then download.');
          }
        }

        if (action === 'copy') {
          try {
            await navigator.clipboard.writeText(btn.dataset.url);
            const orig = btn.innerHTML;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.innerHTML = orig; }, 1600);
          } catch {
            prompt('Copy this link:', btn.dataset.url);
          }
        }

        if (action === 'open-redeem') {
          _switchView('redeem');
          el.redeemToken.value = btn.dataset.token;
          _alert(el.redeemAlert, 'info', 'Token loaded. Click "Verify & Redeem" to process it.');
          el.redeemResult.classList.add('hidden');
        }
      });
    });
  }

  /* ================================================================
     CREATE NFT — Generate batch → PublishNft CloudScript → PlayFab
     ================================================================ */
  function _bindFileDrop() {
    if (!el.nftImage) return;

    el.nftImage.addEventListener('change', _onFileChosen);

    el.fileDrop.addEventListener('dragover', e => { e.preventDefault(); el.fileDrop.classList.add('dragover'); });
    el.fileDrop.addEventListener('dragleave', () => el.fileDrop.classList.remove('dragover'));
    el.fileDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      el.fileDrop.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        el.nftImage.files = e.dataTransfer.files; // modern browsers
        _onFileChosen();
      }
    });
  }

  function _onFileChosen() {
    const file = el.nftImage.files[0];
    if (!file) return;
    if (el.filePreviewName) {
      el.filePreviewName.textContent = file.name;
    }
  }

  function _bindCreate() {
    el.nftForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const file      = el.nftImage.files[0];
      const character = el.nftCharacter ? el.nftCharacter.value.trim() : '';
      const suffix    = el.nftName ? el.nftName.value.trim() : '';
      const name      = suffix ? `${character} — ${suffix}` : character;
      const count     = Number(el.nftCount.value);

      if (!character) return _alert(el.createAlert, 'error', 'Please select a character.');
      if (!file)      return _alert(el.createAlert, 'error', 'Please upload a TCG image.');
      if (count < 1)  return _alert(el.createAlert, 'error', 'QR quantity must be at least 1.');
      if (count > 50) return _alert(el.createAlert, 'error', 'Maximum 50 QR codes per batch.');

      // Check Cloudinary config — always has defaults so this should never block
      const cloudConfig = KangiService.getCloudinaryConfig();
      if (!cloudConfig) {
        _alert(el.createAlert, 'error',
          '⚠️ Cloudinary not configured. Go to Settings → TCG Image Storage.');
        return;
      }

      _setLoading(el.createBtn, true);

      try {
        /* 1. Upload image to Cloudinary CDN */
        _alert(el.createAlert, 'info', 'Uploading image to CDN…');
        const uploadResult = await KangiService.uploadToCloudinary(file);

        if (!uploadResult.success) {
          _alert(el.createAlert, 'error', uploadResult.error || 'Image upload failed.');
          return;
        }

        const imageUrl = uploadResult.url;

        /* 2. Build NFT object — image is a URL, not base64 */
        _alert(el.createAlert, 'info', 'Building QR batch…');
        const nftId = _uid('COL');
        const base  = location.origin + location.pathname;

        const codes = Array.from({ length: count }, (_, i) => {
          const token = _uid('QR');
          return {
            token,
            serial:     `${nftId}-${String(i + 1).padStart(4, '0')}`,
            redeemed:   false,
            redeemedAt: null,
            url:        `${base}#redeem/${token}`
          };
        });

        const nftObj = {
          id:          nftId,
          name,
          description: el.nftDesc.value.trim(),
          image:       imageUrl,           // ← CDN URL, not base64
          createdAt:   new Date().toISOString(),
          codes
        };

        /* 3. Save to PlayFab — payload is now tiny (no embedded image) */
        _alert(el.createAlert, 'info', 'Saving to database…');
        const res = await KangiService.publishNft(nftObj);

        if (res && res.success !== false) {
          _alert(el.createAlert, 'success',
            `✓ ${count} QR code${count > 1 ? 's' : ''} created for "${name}" and saved.`);

          el.nftForm.reset();
          if (el.filePreview)     el.filePreview.classList.add('hidden');
          if (el.filePreviewName) el.filePreviewName.textContent = 'No file chosen';

          await _loadAllData();
          setTimeout(() => _switchView('manage'), 900);
        } else {
          _alert(el.createAlert, 'error', (res && res.error) || 'Failed to save TCG. Please try again.');
        }

      } catch (err) {
        _alert(el.createAlert, 'error', typeof err === 'string' ? err : err.message || 'An error occurred.');
      } finally {
        _setLoading(el.createBtn, false);
      }
    });
  }

  /* ================================================================
     REDEEM — Verify token via CloudScript redeemToken action
     ================================================================ */
  function _bindRedeem() {
    el.redeemBtn.addEventListener('click', _processRedeem);

    /* Also allow pressing Enter in the token field */
    el.redeemToken.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') _processRedeem();
    });
  }

  async function _processRedeem() {
    const token = el.redeemToken.value.trim();
    if (!token) return _alert(el.redeemAlert, 'error', 'Please paste or enter a QR token.');

    _setLoading(el.redeemBtn, true);
    el.redeemResult.classList.add('hidden');
    _alert(el.redeemAlert, 'info', 'Verifying token with the server…');

    try {
      const res = await KangiService.redeemToken(token);

      if (res && res.success) {
        _alert(el.redeemAlert, 'success', '✓ QR code redeemed successfully. This token has been marked as used.');
        _showRedeemSuccess(res.nft, res.code);
        await _loadAllData(); /* refresh stats */
      } else {
        _alert(el.redeemAlert, 'error', (res && res.error) || 'Redemption failed.');
      }

    } catch (err) {
      _alert(el.redeemAlert, 'error', typeof err === 'string' ? err : err.message || 'Server error during redemption.');
    } finally {
      _setLoading(el.redeemBtn, false);
    }
  }

  function _showRedeemSuccess(nft, code) {
    el.redeemResult.innerHTML = `
      <div class="redeem-result-head">
        <img class="redeem-result-img" src="${nft.image}" alt="${_esc(nft.name)}" />
        <div>
          <strong style="font-size:0.95rem;">${_esc(nft.name)}</strong>
          <div class="nft-meta-row" style="margin-top:.4rem;">
            <span class="chip chip--red">✓ Redeemed</span>
            <span class="chip chip--purple">${_esc(code.serial)}</span>
          </div>
          ${nft.description ? `<div style="font-size:0.75rem;color:var(--text-2);margin-top:.35rem;">${_esc(nft.description)}</div>` : ''}
        </div>
      </div>
      <div class="redeem-result-body">
        <strong>Token:</strong> ${_esc(code.token)}<br/>
        <strong>Redeemed at:</strong> ${new Date(code.redeemedAt).toLocaleString()}
      </div>`;
    el.redeemResult.classList.remove('hidden');
  }

  /* ── Hash routing: #redeem/<token> ── */
  function _checkHashRedeem() {
    const hash = location.hash;
    if (hash.startsWith('#redeem/') && KangiService.session.isLoggedIn()) {
      const token = decodeURIComponent(hash.replace('#redeem/', ''));
      if (token) {
        _switchView('redeem');
        el.redeemToken.value = token;
        _processRedeem();
      }
    }
  }

  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#redeem/') && KangiService.session.isLoggedIn()) {
      _checkHashRedeem();
    }
  });

  /* ================================================================
     SOUNDS — Management of Audio Tracks
     ================================================================ */
  function _bindSounds() {
    if (!el.soundsLibrary) return;

    el.btnFilterAllSongs?.addEventListener('click', () => _setSongFilter('all'));
    el.btnFilterPendingSongs?.addEventListener('click', () => _setSongFilter('pending'));
    el.btnFilterApprovedSongs?.addEventListener('click', () => _setSongFilter('approved'));
  }

  function _setSongFilter(filter) {
    state.songFilter = filter;
    document.querySelectorAll('#soundsView .btn').forEach(btn => btn.classList.remove('active'));
    
    if (filter === 'all') el.btnFilterAllSongs?.classList.add('active');
    if (filter === 'pending') el.btnFilterPendingSongs?.classList.add('active');
    if (filter === 'approved') el.btnFilterApprovedSongs?.classList.add('active');

    _renderSongsList();
  }

  async function _loadSongsData() {
    if (!el.soundsLibrary) return;
    el.soundsLibrary.innerHTML = `
      <div class="empty-state">
        <div class="btn-loader"></div>
        <p>Loading songs from the server...</p>
      </div>`;
    try {
      const res = await KangiService.getSongs();
      state.songs = (res && Array.isArray(res.songs)) ? res.songs : 
                    ((res && res.songs) ? res.songs : []);
    } catch (e) {
      console.error('[Kangi] Songs load error:', e);
      state.songs = [];
    }
    _renderSongsList();
  }

  function _renderSongsList() {
    if (!el.soundsLibrary) return;

    let filtered = state.songs;
    if (state.songFilter === 'pending') {
      filtered = state.songs.filter(s => s.isPending === true || s.isPending === "true");
    } else if (state.songFilter === 'approved') {
      filtered = state.songs.filter(s => s.isPending === false || s.isPending === "false" || !s.isPending);
    }

    if (!filtered.length) {
      el.soundsLibrary.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 20 20" fill="currentColor" style="width:40px;height:40px;opacity:0.4;color:var(--pink);"><path fill-rule="evenodd" d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" clip-rule="evenodd"/></svg>
          <p>No songs found in this category</p>
        </div>`;
      return;
    }

    el.soundsLibrary.innerHTML = '';
    filtered.forEach(song => {
      const isPending = song.isPending === true || song.isPending === "true";
      const songId = song.SongId || song.id;
      const title = song.SongName || song.title || song.SongTitle || song.songTitle || song.Title || song.name || song.Name || "Untitled Song";
      const artist = song.Singer || song.artist || song.artistName || song.SingerName || "Unknown Artist";
      const cover = song.CoverUrl || song.cover || "";
      const songUrl = song.SongUrl || song.songLink || song.url || song.musicUrl || "";

      const row = document.createElement('div');
      row.className = 'song-item';
      row.innerHTML = `
        ${cover ? `
          <img class="song-cover" src="${_esc(cover)}" alt="Cover" data-action="preview" data-url="${_esc(songUrl)}" style="cursor:pointer;" title="Click to play/pause" />
        ` : `
          <div class="song-cover" style="display:grid;place-items:center;background:rgba(236,72,153,0.15);color:var(--pink);cursor:pointer;" data-action="preview" data-url="${_esc(songUrl)}" title="Click to play/pause">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:20px;height:20px;"><path fill-rule="evenodd" d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" clip-rule="evenodd"/></svg>
          </div>
        `}
        <div class="song-meta">
          <span class="song-title-text">${_esc(title)}</span>
          <span class="song-artist-text">${_esc(artist)}</span>
          <div style="margin-top:0.35rem;">
            <span class="chip ${isPending ? 'chip--red' : 'chip--green'}">${isPending ? 'Pending' : 'Available'}</span>
          </div>
        </div>
        
        ${songUrl ? `
          <button class="song-preview-btn" data-action="preview" data-url="${_esc(songUrl)}" title="Preview song">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>
          </button>
        ` : ''}

        <div class="song-actions">
          ${isPending ? `
            <button class="btn btn-primary btn-sm" data-action="approve" data-id="${songId}">Approve</button>
          ` : ''}
          <button class="btn btn-danger btn-sm" data-action="delete" data-id="${songId}">Delete</button>
        </div>
      `;

      el.soundsLibrary.appendChild(row);
    });
  }

  // Handle Approve/Delete/Preview actions
  document.getElementById('soundsView')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const songId = btn.dataset.id;

    if (action === 'preview') {
      const url = btn.dataset.url;
      if (!url) {
        _alert(el.soundsAlert, 'warning', 'No audio URL found for this song.');
        return;
      }
      
      let aud = document.getElementById('song-preview-player');
      if (!aud) {
        aud = document.createElement('audio');
        aud.id = 'song-preview-player';
        document.body.appendChild(aud);
      }
      
      if (aud.dataset.currentUrl === url && !aud.paused) {
        aud.pause();
        /* reset play icon */
        document.querySelectorAll('.song-preview-btn').forEach(b => {
          b.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>`;
        });
      } else {
        aud.src = url;
        aud.dataset.currentUrl = url;
        aud.currentTime = 0;
        aud.play().then(() => {
          document.querySelectorAll('.song-preview-btn').forEach(b => {
            b.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>`;
          });
          btn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`;
        }).catch((err) => {
          console.error('[Kangi Audio Error]', err);
          _alert(el.soundsAlert, 'error', 'Could not play audio. Please verify the Cloudinary link format or check your browser permissions.');
        });
      }
    }

    if (action === 'approve') {
      btn.disabled = true;
      btn.textContent = 'Approving...';
      try {
        const res = await KangiService.approveSong(songId);
        if (res && res.success) {
          const notifMsg = res.notificationSent
            ? 'Song approved — owner notified ✓'
            : 'Song approved (owner could not be notified — no uploader ID on record)';
          _alert(el.soundsAlert, 'success', notifMsg);
          await _loadSongsData();
        } else {
          _alert(el.soundsAlert, 'error', res.error || 'Failed to approve song.');
        }
      } catch (err) {
        _alert(el.soundsAlert, 'error', err);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Approve';
      }
    }

    if (action === 'delete') {
      if (!confirm('Are you sure you want to permanently delete this song from the server?')) return;
      btn.disabled = true;
      btn.textContent = 'Deleting...';
      try {
        const res = await KangiService.deleteSong(songId);
        if (res && res.success) {
          const notifMsg = res.notificationSent
            ? 'Song deleted — owner notified ✓'
            : 'Song deleted (owner could not be notified — no uploader ID on record)';
          _alert(el.soundsAlert, 'success', notifMsg);
          await _loadSongsData();
        } else {
          _alert(el.soundsAlert, 'error', res.error || 'Failed to delete song.');
        }
      } catch (err) {
        _alert(el.soundsAlert, 'error', err);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Delete';
      }
    }
  });

  /* ================================================================
     CLEAR ALL DATA
     ================================================================ */
  function _bindClearAll() {
    el.clearAllBtn.addEventListener('click', async () => {
      if (!confirm('⚠️ This will permanently delete ALL TCG data from the database.\n\nThis cannot be undone. Continue?')) return;

      el.clearAllBtn.disabled    = true;
      el.clearAllBtn.textContent = 'Clearing…';

      try {
        await KangiService.clearAll();
        await _loadAllData();
      } catch (err) {
        alert('Error clearing data: ' + err);
      } finally {
        el.clearAllBtn.disabled    = false;
        el.clearAllBtn.innerHTML   = `
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
          Clear All`;
      }
    });
  }

  /* ================================================================
     REFRESH
     ================================================================ */
  function _bindRefresh() {
    el.refreshBtn.addEventListener('click', async () => {
      if (!KangiService.session.isLoggedIn()) return;
      el.refreshBtn.style.animation = 'spin 0.65s linear';
      await _loadAllData();
      await _loadSongsData();
      await _loadUsers();
      setTimeout(() => el.refreshBtn.style.animation = '', 700);
    });
  }

  /* ================================================================
     THEME
     ================================================================ */
  function _bindTheme() {
    el.themeToggle.addEventListener('click', () => {
      const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = cur === 'dark' ? 'light' : 'dark';
      _applyTheme(next);
      localStorage.setItem('kangi_theme', next);
    });
  }

  function _applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    el.iconMoon?.classList.toggle('hidden', t === 'light');
    el.iconSun?.classList.toggle('hidden',  t === 'dark');
  }

  /* ================================================================
     HELPERS
     ================================================================ */
  function _uid(prefix = 'ID') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  }

  /* Stable CSS-safe ID from token */
  function _safeId(token) {
    return token.replace(/[^a-zA-Z0-9]/g, '_');
  }

  function _esc(s = '') {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
    );
  }

  function _alert(node, type, text) {
    const cls = { error:'alert--error', success:'alert--success', info:'alert--info', warning:'alert--warning' };
    node.className   = `alert ${cls[type] || 'alert--info'}`;
    node.textContent = text;
    node.classList.remove('hidden');
  }

  function _hideEl(node) { node.classList.add('hidden'); }

  function _setLoading(btn, on) {
    btn.disabled = on;
    btn.querySelector('.btn-text')?.classList.toggle('hidden', on);
    btn.querySelector('.btn-loader')?.classList.toggle('hidden', !on);
  }

  function _emptyHTML(msg) {
    return `<div class="empty-state">${_nftSvg()}<p>${msg}</p></div>`;
  }

  function _nftSvg() {
    return `<svg viewBox="0 0 40 40" fill="none"><rect x="5" y="5" width="30" height="30" rx="6" stroke="currentColor" stroke-width="2"/><path d="M13 27V13h5l7 9V13h5v14h-5L18 18v9h-5Z" fill="currentColor"/></svg>`;
  }

  /* ── Resolve raw NFT IDs / tokens → human-readable character names ──
     The game stores NFT collection IDs like "COL-MSA..." in UnlockedCharacters.
     Strategy:
       1. If the id is already a known character name → use it directly.
       2. Match id against nft.id in the loaded NFT library.
       3. Extract character name from the matched nft.name (first word before " — ").
       4. Fallback: return the raw id so nothing is silently dropped. */
  function _resolveCharacterNames(rawIds) {
    if (!rawIds || !rawIds.length) return [];
    const knownNames = ['Katsumi', 'Kiko', 'Bee', 'Chyna'];
    const nfts = state.nfts || [];

    return rawIds.map(id => {
      const s = String(id);

      // 1. Already a plain character name
      const direct = knownNames.find(n => n.toLowerCase() === s.toLowerCase());
      if (direct) return direct;

      // 2. Match against NFT library by exact id
      const byId = nfts.find(n => n.id === s);
      if (byId) {
        // Extract first word before " — " or space
        const base = (byId.name || '').split(/\s*—\s*/)[0].trim().split(' ')[0];
        return base || byId.name;
      }

      // 3. The id might start with a character's first name token
      const byPrefix = knownNames.find(n => s.toLowerCase().includes(n.toLowerCase()));
      if (byPrefix) return byPrefix;

      // 4. Fallback — show raw id so it's visible in the UI
      return s;
    });
  }

  /* ================================================================
     USER MANAGEMENT — list only, actions live inside the modal
     ================================================================ */
  function _bindUserManagement() {
    /* Load Users button */
    el.loadUsersBtn?.addEventListener('click', _loadUsers);
    /* Register card click handlers once */
    _bindUserListClicks();
  }

  /* ================================================================
     USER LIST — Load & render all players
     ================================================================ */
  async function _loadUsers() {
    if (!el.usersList) return;

    el.usersList.innerHTML = `
      <div class="empty-state">
        <div class="btn-loader" style="width:22px;height:22px;border-width:3px;"></div>
        <p>Loading players from PlayFab…</p>
      </div>`;

    try {
      const res   = await KangiService.getAllUsers();
      const users = (res && Array.isArray(res.users)) ? res.users : [];

      state.allUsers     = users;
      state.filteredUsers = users;

      /* Fetch character data for each user */
      for (const user of users) {
        try {
          const ud = await KangiService.getUserCharacters(user.playFabId);
          user.unlockedCharacters     = ud.unlockedCharacters || [];
          user.unlockedCharacterNames = null; // resolved lazily when panel opens
        } catch (_) {
          user.unlockedCharacters     = [];
          user.unlockedCharacterNames = null;
        }
      }

      _renderUsers(users);

      if (el.usersAlert) {
        _alert(el.usersAlert, 'info', `${users.length} player${users.length !== 1 ? 's' : ''} loaded.`);
        setTimeout(() => el.usersAlert.classList.add('hidden'), 3000);
      }
    } catch (err) {
      el.usersList.innerHTML = `<div class="empty-state"><p style="color:var(--red);">Failed to load users: ${_esc(String(err))}</p></div>`;
      if (el.usersAlert) _alert(el.usersAlert, 'error', typeof err === 'string' ? err : 'Could not load users.');
    }
  }

  function _renderUsers(users) {
    if (!el.usersList) return;

    if (!users.length) {
      el.usersList.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>
          <p>No users found.</p>
        </div>`;
      return;
    }

    el.usersList.innerHTML = '';
    users.forEach(user => {
      const card = document.createElement('div');
      card.className = 'user-card';
      card.dataset.playfabid = user.playFabId;
      card.dataset.user = JSON.stringify(user);

      const initial        = (user.displayName || '?').charAt(0).toUpperCase();
      const characterCount = (user.unlockedCharacters || []).length;

      card.innerHTML = `
        <div class="user-card-left">
          ${user.avatarUrl
            ? `<img class="user-card-avatar" src="${_esc(user.avatarUrl)}" alt="${_esc(user.displayName)}" />`
            : `<div class="user-card-avatar user-card-avatar--letter">${_esc(initial)}</div>`
          }
        </div>
        <div class="user-card-info">
          <div class="user-card-name">
            ${_esc(user.displayName || 'Unknown')}
            ${user.isAdmin  ? `<span class="chip chip--purple" style="font-size:0.65rem;">Admin</span>`  : ''}
            ${user.isBanned ? `<span class="chip chip--red"    style="font-size:0.65rem;">Banned</span>` : ''}
          </div>
          <div class="user-card-meta">
            <span>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:11px;height:11px;opacity:.6;"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
              ${user.email ? _esc(user.email) : '<em style="opacity:.5">no email</em>'}
            </span>
            <span>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:11px;height:11px;opacity:.6;"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/></svg>
              ${_esc(user.playFabId)}
            </span>
            ${user.lastLogin ? `<span>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:11px;height:11px;opacity:.6;"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>
              Last seen ${new Date(user.lastLogin).toLocaleDateString()}
            </span>` : ''}
          </div>
          <div class="user-card-characters">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/></svg>
            <span>${characterCount} character${characterCount !== 1 ? 's' : ''} unlocked</span>
          </div>
        </div>
        <div class="user-card-actions">
          <svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;color:var(--text-3);flex-shrink:0;">
            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
          </svg>
        </div>`;

      el.usersList.appendChild(card);
    });
  }

  /* ── User list click delegation — every card click opens the modal ── */
  function _bindUserListClicks() {
    if (!el.usersList) return;
    el.usersList.addEventListener('click', (e) => {
      const card = e.target.closest('.user-card');
      if (!card) return;
      try {
        _showUserDetails(JSON.parse(card.dataset.user));
      } catch (err) {
        console.error('Failed to parse user data:', err);
      }
    });
  }

  /* ===================================================================
     USER SEARCH & FILTER
     =================================================================== */
  function _bindUserSearch() {
    if (!el.userSearchInput) return;

    el.userSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      
      if (query.length > 0) {
        el.clearSearchBtn.style.display = 'block';
      } else {
        el.clearSearchBtn.style.display = 'none';
      }

      _filterUsers(query);
    });

    el.clearSearchBtn?.addEventListener('click', () => {
      el.userSearchInput.value = '';
      el.clearSearchBtn.style.display = 'none';
      el.userSearchStats.classList.add('hidden');
      _filterUsers('');
    });
  }

  function _filterUsers(query) {
    if (!query) {
      state.filteredUsers = state.allUsers;
      _renderUsers(state.allUsers);
      el.userSearchStats.classList.add('hidden');
      return;
    }

    const filtered = state.allUsers.filter(user => {
      const displayName = (user.displayName || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      const playFabId = (user.playFabId || '').toLowerCase();
      
      return displayName.includes(query) || 
             email.includes(query) || 
             playFabId.includes(query);
    });

    state.filteredUsers = filtered;
    _renderUsers(filtered);

    // Show search stats
    el.userSearchStats.classList.remove('hidden');
    el.userSearchStats.innerHTML = `
      <div class="search-stats-text">
        <svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;">
          <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
        </svg>
        <span>Found <span class="search-stats-count">${filtered.length}</span> user${filtered.length !== 1 ? 's' : ''} matching "${_esc(query)}"</span>
      </div>
    `;
  }

  /* ===================================================================
     USER MODALS — Details panel + all actions inside
     =================================================================== */
  function _bindUserModals() {
    /* ── Close panel ── */
    const _closeModal = () => {
      el.userDetailsModal.classList.add('hidden');
    };
    el.closeUserModal?.addEventListener('click', _closeModal);
    el.userDetailsModal?.querySelector('.modal-overlay')?.addEventListener('click', _closeModal);

    /* ── Make Admin ── */
    el.modalMakeAdminBtn?.addEventListener('click', async () => {
      if (!state.selectedUser) return;
      const { email, playFabId, displayName } = state.selectedUser;
      if (!confirm(`Grant admin access to "${displayName || email}"?`)) return;
      await _modalAction(async () => {
        const res = await KangiService.makeAdmin(email, playFabId);
        if (res && res.success) {
          state.selectedUser.isAdmin = true;
          _modalAlert('success', `✓ Admin granted to ${displayName || email}.`);
          _updateModalButtons(state.selectedUser);
          await _loadUsers();
        } else {
          _modalAlert('error', (res && res.error) || 'Failed to grant admin.');
        }
      });
    });

    /* ── Revoke Admin ── */
    el.modalRevokeAdminBtn?.addEventListener('click', async () => {
      if (!state.selectedUser) return;
      const { email, playFabId, displayName } = state.selectedUser;
      if (!confirm(`Revoke admin from "${displayName || email}"?`)) return;
      await _modalAction(async () => {
        const res = await KangiService.revokeAdmin(email, playFabId);
        if (res && res.success) {
          state.selectedUser.isAdmin = false;
          _modalAlert('success', `✓ Admin revoked from ${displayName || email}.`);
          _updateModalButtons(state.selectedUser);
          await _loadUsers();
        } else {
          _modalAlert('error', (res && res.error) || 'Failed to revoke admin.');
        }
      });
    });

    /* ── Unban ── */
    el.modalUnbanBtn?.addEventListener('click', async () => {
      if (!state.selectedUser) return;
      const { email, playFabId, displayName } = state.selectedUser;
      if (!confirm(`Lift ban on "${displayName || email}"?`)) return;
      await _modalAction(async () => {
        const res = await KangiService.unbanUser(email, playFabId);
        if (res && res.success) {
          state.selectedUser.isBanned = false;
          _modalAlert('success', `✓ ${displayName || email} has been unbanned.`);
          _updateModalButtons(state.selectedUser);
          await _loadUsers();
        } else {
          _modalAlert('error', (res && res.error) || 'Failed to unban user.');
        }
      });
    });

    /* ── Ban cards (3 days / 7 days / permanent) ── */
    el.userModalActionsBar?.addEventListener('click', async (e) => {
      const card = e.target.closest('[data-modal-ban]');
      if (!card || !state.selectedUser) return;

      const duration = card.dataset.modalBan;
      const { email, playFabId, displayName } = state.selectedUser;
      const label = duration === 'permanent' ? 'permanently' : `for ${duration} days`;
      if (!confirm(`Ban "${displayName || email}" ${label}?`)) return;

      await _modalAction(async () => {
        const days = duration === 'permanent' ? 0 : parseInt(duration);
        const res  = await KangiService.banUser(email, playFabId, days);
        if (res && res.success) {
          state.selectedUser.isBanned = true;
          state.selectedUser.isAdmin  = false;
          _modalAlert('success', `✓ ${displayName || email} banned ${label}.`);
          _updateModalButtons(state.selectedUser);
          await _loadUsers();
        } else {
          _modalAlert('error', (res && res.error) || 'Ban failed.');
        }
      });
    });

    /* ── Send notification ── */
    el.modalSendNotifBtn?.addEventListener('click', async () => {
      if (!state.selectedUser) return;
      const msg = el.modalNotifInput?.value.trim();
      if (!msg) { _modalAlert('error', 'Please type a message first.'); return; }

      await _modalAction(async () => {
        const res = await KangiService.sendNotification(
          state.selectedUser.playFabId,
          'Message from Admin',
          msg,
          'info',
          {}
        );
        if (res && res.success) {
          _modalAlert('success', '✓ Notification sent.');
          if (el.modalNotifInput) el.modalNotifInput.value = '';
        } else {
          _modalAlert('error', (res && res.error) || 'Failed to send notification.');
        }
      });
    });
  }

  async function _modalAction(fn) {
    const btns = [
      el.modalMakeAdminBtn, el.modalRevokeAdminBtn,
      el.modalUnbanBtn, el.modalSendNotifBtn,
      ...(el.userModalActionsBar
          ? [...el.userModalActionsBar.querySelectorAll('[data-modal-ban]')]
          : [])
    ].filter(Boolean);
    btns.forEach(b => { b.disabled = true; });
    try {
      await fn();
    } catch (err) {
      _modalAlert('error', typeof err === 'string' ? err : (err?.message || 'Action failed. Check console for details.'));
      console.error('[Kangi] Modal action error:', err);
    } finally {
      btns.forEach(b => { b.disabled = false; });
    }
  }

  /* Helper — show alert inside the modal */
  function _modalAlert(type, text) {
    if (!el.modalActionAlert) return;
    _alert(el.modalActionAlert, type, text);
    setTimeout(() => el.modalActionAlert.classList.add('hidden'), 4000);
  }

  function _updateModalButtons(user) {
    if (!el.userModalActionsBar) return;

    // Admin buttons
    el.modalMakeAdminBtn.style.display   = (!user.isAdmin && !user.isBanned && user.email) ? '' : 'none';
    el.modalRevokeAdminBtn.style.display = (user.isAdmin  && user.email) ? '' : 'none';

    // Ban / unban
    const canBan   = !user.isBanned && user.email;
    const canUnban = user.isBanned  && user.email;

    // Show/hide the whole ban grid
    const banGrid = el.userModalActionsBar.querySelector('.upf-ban-grid');
    const banLabel = el.userModalActionsBar.querySelectorAll('.upf-section-label')[1];
    if (banGrid)  banGrid.style.display  = canBan ? '' : 'none';
    if (banLabel) banLabel.style.display = canBan ? '' : 'none';

    el.modalUnbanBtn.style.display = canUnban ? '' : 'none';
  }

  function _showUserDetails(user) {
    if (!el.userDetailsModal) return;
    state.selectedUser = user;

    el.userDetailsModal.classList.remove('hidden');
    el.userDetailsBody.innerHTML = `
      <div class="loading-spinner">
        <div class="btn-loader"></div>
        <p>Loading...</p>
      </div>`;

    if (el.userModalActionsBar) el.userModalActionsBar.style.display = 'none';
    if (el.modalActionAlert)    el.modalActionAlert.classList.add('hidden');

    const initial       = (user.displayName || '?').charAt(0).toUpperCase();
    // Resolve lazily here — NFTs are guaranteed loaded by the time panel opens
    const rawIds        = user.unlockedCharacters || [];
    const unlockedNames = rawIds.length > 0 ? _resolveCharacterNames(rawIds) : [];
    const allCharacters = ['Katsumi', 'Kiko', 'Bee', 'Chyna'];

    console.log('[Kangi] Panel open for:', user.displayName, '| rawIds:', rawIds, '| resolved:', unlockedNames);

    setTimeout(() => {
      el.userDetailsBody.innerHTML = `
        <!-- Hero -->
        <div class="up-hero">
          <div class="up-hero-avatar">
            ${user.avatarUrl ? `<img src="${_esc(user.avatarUrl)}" alt="${_esc(user.displayName)}" />` : initial}
          </div>
          <div class="up-hero-info">
            <h3>${_esc(user.displayName || 'Unknown')}</h3>
            <span class="up-hero-email">${_esc(user.email || 'No email')}</span>
            <div class="up-hero-badges">
              ${user.isAdmin  ? '<span class="chip chip--purple">Admin</span>'  : ''}
              ${user.isBanned ? '<span class="chip chip--red">Banned</span>'    : '<span class="chip chip--green">Active</span>'}
            </div>
          </div>
        </div>

        <!-- Account info -->
        <div class="up-section">
          <div class="up-section-title">Account Information</div>
          <div class="up-info-grid">
            <div class="up-info-item">
              <span class="up-info-label">PlayFab ID</span>
              <span class="up-info-value">${_esc(user.playFabId)}</span>
            </div>
            <div class="up-info-item">
              <span class="up-info-label">Display Name</span>
              <span class="up-info-value">${_esc(user.displayName || '—')}</span>
            </div>
            <div class="up-info-item">
              <span class="up-info-label">Email</span>
              <span class="up-info-value">${_esc(user.email || '—')}</span>
            </div>
            <div class="up-info-item">
              <span class="up-info-label">Account Status</span>
              <span class="up-info-value">${user.isBanned ? '🔴 Banned' : '🟢 Active'}</span>
            </div>
            <div class="up-info-item">
              <span class="up-info-label">Joined</span>
              <span class="up-info-value">${user.created ? new Date(user.created).toLocaleDateString() : '—'}</span>
            </div>
            <div class="up-info-item">
              <span class="up-info-label">Last Login</span>
              <span class="up-info-value">${user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}</span>
            </div>
          </div>
        </div>

        <!-- Characters -->
        <div class="up-section">
          <div class="up-section-title">Unlocked Characters (${rawIds.length} / ${allCharacters.length})</div>
          <div class="up-chars-grid">
            ${allCharacters.map(char => {
              // Check by resolved name OR by raw id containing the character name
              const isUnlocked = unlockedNames.some(n =>
                n.toLowerCase() === char.toLowerCase() ||
                n.toLowerCase().startsWith(char.toLowerCase())
              ) || rawIds.some(id =>
                String(id).toLowerCase().includes(char.toLowerCase())
              );
              // Find matching NFT for image
              const matchedNft = isUnlocked
                ? (state.nfts || []).find(n =>
                    n.name?.toLowerCase().startsWith(char.toLowerCase())
                  )
                : null;
              return `
                <div class="up-char-card ${isUnlocked ? 'unlocked' : 'locked'}">
                  ${matchedNft
                    ? `<img src="${matchedNft.image}" alt="${_esc(char)}" class="up-char-img" />`
                    : `<span class="up-char-icon">${isUnlocked ? '🔓' : '🔒'}</span>`
                  }
                  <div class="up-char-details">
                    <span class="up-char-name">${_esc(char)}</span>
                    ${matchedNft ? `<span class="up-char-nft-name">${_esc(matchedNft.name)}</span>` : ''}
                    <span class="up-char-badge">${isUnlocked ? 'Unlocked' : 'Locked'}</span>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;

      /* Show action footer */
      if (el.userModalActionsBar) {
        el.userModalActionsBar.style.display = '';
        _updateModalButtons(user);
      }

      /* Load and render the notification list */
      _loadUserNotifications(user.playFabId);
    }, 220);
  }

  /* ================================================================
     USER NOTIFICATIONS — fetch and render inside the details modal
     ================================================================ */
  async function _loadUserNotifications(playFabId) {
    /* Wait for the modal body to be rendered before injecting the section */
    const container = el.userDetailsBody;
    if (!container) return;

    /* Append a placeholder section immediately */
    const section = document.createElement('div');
    section.className = 'up-section';
    section.id = 'up-notif-section';
    section.innerHTML = `
      <div class="up-section-title">Notifications</div>
      <div id="up-notif-list" class="up-notif-list">
        <div class="up-notif-loading">
          <div class="btn-loader" style="width:18px;height:18px;border-width:2px;"></div>
          <span>Loading notifications…</span>
        </div>
      </div>`;
    container.appendChild(section);

    try {
      const res = await KangiService.getNotifications(playFabId);
      const notifications = (res && Array.isArray(res.notifications)) ? res.notifications : [];
      const notifList = document.getElementById('up-notif-list');
      if (!notifList) return;

      /* Update section title with counts */
      const titleEl = section.querySelector('.up-section-title');
      if (titleEl) {
        const unread = notifications.filter(n => !n.read).length;
        titleEl.textContent = `Notifications (${notifications.length}${unread > 0 ? ` · ${unread} unread` : ''})`;
      }

      if (!notifications.length) {
        notifList.innerHTML = `<div class="up-notif-empty">No notifications yet.</div>`;
        return;
      }

      const TYPE_META = {
        ban:            { label: 'Ban',      cls: 'chip--red'    },
        unban:          { label: 'Unban',    cls: 'chip--green'  },
        audio_approved: { label: 'Approved', cls: 'chip--teal'   },
        audio_deleted:  { label: 'Removed',  cls: 'chip--red'    },
        admin_granted:  { label: 'Admin',    cls: 'chip--purple' },
        admin_revoked:  { label: 'Revoked',  cls: 'chip--red'    },
        success:        { label: 'Success',  cls: 'chip--green'  },
        warning:        { label: 'Warning',  cls: 'chip--yellow' },
        error:          { label: 'Error',    cls: 'chip--red'    },
        info:           { label: 'Info',     cls: 'chip--teal'   }
      };

      notifList.innerHTML = notifications.map(n => {
        const meta = TYPE_META[n.type] || { label: n.type || 'Info', cls: 'chip--teal' };
        const timeStr = _formatNotifTime(n.createdAt);
        const readCls = n.read ? 'up-notif-item--read' : 'up-notif-item--unread';
        return `
          <div class="up-notif-item ${readCls}">
            <div class="up-notif-header">
              <span class="chip ${meta.cls}" style="font-size:0.6rem;padding:1px 6px;">${_esc(meta.label)}</span>
              ${!n.read ? '<span class="up-notif-dot"></span>' : ''}
              <span class="up-notif-time">${_esc(timeStr)}</span>
            </div>
            <div class="up-notif-title">${_esc(n.title)}</div>
            <div class="up-notif-msg">${_esc(n.message)}</div>
          </div>`;
      }).join('');

    } catch (err) {
      const notifList = document.getElementById('up-notif-list');
      if (notifList) {
        notifList.innerHTML = `<div class="up-notif-empty" style="color:var(--red);">Could not load notifications.</div>`;
      }
    }
  }

  function _formatNotifTime(isoTime) {
    try {
      const time = new Date(isoTime);
      const diff = (Date.now() - time.getTime()) / 1000; // seconds
      if (diff < 60)   return 'Just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
      return time.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (_) { return ''; }
  }

  /* ================================================================
     MESSAGES — Admin inbox for user support messages
     ================================================================ */
  function _bindMessages() {
    document.getElementById('refreshMessagesBtn')
      ?.addEventListener('click', _loadMessages);
  }

  async function _loadMessages() {
    const list  = document.getElementById('messagesList');
    const alert = document.getElementById('messagesAlert');
    if (!list) return;

    list.innerHTML = `
      <div class="empty-state">
        <div class="btn-loader" style="width:22px;height:22px;border-width:3px;"></div>
        <p>Loading messages…</p>
      </div>`;

    try {
      const res = await KangiService.getSupportMessages();

      console.log('[DWM] getSupportMessages result:', res);

      if (!res || res.error) {
        const errMsg = (res && res.error) || 'Server returned an error.';
        list.innerHTML = `<div class="empty-state"><p style="color:var(--red);">${_esc(errMsg)}</p></div>`;
        if (alert) _alert(alert, 'error', errMsg);
        return;
      }

      const messages = Array.isArray(res.messages) ? res.messages : [];

      if (alert) {
        if (messages.length === 0) {
          alert.classList.add('hidden');
        } else {
          _alert(alert, 'info',
            `${messages.length} message${messages.length !== 1 ? 's' : ''} · ${res.openCount || 0} open`);
          setTimeout(() => alert.classList.add('hidden'), 3000);
        }
      }

      _renderMessages(messages);
    } catch (err) {
      console.error('[DWM] _loadMessages error:', err);
      const msg = typeof err === 'string' ? err : (err?.message || 'Could not load messages.');
      list.innerHTML = `<div class="empty-state"><p style="color:var(--red);">${_esc(msg)}</p></div>`;
      if (alert) _alert(alert, 'error', msg);
    }
  }

  function _renderMessages(messages) {
    const list = document.getElementById('messagesList');
    if (!list) return;

    if (!messages.length) {
      list.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 20 20" fill="currentColor" style="width:40px;height:40px;opacity:.4;color:var(--pink);">
            <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
          </svg>
          <p>No messages yet</p>
        </div>`;
      return;
    }

    list.innerHTML = '';
    messages.forEach(msg => {
      const isOpen    = msg.status === 'open';
      const hasReply  = !!msg.adminReply;
      const timeStr   = _formatMsgTime(msg.createdAt);

      const card = document.createElement('div');
      card.className = 'msg-card';
      card.innerHTML = `
        <div class="msg-card-header">
          <div class="msg-card-meta">
            <span class="msg-from">${_esc(msg.displayName || msg.playFabId)}</span>
            <span class="msg-id">${_esc(msg.playFabId)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.6rem;">
            <span class="chip ${isOpen ? 'chip--red' : 'chip--green'}">${isOpen ? 'Open' : 'Replied'}</span>
            <span class="msg-time">${_esc(timeStr)}</span>
          </div>
        </div>
        <div class="msg-body">${_esc(msg.body)}</div>
        ${hasReply ? `
          <div class="msg-reply-block">
            <span class="msg-reply-label">Your reply · ${_esc(_formatMsgTime(msg.repliedAt))}</span>
            <div class="msg-reply-text">${_esc(msg.adminReply)}</div>
          </div>` : ''}
        <div class="msg-actions">
          ${isOpen ? `
            <div class="msg-reply-row">
              <input class="msg-reply-input" type="text" placeholder="Type a reply…" />
              <button class="btn btn-primary btn-sm msg-send-btn">Reply</button>
            </div>` : ''}
          <button class="btn btn-danger btn-sm msg-delete-btn">Delete</button>
        </div>`;

      // Reply
      const replyInput = card.querySelector('.msg-reply-input');
      const replyBtn   = card.querySelector('.msg-send-btn');
      if (replyBtn && replyInput) {
        replyBtn.addEventListener('click', async () => {
          const replyText = replyInput.value.trim();
          if (!replyText) return;
          replyBtn.disabled = true;
          replyBtn.textContent = 'Sending…';
          try {
            await KangiService.replyToMessage(msg.id, replyText);
            await _loadMessages();
          } catch (e) {
            replyBtn.disabled = false;
            replyBtn.textContent = 'Reply';
            const a = document.getElementById('messagesAlert');
            if (a) _alert(a, 'error', 'Reply failed.');
          }
        });

        // Allow Enter key to send
        replyInput.addEventListener('keydown', e => {
          if (e.key === 'Enter') replyBtn.click();
        });
      }

      // Delete
      card.querySelector('.msg-delete-btn').addEventListener('click', async () => {
        if (!confirm('Delete this message?')) return;
        try {
          await KangiService.deleteSupportMessage(msg.id);
          await _loadMessages();
        } catch (e) {
          const a = document.getElementById('messagesAlert');
          if (a) _alert(a, 'error', 'Delete failed.');
        }
      });

      list.appendChild(card);
    });
  }

  function _formatMsgTime(isoTime) {
    try {
      const t = new Date(isoTime);
      const diff = (Date.now() - t.getTime()) / 1000;
      if (diff < 60)    return 'Just now';
      if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (_) { return ''; }
  }

  /* ── Start ──*/
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
