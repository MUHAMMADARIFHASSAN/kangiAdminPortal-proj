/* ============================================================
   app.js — Kangi NFT QR Manager
   Full flow: Login → Dashboard → Create NFT → Manage QRs → Redeem
   All data operations go through service.js → Supabase REST
   ============================================================ */
(function () {
  'use strict';

  /* ─── DOM shorthand ─── */
  const $ = (id) => document.getElementById(id);

  /* ─── Element refs ─── */
  const el = {
    /* Auth */
    loginView:             $('loginView'),
    loginForm:             $('loginForm'),
    loginEmail:            $('loginUsername'),
    loginPass:             $('loginPassword'),
    loginBtn:              $('loginBtn'),
    loginAlert:            $('loginAlert'),
    authHeading:           $('authHeading'),
    authSub:               $('authSub'),
    showForgotPasswordBtn: $('showForgotPasswordBtn'),
    forgotPasswordForm:    $('forgotPasswordForm'),
    forgotEmail:           $('forgotEmail'),
    forgotBtn:             $('forgotBtn'),
    backToLoginBtn:        $('backToLoginBtn'),

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
    appConfigAlert:      $('appConfigAlert'),
    showLogsStatusBadge: $('showLogsStatusBadge'),
    toggleShowLogsBtn:   $('toggleShowLogsBtn'),

    /* Dashboard */
    statNfts:       $('statNfts'),
    statCodes:      $('statCodes'),
    statRedeemed:   $('statRedeemed'),
    statUsers:      $('statUsers'),
    dashUsersList:  $('dashUsersList'),
    dashSoundsList: $('dashSoundsList'),
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
    /* Upload Music Modal */
    btnOpenUploadSongModal: $('btnOpenUploadSongModal'),
    uploadSongModal:        $('uploadSongModal'),
    closeUploadSongModal:   $('closeUploadSongModal'),
    cancelUploadSongBtn:    $('cancelUploadSongBtn'),
    uploadSongForm:         $('uploadSongForm'),
    uploadSongTitle:        $('uploadSongTitle'),
    btnAudioSourceFile:     $('btnAudioSourceFile'),
    btnAudioSourceUrl:      $('btnAudioSourceUrl'),
    audioFileInputContainer:$('audioFileInputContainer'),
    audioUrlInputContainer: $('audioUrlInputContainer'),
    uploadAudioFile:        $('uploadAudioFile'),
    uploadAudioUrl:         $('uploadAudioUrl'),
    audioFileName:          $('audioFileName'),
    uploadAsAvatar:         $('uploadAsAvatar'),
    uploadAsInitial:        $('uploadAsInitial'),
    uploadAsName:           $('uploadAsName'),
    uploadModeMirrorMii:    $('uploadModeMirrorMii'),
    uploadModeKawaii:       $('uploadModeKawaii'),
    uploadModeDance:        $('uploadModeDance'),
    uploadSongAutoApprove:  $('uploadSongAutoApprove'),
    submitUploadSongBtn:    $('submitUploadSongBtn'),
    uploadSongModalAlert:   $('uploadSongModalAlert'),

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
    modalShowLogsBtn:   $('modalShowLogsBtn'),
    modalHideLogsBtn:   $('modalHideLogsBtn'),
    modalUnbanBtn:      $('modalUnbanBtn'),
    modalNotifInput:    $('modalNotifInput'),
    modalSendNotifBtn:  $('modalSendNotifBtn'),
    modalMakePremiumBtn:   $('modalMakePremiumBtn'),
    modalRevokePremiumBtn: $('modalRevokePremiumBtn'),
    banSectionLabel:    $('banSectionLabel'),
    modalActionAlert:   $('modalActionAlert'),
    /* Settings */
    fbDatabaseType:     $('fbDatabaseType'),
    fbCollectionName:   $('fbCollectionName'),
    fbProjectId:        $('fbProjectId'),
    fbApiKey:           $('fbApiKey'),
    fbAuthDomain:       $('fbAuthDomain'),
    fbDatabaseUrl:      $('fbDatabaseUrl'),
    fbJsonConfig:       $('fbJsonConfig'),
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
    activeMusicUploads: [],
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
    // KangiService.init(); // removed — Supabase needs no init
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

    // Floating background upload pill click to switch to sounds view
    document.getElementById('bgUploadFloatingPill')?.addEventListener('click', () => {
      _switchView('sounds');
    });
    document.getElementById('btnViewBgUpload')?.addEventListener('click', (e) => {
      e.stopPropagation();
      _switchView('sounds');
    });

    // Sessions are not persisted across page loads, so this always comes back null
    // and the login view stays up. The call is kept because it also clears any
    // session written by an older build of the dashboard. See restoreSession() in
    // service.js — no session persistence, admin must re-login.
    const savedSession = KangiService.restoreSession();
    if (savedSession) {
      _onLoginSuccess(savedSession);
    }
  }

  /* ================================================================
     AUTH — Login with Supabase Email + Password + isAdmin check
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
        // Firebase removed — Supabase session is live
        _onLoginSuccess(res);
      } catch (msg) {
        _alert(el.loginAlert, 'error', msg);
      } finally {
        _setLoading(el.loginBtn, false);
      }
    });

    /* Switch to Forgot Password view */
    if (el.showForgotPasswordBtn) {
      el.showForgotPasswordBtn.addEventListener('click', () => {
        _hideEl(el.loginForm);
        el.forgotPasswordForm.classList.remove('hidden');
        if (el.authHeading) el.authHeading.textContent = 'Reset password';
        if (el.authSub) el.authSub.textContent = 'Enter your registered email address to receive password recovery instructions.';
        if (el.loginEmail && el.loginEmail.value.trim()) {
          el.forgotEmail.value = el.loginEmail.value.trim();
        }
        _hideEl(el.loginAlert);
        el.forgotEmail.focus();
      });
    }

    /* Switch back to Sign in view */
    if (el.backToLoginBtn) {
      el.backToLoginBtn.addEventListener('click', () => {
        _hideEl(el.forgotPasswordForm);
        el.loginForm.classList.remove('hidden');
        if (el.authHeading) el.authHeading.textContent = 'Sign in';
        if (el.authSub) el.authSub.textContent = 'Enter your credentials to access the dashboard.';
        _hideEl(el.loginAlert);
        el.loginEmail.focus();
      });
    }

    /* Submit Forgot Password form */
    if (el.forgotPasswordForm) {
      el.forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = el.forgotEmail.value.trim();

        if (!email) {
          return _alert(el.loginAlert, 'error', 'Please enter your email address.');
        }

        _setLoading(el.forgotBtn, true);
        _hideEl(el.loginAlert);

        try {
          const res = await KangiService.sendAccountRecoveryEmail(email);
          _alert(el.loginAlert, 'success', res.message || 'Password reset email sent! Check your inbox.');
        } catch (msg) {
          _alert(el.loginAlert, 'error', typeof msg === 'string' ? msg : msg?.message || 'Failed to send reset email.');
        } finally {
          _setLoading(el.forgotBtn, false);
        }
      });
    }
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
        await _loadAppConfig();
        el.settingsRefreshBtn.disabled = false;
        el.settingsRefreshBtn.textContent = 'Refresh Data';
      });
    }

    /* ── Grant / Revoke Admin by Email ── */
    const grantAdminBtn   = document.getElementById('grantAdminBtn');
    const revokeAdminBtn  = document.getElementById('revokeAdminBtn');
    const grantAdminAlert = document.getElementById('grantAdminAlert');

    function _grantAdminAlert(msg, type) {
      if (!grantAdminAlert) return;
      grantAdminAlert.textContent = msg;
      grantAdminAlert.className = 'alert alert-' + (type === 'success' ? 'success' : type === 'info' ? 'info' : 'error');
      grantAdminAlert.classList.remove('hidden');
      setTimeout(() => grantAdminAlert.classList.add('hidden'), 5000);
    }

    async function _findUserByEmail(email) {
      // Look up user in admin_users view (needs admin token)
      try {
        const rows = await KangiService._get('/admin_users', {
          'email':  'eq.' + email,
          'select': 'id,display_name,email'
        });
        return rows && rows[0] ? rows[0] : null;
      } catch (e) {
        return null;
      }
    }

    if (grantAdminBtn) {
      grantAdminBtn.addEventListener('click', async () => {
        const email = document.getElementById('grantAdminEmail')?.value?.trim();
        if (!email) return _grantAdminAlert('Please enter an email address.', 'error');

        grantAdminBtn.disabled = true;
        grantAdminBtn.textContent = 'Granting...';
        _grantAdminAlert('Looking up user...', 'info');

        try {
          const user = await _findUserByEmail(email);
          if (!user) {
            _grantAdminAlert(`No account found for "${email}". The user must sign up first.`, 'error');
            return;
          }
          const res = await KangiService.makeAdmin(email, user.id);
          if (res && res.success) {
            _grantAdminAlert(`✅ Admin granted to ${user.display_name || email}.`, 'success');
            document.getElementById('grantAdminEmail').value = '';
            await _loadUsers();
          } else {
            _grantAdminAlert(res?.error || 'Failed to grant admin.', 'error');
          }
        } catch (err) {
          _grantAdminAlert(err?.message || 'Error: ' + String(err), 'error');
        } finally {
          grantAdminBtn.disabled = false;
          grantAdminBtn.textContent = '🛡️ Make Admin';
        }
      });
    }

    if (revokeAdminBtn) {
      revokeAdminBtn.addEventListener('click', async () => {
        const email = document.getElementById('revokeAdminEmail')?.value?.trim();
        if (!email) return _grantAdminAlert('Please enter an email address.', 'error');
        if (!confirm(`Revoke admin from "${email}"?`)) return;

        revokeAdminBtn.disabled = true;
        revokeAdminBtn.textContent = 'Revoking...';
        _grantAdminAlert('Looking up user...', 'info');

        try {
          const user = await _findUserByEmail(email);
          if (!user) {
            _grantAdminAlert(`No account found for "${email}".`, 'error');
            return;
          }
          const res = await KangiService.revokeAdmin(email, user.id);
          if (res && res.success) {
            _grantAdminAlert(`✅ Admin revoked from ${user.display_name || email}.`, 'success');
            document.getElementById('revokeAdminEmail').value = '';
            await _loadUsers();
          } else {
            _grantAdminAlert(res?.error || 'Failed to revoke admin.', 'error');
          }
        } catch (err) {
          _grantAdminAlert(err?.message || 'Error: ' + String(err), 'error');
        } finally {
          revokeAdminBtn.disabled = false;
          revokeAdminBtn.textContent = '❌ Revoke Admin';
        }
      });
    }

    /* ── App Configuration (ShowLogs Toggle) ── */
    let currentShowLogs = false;

    async function _loadAppConfig() {
      if (!el.showLogsStatusBadge) return;
      el.showLogsStatusBadge.textContent = 'Loading...';
      el.showLogsStatusBadge.className = 'badge badge-teal';
      try {
        const res = await KangiService.getAppConfig();
        currentShowLogs = !!(res && res.showLogs);
        _updateShowLogsUI(currentShowLogs);
      } catch (err) {
        el.showLogsStatusBadge.textContent = 'Offline / Default (Off)';
        el.showLogsStatusBadge.className = 'badge badge-warning';
        if (el.toggleShowLogsBtn) {
          el.toggleShowLogsBtn.textContent = 'Enable Logs';
          el.toggleShowLogsBtn.className = 'btn btn-primary btn-sm';
        }
      }
    }

    function _updateShowLogsUI(enabled) {
      currentShowLogs = enabled;
      if (el.showLogsStatusBadge) {
        if (enabled) {
          el.showLogsStatusBadge.textContent = '● Enabled (Active)';
          el.showLogsStatusBadge.className = 'badge badge-success';
        } else {
          el.showLogsStatusBadge.textContent = '○ Disabled (Hidden)';
          el.showLogsStatusBadge.className = 'badge badge-secondary';
        }
      }
      if (el.toggleShowLogsBtn) {
        if (enabled) {
          el.toggleShowLogsBtn.textContent = 'Disable Logs';
          el.toggleShowLogsBtn.className = 'btn btn-danger btn-sm';
        } else {
          el.toggleShowLogsBtn.textContent = 'Enable Logs';
          el.toggleShowLogsBtn.className = 'btn btn-primary btn-sm';
        }
      }
    }

    if (el.toggleShowLogsBtn) {
      el.toggleShowLogsBtn.addEventListener('click', async () => {
        const targetState = !currentShowLogs;
        el.toggleShowLogsBtn.disabled = true;
        el.toggleShowLogsBtn.innerHTML = '<span class="btn-loader" style="width:12px;height:12px;border-width:2px;margin-right:4px;"></span>Saving...';
        try {
          const res = await KangiService.setShowLogs(targetState);
          if (res && res.success) {
            _updateShowLogsUI(targetState);
            _alert(el.appConfigAlert, 'success', `✓ In-game console logs ${targetState ? 'ENABLED' : 'DISABLED'} successfully in database Title Data.`);
            setTimeout(() => _hideEl(el.appConfigAlert), 4000);
          } else {
            throw new Error(res?.error || 'Failed to update ShowLogs setting');
          }
        } catch (err) {
          _alert(el.appConfigAlert, 'error', `Failed to update configuration: ${err?.message || err}`);
        } finally {
          el.toggleShowLogsBtn.disabled = false;
        }
      });
    }

    // Expose for external refreshes
    window._reloadAppConfig = _loadAppConfig;

    /* The JSON box mirrors the config for copy/paste; the admin password must
       never be rendered into it as plain text. */
    function _fbConfigForDisplay(cfg) {
      const shown = { ...cfg };
      if (shown.adminPassword) shown.adminPassword = '••••••••';
      return shown;
    }

    // Show / Hide Logs buttons
    if (el.modalShowLogsBtn) {
      el.modalShowLogsBtn.style.display = (!user.showLogs && !user.isBanned) ? '' : 'none';
    }
    if (el.modalHideLogsBtn) {
      el.modalHideLogsBtn.style.display = (user.showLogs) ? '' : 'none';
    }

    // Premium toggles
    if (el.modalMakePremiumBtn) {
      el.modalMakePremiumBtn.style.display   = (!user.isPremium && !user.isBanned) ? '' : 'none';
    }
    if (el.modalRevokePremiumBtn) {
      el.modalRevokePremiumBtn.style.display = (user.isPremium) ? '' : 'none';
    }

    // Ban / unban
    const canBan   = !user.isBanned;
    const canUnban =  user.isBanned;

    // Show/hide the whole ban grid
    const banGrid = el.userModalActionsBar.querySelector('.upf-ban-grid');
    const banLabel = el.banSectionLabel;
    if (banGrid)  banGrid.style.display  = canBan ? '' : 'none';
    if (banLabel) banLabel.style.display = canBan ? '' : 'none';

    el.modalUnbanBtn.style.display = canUnban ? '' : 'none';
  }

  async function _showUserDetails(user) {
    if (!el.userDetailsModal) return;
    state.selectedUser = user;

    el.userDetailsModal.classList.remove('hidden');
    el.userDetailsBody.innerHTML = `
      <div class="loading-spinner">
        <div class="btn-loader"></div>
        <p>Querying Database API for player internal data…</p>
      </div>`;

    if (el.userModalActionsBar) el.userModalActionsBar.style.display = 'none';
    if (el.modalActionAlert)    el.modalActionAlert.classList.add('hidden');

    const friendlyName  = _getUserDisplayName(user);
    const initial       = friendlyName.charAt(0).toUpperCase();

    // Fetch on-demand internal data from Supabase
    let pfDetails = { unlockedCharacters: user.unlockedCharacters || [], notifications: [] };
    try {
      if (user.id) {
        pfDetails = await KangiService.getUserCharacters(user.id).then(r => ({ characters: r.unlockedCharacters || [], notifications: [] }));
        user.unlockedCharacters = pfDetails.unlockedCharacters || [];
        if (pfDetails.isAdmin !== undefined)   user.isAdmin   = pfDetails.isAdmin;
        if (pfDetails.showLogs !== undefined)  user.showLogs  = pfDetails.showLogs;
        if (pfDetails.isPremium !== undefined) user.isPremium = pfDetails.isPremium;
        if (pfDetails.isBanned !== undefined)  user.isBanned  = pfDetails.isBanned;
        if (pfDetails.bannedUntil !== undefined) user.bannedUntil = pfDetails.bannedUntil;
        if (pfDetails.banReason !== undefined)   user.banReason   = pfDetails.banReason;

        // Keep local user memory synchronized
        const idx = (state.allUsers || []).findIndex(u => (u.id && u.id === user.id) || (u.id && u.id === user.id));
        if (idx !== -1) {
          state.allUsers[idx] = { ...state.allUsers[idx], ...user };
        }
      }
    } catch (pfErr) {
      console.warn('[DWM] Supabase internal fetch notice:', pfErr);
    }

    const rawIds        = user.unlockedCharacters || [];
    const unlockedNames = rawIds.length > 0 ? _resolveCharacterNames(rawIds) : [];
    const allCharacters = ['Katsumi', 'Kiko', 'Bee', 'Chyna'];

    console.log('[Kangi] Supabase on-demand details for:', friendlyName, '| rawIds:', rawIds, '| resolved:', unlockedNames);

    el.userDetailsBody.innerHTML = `
      <!-- Hero -->
      <div class="up-hero">
        <div class="up-hero-avatar">
          ${user.avatarUrl ? `<img src="${_esc(user.avatarUrl)}" alt="${_esc(friendlyName)}" />` : initial}
        </div>
        <div class="up-hero-info">
          <h3>${_esc(friendlyName)}</h3>
          <span class="up-hero-email">${_esc(user.email || 'No email')}</span>
          <div class="up-hero-badges">
            ${user.isAdmin   ? '<span class="chip chip--purple">Admin</span>'   : ''}
            ${user.isPremium ? '<span class="chip chip--teal">Premium</span>'   : ''}
            ${user.showLogs  ? '<span class="chip chip--teal">Logs: ON</span>'  : ''}
            ${user.isBanned  ? '<span class="chip chip--red">Banned</span>'     : '<span class="chip chip--green">Active</span>'}
            ${user.isBanned && user.bannedUntil ? `<span class="chip chip--orange" style="font-size:0.65rem;">Until: ${new Date(user.bannedUntil).toLocaleDateString()}</span>` : ''}
            <span class="chip chip--teal" style="font-size:0.65rem;">Database Connected</span>
          </div>
        </div>
      </div>

      <!-- Account info -->
      <div class="up-section">
        <div class="up-section-title">Account Information (Supabase)</div>
        <div class="up-info-grid">
          <div class="up-info-item">
            <span class="up-info-label">Username</span>
            <span class="up-info-value">${_esc(friendlyName)}</span>
          </div>
          <div class="up-info-item">
            <span class="up-info-label">Email</span>
            <span class="up-info-value">${_esc(user.email || '—')}</span>
          </div>
          <div class="up-info-item">
            <span class="up-info-label">User ID</span>
            <span class="up-info-value" style="font-size:0.72rem;word-break:break-all;">${_esc(user.id || '—')}</span>
          </div>
          <div class="up-info-item">
            <span class="up-info-label">Account Status</span>
            <span class="up-info-value">${user.isBanned ? '🔴 Banned' + (user.bannedUntil ? ` (Until ${new Date(user.bannedUntil).toLocaleDateString()})` : ' (Permanent)') : '🟢 Active'}</span>
          </div>
          <div class="up-info-item">
            <span class="up-info-label">Role</span>
            <span class="up-info-value">${user.isAdmin ? '🛡️ Admin' : user.isPremium ? '⭐ Premium' : '👤 Regular'}</span>
          </div>
          <div class="up-info-item">
            <span class="up-info-label">Joined</span>
            <span class="up-info-value">${user.created ? new Date(user.created).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}) : '—'}</span>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="up-section">
        <div class="up-section-title">Quick Actions</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 0;">
          ${!user.isAdmin ? `
            <button class="btn btn-sm btn-primary" onclick="document.getElementById('modalMakeAdminBtn')?.click()" style="font-size:0.78rem;">
              🛡️ Make Admin
            </button>` : `
            <button class="btn btn-sm btn-secondary" onclick="document.getElementById('modalRevokeAdminBtn')?.click()" style="font-size:0.78rem;">
              ❌ Revoke Admin
            </button>`}
          ${!user.isPremium && !user.isBanned ? `
            <button class="btn btn-sm btn-primary" onclick="document.getElementById('modalMakePremiumBtn')?.click()" style="font-size:0.78rem;background:linear-gradient(135deg,#f59e0b,#d97706);">
              ⭐ Make Premium
            </button>` : user.isPremium ? `
            <button class="btn btn-sm btn-secondary" onclick="document.getElementById('modalRevokePremiumBtn')?.click()" style="font-size:0.78rem;">
              ⭐ Revoke Premium
            </button>` : ''}
          ${!user.isBanned ? `
            <button class="btn btn-sm btn-danger" data-modal-ban="1h" style="font-size:0.78rem;">
              🚫 Ban User
            </button>` : `
            <button class="btn btn-sm btn-primary" onclick="document.getElementById('modalUnbanBtn')?.click()" style="font-size:0.78rem;background:#10b981;">
              ✅ Unban
            </button>`}
        </div>
      </div>

      <!-- Characters -->
      <div class="up-section">
        <div class="up-section-title">Unlocked Characters (${rawIds.length} / ${allCharacters.length})</div>
        <div class="up-chars-grid">
          ${allCharacters.map(char => {
            const isUnlocked = unlockedNames.some(n =>
              n.toLowerCase() === char.toLowerCase() ||
              n.toLowerCase().startsWith(char.toLowerCase())
            ) || rawIds.some(id =>
              String(id).toLowerCase().includes(char.toLowerCase())
            );
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
    if (user.id) {
      _loadUserNotifications(user.id, pfDetails.notifications);
    }
  }

  /* ================================================================
     USER NOTIFICATIONS — fetch and render inside the details modal
     ================================================================ */
  async function _loadUserNotifications(playFabId, preloadedNotifs) {
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
      let notifications = Array.isArray(preloadedNotifs) ? preloadedNotifs : null;
      if (!notifications) {
        const res = await KangiService.getNotifications(playFabId);
        notifications = (res && Array.isArray(res.notifications)) ? res.notifications : [];
      }
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
            <span class="msg-from">${_esc(msg.displayName || msg.user_id)}</span>
            <span class="msg-id">${_esc(msg.user_id || '')}</span>
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
