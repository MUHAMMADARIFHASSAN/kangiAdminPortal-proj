/* ============================================================
   service.js — Data & Auth Service Layer
   Mirrors the C# LoginManager + AdminManager flow in JS.
   Title ID: 182E5E (hardcoded, never exposed in UI)
   ============================================================ */

const KangiService = (function () {

  /* ── Config ── */
  const TITLE_ID     = '182E5E';
  const NFT_DATA_KEY = 'GlobalAppNftsMasterList';

  /* ── Session State ── */
  const session = {
    playFabId:   null,
    email:       null,
    displayName: null,
    isAdmin:     false,
    isLoggedIn:  () => !!session.playFabId
  };

  /* ── Boot: set title ── */
  function init() {
    PlayFab.settings.titleId = TITLE_ID;
  }

  /* ============================================================
     AUTH — Login with Email + Password   (mirrors LoginManager.cs)
     1. LoginWithEmailAddress
     2. GetUserData → check IsAdmin key
     3. Resolve with { success, isAdmin, displayName } or reject
     ============================================================ */
  function login(email, password) {
    return new Promise((resolve, reject) => {
      PlayFabClientSDK.LoginWithEmailAddress(
        {
          TitleId:  TITLE_ID,
          Email:    email.trim(),
          Password: password,
          InfoRequestParameters: { GetPlayerProfile: true }
        },
        (result, error) => {
          if (error) {
            reject(_friendlyError(error));
            return;
          }
          /* Store session basics */
          session.playFabId   = result.data.PlayFabId;
          session.email       = email.trim();
          session.displayName = result.data.InfoResultPayload?.PlayerProfile?.DisplayName || '';

          /* Admin check — mirrors AdminManager.CheckAdminStatus() */
          _checkAdminStatus()
            .then(isAdmin => {
              if (!isAdmin) {
                /* Not an admin — clear session, deny access */
                _clearSession();
                reject('Access denied. This account does not have administrator privileges.');
              } else {
                resolve({
                  success:     true,
                  isAdmin:     true,
                  playFabId:   session.playFabId,
                  displayName: session.displayName,
                  email:       session.email
                });
              }
            })
            .catch(() => {
              _clearSession();
              reject('Could not verify account permissions. Please try again.');
            });
        }
      );
    });
  }

  /* ── Admin Status Check  (mirrors AdminManager.cs → GetUserData IsAdmin) ── */
  function _checkAdminStatus() {
    return new Promise((resolve) => {
      PlayFabClientSDK.GetUserData(
        { Keys: ['IsAdmin'] },
        (result, error) => {
          if (error || !result?.data?.Data) {
            session.isAdmin = false;
            resolve(false);
            return;
          }
          const val = result.data.Data?.IsAdmin?.Value ?? '';
          const isAdmin = val.toLowerCase() === 'true';
          session.isAdmin = isAdmin;
          resolve(isAdmin);
        }
      );
    });
  }

  /* ── Logout ── */
  function logout() {
    PlayFabClientSDK.ForgetAllCredentials();
    _clearSession();
  }

  function _clearSession() {
    session.playFabId   = null;
    session.email       = null;
    session.displayName = null;
    session.isAdmin     = false;
  }

  /* ============================================================
     NFT DATA  (mirrors nftQrWorkflow CloudScript handlers)
     ============================================================ */

  /* Call the CloudScript nftQrWorkflow handler */
  function _callNftScript(action, args) {
    return new Promise((resolve, reject) => {
      PlayFabClientSDK.ExecuteCloudScript(
        {
          FunctionName:       'nftQrWorkflow',
          FunctionParameter:  { action, ...args },
          GeneratePlayStreamEvent: true
        },
        (result, error) => {
          if (error) { reject(_friendlyError(error)); return; }
          const fn = result?.data?.FunctionResult;
          if (!fn) { reject('No response from server function.'); return; }
          if (fn.error) { reject(fn.error); return; }
          resolve(fn);
        }
      );
    });
  }

  /* Fetch all NFTs */
  function getNfts() { return _callNftScript('getNfts', {}); }

  /* Publish a new NFT batch */
  function publishNft(nftData) { return _callNftScript('publishNft', { nftData }); }

  /* Redeem a token */
  function redeemToken(token) { return _callNftScript('redeemToken', { token }); }

  /* Wipe all NFT data */
  function clearAll() { return _callNftScript('clearAll', {}); }

  /* ============================================================
     SONGS & MUSIC DATA  (calls videoAppWorkflow)
     ============================================================ */

  /* Call the CloudScript videoAppWorkflow handler */
  function _callVideoScript(action, args) {
    return new Promise((resolve, reject) => {
      PlayFabClientSDK.ExecuteCloudScript(
        {
          FunctionName:       'videoAppWorkflow',
          FunctionParameter:  { action, ...args },
          GeneratePlayStreamEvent: true
        },
        (result, error) => {
          if (error) { reject(_friendlyError(error)); return; }
          const fn = result?.data?.FunctionResult;
          if (!fn) { reject('No response from server function.'); return; }
          let parsed = fn;
          if (typeof fn === 'string') {
            try {
              parsed = JSON.parse(fn);
            } catch (e) {
              reject('Invalid response format.');
              return;
            }
          }
          if (parsed.error) { reject(parsed.error); return; }
          resolve(parsed);
        }
      );
    });
  }

  /* Fetch all pending, approved, and total songs */
  function getSongs() { return _callVideoScript('getSongs', {}); }

  /* Approve a pending song */
  function approveSong(songId) { return _callVideoScript('approveSong', { adminData: { songId } }); }

  /* Update which modes a song appears in, and its trim window (seconds).
     trimEnd of 0 means play to the natural end of the file. */
  function updateSongSettings(songId, modes, trimStart, trimEnd) {
    return _callVideoScript('updateSongSettings', {
      adminData: {
        songId:    songId,
        modes:     Array.isArray(modes) ? modes : [],
        trimStart: Number(trimStart) || 0,
        trimEnd:   Number(trimEnd)   || 0
      }
    });
  }

  /* Delete a song from server catalog */
  function deleteSong(songId) { return _callVideoScript('deleteSong', { adminData: { songId } }); }

  /* ============================================================
     USER MANAGEMENT  (calls adminUserWorkflow)
     ============================================================ */

  /* Internal helper for adminUserWorkflow CloudScript */
  function _callAdminScript(action, args) {
    return new Promise((resolve, reject) => {
      PlayFabClientSDK.ExecuteCloudScript(
        {
          FunctionName:            'adminUserWorkflow',
          FunctionParameter:       { action, ...args },
          GeneratePlayStreamEvent: true
        },
        (result, error) => {
          if (error) { reject(_friendlyError(error)); return; }
          const fn = result?.data?.FunctionResult;
          if (!fn) { reject('No response from server function.'); return; }
          if (fn.error) { reject(fn.error); return; }
          resolve(fn);
        }
      );
    });
  }

  /* Grant admin role — accepts email or playFabId */
  function makeAdmin(email, playFabId)   { return _callAdminScript('makeAdmin',   { email: email || '', playFabId: playFabId || '' }); }

  /* Revoke admin role — accepts email or playFabId */
  function revokeAdmin(email, playFabId) { return _callAdminScript('revokeAdmin', { email: email || '', playFabId: playFabId || '' }); }

  /* Register current user — no-op acknowledgment, kept for compatibility */
  function registerUser() {
    return _callAdminScript('registerUser', {
      email:       session.email       || '',
      displayName: session.displayName || '',
      avatarUrl:   ''
    });
  }

  /* Step 1: Start a PlayFab export for all players in the given segment.
     Returns { exportId, status:'pending' } or { success:false, error } */
  function getAllUsers(segmentId) {
    return _callAdminScript('getAllUsers', {
      segmentId: segmentId || ''
    });
  }

  /* Step 2: Poll/download the export started by getAllUsers.
     Returns { status:'pending' } while processing, or
             { status:'complete', users:[...] } when done. */
  function getExportResult(exportId, segmentId) {
    return _callAdminScript('getExportResult', {
      exportId:  exportId  || '',
      segmentId: segmentId || ''
    });
  }

  /* Ban a user — accepts email, playFabId, and optional duration in days (0 = permanent) */
  function banUser(email, playFabId, durationDays)   { 
    return _callAdminScript('banUser', { 
      email: email || '', 
      playFabId: playFabId || '',
      durationDays: durationDays !== undefined ? durationDays : 0
    }); 
  }

  /* Get user's unlocked characters from their regular UserData (Player Data).
     Uses a CloudScript call so we can read another player's data server-side.
     Returns raw NFT IDs — the caller resolves names using the NFT library.   */
  function getUserCharacters(playFabId) {
    return new Promise((resolve) => {
      PlayFabClientSDK.ExecuteCloudScript(
        {
          FunctionName:       'adminUserWorkflow',
          FunctionParameter:  { action: 'getPlayerCharacters', playFabId: playFabId || '' },
          GeneratePlayStreamEvent: false
        },
        (result, error) => {
          if (error || !result?.data?.FunctionResult) {
            resolve({ unlockedCharacters: [] });
            return;
          }
          const fn = result.data.FunctionResult;
          resolve({ unlockedCharacters: Array.isArray(fn.unlockedCharacters) ? fn.unlockedCharacters : [] });
        }
      );
    });
  }

  /* Unban a user — accepts email or playFabId */
  function unbanUser(email, playFabId) { return _callAdminScript('unbanUser', { email: email || '', playFabId: playFabId || '' }); }

  /* Premium — grants or revokes the ability to upload music. Sets IsPremium in
     the player's PlayFab UserData, which the Unity client reads before showing
     the upload screen. */
  function makePremium(email, playFabId)   { return _callAdminScript('makePremium',   { email: email || '', playFabId: playFabId || '' }); }
  function revokePremium(email, playFabId) { return _callAdminScript('revokePremium', { email: email || '', playFabId: playFabId || '' }); }

  /* ============================================================
     IMAGE UTIL — resize + compress before storing
     ============================================================ */
  function resizeImage(file, maxWidth = 240) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.55));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ── Error Helper (mirrors GetFriendlyError in C#) ── */
  function _friendlyError(err) {
    const code = err?.errorCode ?? err?.error ?? '';
    const msg  = err?.errorMessage ?? err?.message ?? 'An unexpected error occurred.';
    const map  = {
      1001: 'Invalid email address.',
      1002: 'Incorrect password. Please try again.',
      1009: 'No account found with this email address.',
      1246: 'This email is already registered.',
      1212: 'Incorrect email or password.'
    };
    return map[code] || msg;
  }

  /* Fetch all notifications for a given PlayFab ID (admin reading another player's list) */
  function getNotifications(targetPlayFabId) {
    return new Promise((resolve, reject) => {
      PlayFabClientSDK.ExecuteCloudScript(
        {
          FunctionName:            'notificationWorkflow',
          FunctionParameter:       {
            action:          'getNotifications',
            targetPlayFabId: targetPlayFabId
          },
          GeneratePlayStreamEvent: false
        },
        (result, error) => {
          if (error) { reject(_friendlyError(error)); return; }
          const fn = result?.data?.FunctionResult;
          if (!fn) { reject('No response from server.'); return; }
          if (fn.error) { reject(fn.error); return; }
          resolve(fn);
        }
      );
    });
  }

  /* Send a custom notification to a user by PlayFab ID */
  function sendNotification(targetPlayFabId, title, message, type, data) {
    return new Promise((resolve, reject) => {
      if (!targetPlayFabId) {
        resolve({ success: false, error: 'No PlayFab ID provided for notification target.' });
        return;
      }
      PlayFabClientSDK.ExecuteCloudScript(
        {
          FunctionName:            'notificationWorkflow',
          FunctionParameter:       {
            action:          'sendNotification',
            targetPlayFabId: targetPlayFabId,
            title:           title,
            message:         message,
            type:            type  || 'info',
            data:            data  || {}
          },
          GeneratePlayStreamEvent: true
        },
        (result, error) => {
          if (error) { reject(_friendlyError(error)); return; }
          const fn = result?.data?.FunctionResult;
          if (!fn) { resolve({ success: false, error: 'No response from server.' }); return; }
          // fn.error means a handled server-side failure — resolve so caller can show it
          if (fn.error && !fn.success) { resolve({ success: false, error: fn.error }); return; }
          resolve(fn);
        }
      );
    });
  }

  /* ── Support / Admin Inbox ── */
  function _callSupportScript(action, args) {
    return new Promise((resolve, reject) => {
      PlayFabClientSDK.ExecuteCloudScript(
        {
          FunctionName:            'supportWorkflow',
          FunctionParameter:       { action, ...args },
          GeneratePlayStreamEvent: true
        },
        (result, error) => {
          if (error) {
            console.error('[DWM] supportWorkflow error:', error);
            reject(_friendlyError(error));
            return;
          }
          // FunctionResult can be an object or a JSON string depending on SDK version
          let fn = result?.data?.FunctionResult;
          console.log('[DWM] supportWorkflow raw result:', JSON.stringify(fn));
          if (!fn) { resolve({ success: false, messages: [], error: 'No response from server.' }); return; }
          if (typeof fn === 'string') {
            try { fn = JSON.parse(fn); } catch (e) {
              resolve({ success: false, messages: [], error: 'Invalid server response.' });
              return;
            }
          }
          // Don't reject on server-side errors — resolve so caller can handle gracefully
          resolve(fn);
        }
      );
    });
  }

  /* Get all user support messages (admin only) */
  function getSupportMessages() { return _callSupportScript('getMessages', {}); }

  /* Reply to a support message */
  function replyToMessage(messageId, reply) {
    return _callSupportScript('replyMessage', { messageId, reply });
  }

  /* Delete a support message */
  function deleteSupportMessage(messageId) {
    return _callSupportScript('deleteMessage', { messageId });
  }

  /* ============================================================
     CLOUDINARY CDN — Upload images to cloud storage
     Cloud Name:     djgvzbxvt
     Upload Preset:  Community_Feed  (unsigned)
     ============================================================ */

  const CLOUDINARY_DEFAULTS = {
    cloudName:    'djgvzbxvt',
    uploadPreset: 'Community_Feed'
  };

  /* Get Cloudinary config — localStorage override, falls back to hardcoded defaults */
  function getCloudinaryConfig() {
    try {
      const saved = localStorage.getItem('kangi_cloudinary_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.cloudName && parsed.uploadPreset) return parsed;
      }
    } catch (e) {}
    // Always return defaults so the app works out of the box
    return CLOUDINARY_DEFAULTS;
  }

  /* Save Cloudinary config to localStorage */
  function saveCloudinaryConfig(cloudName, uploadPreset) {
    try {
      localStorage.setItem('kangi_cloudinary_config', JSON.stringify({ cloudName, uploadPreset }));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* Upload file to Cloudinary using unsigned upload
     Returns { success: true, url: "https://..." } or { success: false, error: "..." } */
  function uploadToCloudinary(file) {
    return new Promise((resolve) => {
      const config = getCloudinaryConfig();
      if (!config) {
        resolve({ success: false, error: 'Cloudinary not configured. Go to Settings → TCG Image Storage and enter your credentials.' });
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', config.uploadPreset);

      const uploadUrl = `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`;

      fetch(uploadUrl, { method: 'POST', body: formData })
        .then(response => {
          if (!response.ok) {
            return response.text().then(text => {
              throw new Error(`Upload failed: ${response.status} ${text.substring(0, 100)}`);
            });
          }
          return response.json();
        })
        .then(data => {
          if (data.secure_url) {
            resolve({ success: true, url: data.secure_url });
          } else {
            resolve({ success: false, error: 'No URL returned from Cloudinary.' });
          }
        })
        .catch(err => {
          resolve({ success: false, error: err.message || 'Upload failed.' });
        });
    });
  }

  /* ============================================================
     FIREBASE SERVICE — Player List Source
     Fetches player list from Cloud Firestore or Realtime Database.
     ============================================================ */

  const FIREBASE_CONFIG_KEY = 'kangi_firebase_config';

  const DEFAULT_FIREBASE_CONFIG = {
    apiKey:            "AIzaSyBArP6gJqVhhdDTZ2XLINBYIvPMmON7EFM",
    authDomain:        "dance-withmii.firebaseapp.com",
    projectId:         "dance-withmii",
    storageBucket:     "dance-withmii.firebasestorage.app",
    messagingSenderId: "227901605532",
    appId:             "1:227901605532:web:a01759182a1d1546db4f59",
    measurementId:     "G-ZPTK46HEBC",
    dbType:            "firestore",
    collectionName:    "users",
    adminEmail:        "alisiyal2764@gmail.com",
    adminPassword:     "Kasahn@1"
  };

  /* Default or saved Firebase Config */
  function getFirebaseConfig() {
    try {
      const saved = localStorage.getItem(FIREBASE_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.projectId || parsed.apiKey) {
          // Only let saved keys with a real value win. A config saved from the
          // Settings form before the admin credentials were hardcoded stores
          // them as "", which would otherwise clobber the defaults below.
          const overrides = {};
          Object.keys(parsed).forEach(k => {
            if (parsed[k] !== '' && parsed[k] !== null && parsed[k] !== undefined) {
              overrides[k] = parsed[k];
            }
          });
          return { ...DEFAULT_FIREBASE_CONFIG, ...overrides };
        }
      }
    } catch (e) {
      console.warn('[Firebase] Failed to parse saved config:', e);
    }
    return DEFAULT_FIREBASE_CONFIG;
  }

  /* Save Firebase Config */
  function saveFirebaseConfig(config) {
    try {
      if (!config) {
        localStorage.removeItem(FIREBASE_CONFIG_KEY);
        return true;
      }
      localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
      // Drop any cached session so edited credentials take effect immediately.
      _adminAuthPromise = null;
      try {
        if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
          firebase.auth().signOut();
        }
      } catch (eSignOut) {}
      // Re-init if SDK available
      initFirebase(config);
      return true;
    } catch (e) {
      console.error('[Firebase] Save config error:', e);
      return false;
    }
  }

  /* Initialize Firebase App instance */
  let _firebaseApp = null;
  function initFirebase(customConfig) {
    if (typeof firebase === 'undefined') {
      console.warn('[Firebase] Firebase SDK not loaded in window.');
      return null;
    }
    const config = customConfig || getFirebaseConfig();
    if (!config || (!config.apiKey && !config.projectId)) {
      return null;
    }
    try {
      if (firebase.apps && firebase.apps.length > 0) {
        // Find or delete existing default app if config changed
        _firebaseApp = firebase.apps[0];
      } else {
        _firebaseApp = firebase.initializeApp({
          apiKey:            config.apiKey,
          authDomain:        config.authDomain || (config.projectId ? `${config.projectId}.firebaseapp.com` : undefined),
          projectId:         config.projectId,
          storageBucket:     config.storageBucket || (config.projectId ? `${config.projectId}.appspot.com` : undefined),
          messagingSenderId: config.messagingSenderId,
          appId:             config.appId,
          databaseURL:       config.databaseURL
        });
      }
      return _firebaseApp;
    } catch (err) {
      console.error('[Firebase] initFirebase error:', err);
      return null;
    }
  }

  /* Sign in to Firebase Auth as the admin.

     Firestore rules scope the players collection to known uids, so an
     unauthenticated read is rejected. Resolves to the signed-in user, or throws
     with a message the settings panel can surface. */
  let _adminAuthPromise = null;
  async function ensureFirebaseAuth(config) {
    const cfg = config || getFirebaseConfig();
    if (typeof firebase === 'undefined' || !firebase.auth) {
      throw new Error('Firebase Auth SDK is not loaded.');
    }

    // The app must exist before firebase.auth() is usable — callers reaching
    // here directly (e.g. the post-login card check) may be the first to touch it.
    initFirebase(cfg);

    const current = firebase.auth().currentUser;
    if (current) return current;

    if (!cfg.adminEmail || !cfg.adminPassword) {
      throw new Error('Firebase admin sign-in is not configured. Add the admin email and password in Settings.');
    }

    // Collapse concurrent callers onto one sign-in round trip.
    if (!_adminAuthPromise) {
      _adminAuthPromise = firebase.auth()
        .signInWithEmailAndPassword(cfg.adminEmail, cfg.adminPassword)
        .then(cred => cred.user)
        .catch(err => {
          _adminAuthPromise = null;
          throw new Error('Firebase admin sign-in failed: ' + (err.message || err.code || 'unknown error'));
        });
    }
    return _adminAuthPromise;
  }

  /* Opportunistic Firebase sign-in using the SAME credentials the admin just
     used to log into this dashboard (PlayFab). The two systems are separate —
     Firebase Auth was provisioned with a matching email, but there is no
     guarantee the passwords match, so this is a convenience, not a dependency.

     On success: Settings never needs to be touched, on any device, by any
     admin who shares this login. On failure: swallowed entirely. Dashboard
     login has already succeeded by the time this runs, so a Firebase mismatch
     must never surface as a login error — the existing Settings flow remains
     the fallback. Nothing here is written to localStorage. */
  async function tryAutoFirebaseAuth(email, password) {
    try {
      if (typeof firebase === 'undefined' || !firebase.auth) return false;
      initFirebase(getFirebaseConfig());
      if (firebase.auth().currentUser) return true;

      await firebase.auth().signInWithEmailAndPassword(email, password);
      return true;
    } catch (err) {
      console.log('[Firebase] Auto sign-in did not match dashboard credentials — Settings will be needed.', err.code || err.message);
      return false;
    }
  }

  /* Test connection to Firebase */
  async function testFirebaseConnection(config) {
    const app = initFirebase(config);
    if (!app && typeof firebase === 'undefined') {
      return { success: false, error: 'Firebase SDK is not available in browser.' };
    }
    const cfg = config || getFirebaseConfig();
    if (!cfg || (!cfg.apiKey && !cfg.projectId)) {
      return { success: false, error: 'Firebase configuration is empty. Please enter Project ID and API Key.' };
    }

    const dbType = cfg.dbType || 'firestore';
    const collectionName = (cfg.collectionName || 'users').trim();

    try {
      await ensureFirebaseAuth(cfg);

      if (dbType === 'rtdb') {
        if (!cfg.databaseURL) {
          return { success: false, error: 'Realtime Database requires a Database URL (e.g. https://<project>.firebaseio.com).' };
        }
        const db = firebase.database();
        const snapshot = await db.ref(collectionName).limitToFirst(5).once('value');
        const count = snapshot.numChildren ? snapshot.numChildren() : 0;
        return { success: true, message: `Connected to Realtime Database successfully! Found ${count} record(s).` };
      } else {
        const db = firebase.firestore();
        const snapshot = await db.collection(collectionName).limit(5).get();
        return { success: true, message: `Connected to Cloud Firestore successfully! Found ${snapshot.size} document(s) in "${collectionName}".` };
      }
    } catch (err) {
      console.error('[Firebase] Connection test error:', err);
      return { success: false, error: err.message || 'Failed to connect to Firebase.' };
    }
  }

  /* Fetch all player records from Firebase and normalize structure */
  async function getFirebaseUsers() {
    const cfg = getFirebaseConfig();
    if (!cfg || (!cfg.apiKey && !cfg.projectId)) {
      console.log('[Firebase] No Firebase config saved, falling back to live PlayFab registry.');
      const pfResult = await getAllUsers();
      if (pfResult && pfResult.status === 'complete' && Array.isArray(pfResult.users)) {
        return {
          source: 'playfab-fallback',
          users: pfResult.users,
          isFallback: true
        };
      }
      return { source: 'none', users: [], isFallback: true };
    }

    const app = initFirebase(cfg);
    if (!app && typeof firebase === 'undefined') {
      throw new Error('Firebase SDK is not loaded.');
    }

    await ensureFirebaseAuth(cfg);

    const dbType = cfg.dbType || 'firestore';
    const collectionName = (cfg.collectionName || 'users').trim();
    let rawList = [];

    if (dbType === 'rtdb') {
      const db = firebase.database();
      const snapshot = await db.ref(collectionName).once('value');
      const val = snapshot.val();
      if (val) {
        if (Array.isArray(val)) {
          rawList = val.filter(Boolean);
        } else if (typeof val === 'object') {
          rawList = Object.keys(val).map(key => ({ _fbKey: key, ...val[key] }));
        }
      }
    } else {
      const db = firebase.firestore();
      const snapshot = await db.collection(collectionName).get();
      snapshot.forEach(doc => {
        rawList.push({ _fbDocId: doc.id, ...doc.data() });
      });
    }

    // Normalize each user record
    const normalizedUsers = rawList.map(item => {
      const playFabId = item.playFabId || item.PlayFabId || item.playfabId || item.playfab_id || item.uid || item.userId || item._fbDocId || item._fbKey || '';
      const displayName = item.displayName || item.DisplayName || item.name || item.Name || item.playerName || item.player_name || item.username || item.userName || '';
      const email = item.email || item.Email || item.userEmail || '';
      const avatarUrl = item.avatarUrl || item.avatar || item.photoURL || item.photoUrl || item.image || item.imageUrl || '';
      const isBanned = !!(item.isBanned || item.banned || item.banStatus);
      const isAdmin = !!(item.isAdmin || item.admin || item.is_admin);
      const created = item.createdAt || item.created || item.joined || item.created_at || null;
      const lastLogin = item.lastLogin || item.last_login || item.lastSeen || item.updatedAt || null;

      return {
        playFabId: String(playFabId),
        displayName: displayName || (email ? email.split('@')[0] : (playFabId ? 'Player ' + String(playFabId).slice(-4) : 'Player')),
        email: email,
        username: item.username || '',
        avatarUrl: avatarUrl,
        isBanned: isBanned,
        isAdmin: isAdmin,
        created: created ? (typeof created === 'object' && created.toDate ? created.toDate().toISOString() : created) : null,
        lastLogin: lastLogin ? (typeof lastLogin === 'object' && lastLogin.toDate ? lastLogin.toDate().toISOString() : lastLogin) : null,
        unlockedCharacters: Array.isArray(item.unlockedCharacters) ? item.unlockedCharacters : [],
        rawFirebaseData: item
      };
    });

    // Sort alphabetically by displayName / name
    normalizedUsers.sort((a, b) => {
      const nameA = (a.displayName || a.username || a.email || '').toLowerCase();
      const nameB = (b.displayName || b.username || b.email || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return {
      source: 'firebase',
      collection: collectionName,
      dbType: dbType,
      users: normalizedUsers,
      isFallback: false
    };
  }

  /* Fetch comprehensive internal details on-demand via PlayFab API */
  async function getPlayFabUserDetails(playFabId) {
    if (!playFabId) {
      return { success: false, error: 'No PlayFab ID provided.' };
    }

    try {
      const [charRes, notifRes] = await Promise.allSettled([
        getUserCharacters(playFabId),
        getNotifications(playFabId)
      ]);

      const unlockedCharacters = (charRes.status === 'fulfilled' && charRes.value && Array.isArray(charRes.value.unlockedCharacters))
        ? charRes.value.unlockedCharacters
        : [];

      const notifications = (notifRes.status === 'fulfilled' && notifRes.value && Array.isArray(notifRes.value.notifications))
        ? notifRes.value.notifications
        : [];

      return {
        success: true,
        playFabId,
        unlockedCharacters,
        notifications
      };
    } catch (err) {
      console.error('[PlayFab] Error fetching internal details for', playFabId, err);
      return {
        success: false,
        playFabId,
        unlockedCharacters: [],
        notifications: [],
        error: err?.message || 'Failed to fetch PlayFab internal data.'
      };
    }
  }

  /* ── Public API ── */
  return {
    init,
    login,
    logout,
    session,
    getNfts,
    publishNft,
    redeemToken,
    clearAll,
    resizeImage,
    getSongs,
    approveSong,
    deleteSong,
    updateSongSettings,
    makeAdmin,
    revokeAdmin,
    registerUser,
    getAllUsers,
    getExportResult,
    banUser,
    unbanUser,
    makePremium,
    revokePremium,
    getUserCharacters,
    sendNotification,
    getNotifications,
    getSupportMessages,
    replyToMessage,
    deleteSupportMessage,
    getCloudinaryConfig,
    saveCloudinaryConfig,
    uploadToCloudinary,
    // Firebase & PlayFab Deep Fetch APIs
    getFirebaseConfig,
    saveFirebaseConfig,
    initFirebase,
    testFirebaseConnection,
    ensureFirebaseAuth,
    tryAutoFirebaseAuth,
    getFirebaseUsers,
    getPlayFabUserDetails
  };

})();

