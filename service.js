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

  /* Register current user into the shared registry (call on every login) */
  function registerUser() {
    return _callAdminScript('registerUser', {
      email:       session.email       || '',
      displayName: session.displayName || '',
      avatarUrl:   ''
    });
  }

  /* Fetch all registered users from registry */
  function getAllUsers() { return _callAdminScript('getAllUsers', {}); }

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
          if (!fn) { reject('No response from server.'); return; }
          if (fn.error) { reject(fn.error); return; }
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
          if (error) { reject(_friendlyError(error)); return; }
          // FunctionResult can be an object or a JSON string depending on the SDK version
          let fn = result?.data?.FunctionResult;
          if (!fn) { reject('No response from server.'); return; }
          if (typeof fn === 'string') {
            try { fn = JSON.parse(fn); } catch (e) { reject('Invalid server response.'); return; }
          }
          if (fn.error && !fn.success) { reject(fn.error); return; }
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
        resolve({ success: false, error: 'Cloudinary not configured. Go to Settings → NFT Image Storage and enter your credentials.' });
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
    makeAdmin,
    revokeAdmin,
    registerUser,
    getAllUsers,
    banUser,
    unbanUser,
    getUserCharacters,
    sendNotification,
    getNotifications,
    getSupportMessages,
    replyToMessage,
    deleteSupportMessage,
    getCloudinaryConfig,
    saveCloudinaryConfig,
    uploadToCloudinary
  };

})();
