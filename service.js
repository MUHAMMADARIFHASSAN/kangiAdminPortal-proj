/* ============================================================
   service.js -- Supabase Data & Auth Service Layer
   Project: https://hjmqwvcivejmtuwofras.supabase.co
   ============================================================ */

const KangiService = (function () {

  /* -- Supabase Config -- */
  const SUPABASE_URL  = 'https://hjmqwvcivejmtuwofras.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbXF3dmNpdmVqbXR1d29mcmFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5MTQxMTIsImV4cCI6MjExMDQ5MDExMn0.z3iRrAHGT3d-psIwMrEAMVIXqXV4pKYV_gYi0ZNqRBY';

  /* -- Session State -- */
  const session = {
    userId:       null,
    email:        null,
    displayName:  null,
    avatarUrl:    null,
    isAdmin:      false,
    accessToken:  null,
    refreshToken: null,
    isLoggedIn:   function() { return !!session.accessToken; }
  };

  /* -- HTTP helpers -- */
  function _headers(extra) {
    var h = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON
    };
    if (session.accessToken) h['Authorization'] = 'Bearer ' + session.accessToken;
    if (extra) Object.assign(h, extra);
    return h;
  }

  async function _post(path, body, auth) {
    var headers = { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON };
    if (auth && session.accessToken) headers['Authorization'] = 'Bearer ' + session.accessToken;
    var res = await fetch(SUPABASE_URL + path, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
    var json = await res.json().catch(function() { return {}; });
    if (!res.ok) throw new Error(json.message || json.error_description || json.msg || ('HTTP ' + res.status));
    return json;
  }

  async function _get(path, params) {
    params = params || {};
    var url = new URL(SUPABASE_URL + '/rest/v1' + path);
    Object.entries(params).forEach(function(kv) { url.searchParams.set(kv[0], kv[1]); });
    var res = await fetch(url.toString(), { headers: _headers() });
    var json = await res.json().catch(function() { return []; });
    if (!res.ok) throw new Error((json && json.message) || ('HTTP ' + res.status));
    return json;
  }

  async function _patch(path, body) {
    var res = await fetch(SUPABASE_URL + '/rest/v1' + path, {
      method: 'PATCH',
      headers: Object.assign({}, _headers(), { 'Prefer': 'return=representation' }),
      body: JSON.stringify(body)
    });
    var json = await res.json().catch(function() { return {}; });
    if (!res.ok) throw new Error((json && json.message) || ('HTTP ' + res.status));
    return json;
  }

  async function _delete(path) {
    var res = await fetch(SUPABASE_URL + '/rest/v1' + path, {
      method: 'DELETE',
      headers: _headers()
    });
    if (!res.ok) {
      var json = await res.json().catch(function() { return {}; });
      throw new Error((json && json.message) || ('HTTP ' + res.status));
    }
    return true;
  }

  async function _rpc(fn, body) {
    body = body || {};
    var res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: _headers(),
      body: JSON.stringify(body)
    });
    var json = await res.json().catch(function() { return {}; });
    if (!res.ok) throw new Error((json && (json.message || json.hint)) || ('HTTP ' + res.status));
    return json;
  }

  /* ============================================================
     AUTH
     ============================================================ */
  async function login(email, password) {
    var data = await _post('/auth/v1/token?grant_type=password', {
      email: email.trim(),
      password: password
    });

    session.accessToken  = data.access_token;
    session.refreshToken = data.refresh_token;
    session.userId       = data.user && data.user.id;
    session.email        = email.trim();

    var rows = await _get('/profiles', {
      'id':     'eq.' + session.userId,
      'select': 'display_name,avatar_url,is_admin,is_banned'
    });
    var profile = (rows && rows[0]) || {};

    if (!profile.is_admin) {
      await logout();
      throw new Error('Access denied. This account does not have administrator privileges.');
    }

    session.displayName = profile.display_name || email.split('@')[0];
    session.avatarUrl   = profile.avatar_url   || '';
    session.isAdmin     = true;

    return {
      success:     true,
      isAdmin:     true,
      userId:      session.userId,
      displayName: session.displayName,
      avatarUrl:   session.avatarUrl,
      email:       session.email
    };
  }

  async function logout() {
    try {
      if (session.accessToken) {
        await fetch(SUPABASE_URL + '/auth/v1/logout', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + session.accessToken }
        });
      }
    } catch(e) {}
    session.userId = session.email = session.displayName = session.avatarUrl = null;
    session.accessToken = session.refreshToken = null;
    session.isAdmin = false;
  }

  async function sendAccountRecoveryEmail(email) {
    if (!email || !email.trim()) throw new Error('Please enter your email address.');
    await _post('/auth/v1/recover', { email: email.trim() });
    return { success: true, message: 'Password reset link sent! Please check your inbox.' };
  }

  function restoreSession() { return null; }

  function getAdminIdentity() {
    return {
      userId:      session.userId      || '',
      displayName: session.displayName || (session.email ? session.email.split('@')[0] : '') || 'Dashboard Admin',
      avatarUrl:   session.avatarUrl   || '',
      email:       session.email       || ''
    };
  }

  /* ============================================================
     SONGS
     ============================================================ */
  function _rowToSongData(row) {
    return {
      SongId:       row.id,
      songTitle:    row.title,
      Singer:       row.artist,
      SongUrl:      row.url,
      songLink:     row.url,
      coverImageUrl:row.cover_url,
      uploadDate:   row.created_at,
      isPending:    row.status === 'pending',
      uploaderName: row.uploader_name,
      avatarUrl:    row.avatar_url,
      modes:        row.modes || [],
      trimStart:    row.trim_start || 0,
      trimEnd:      row.trim_end   || 0
    };
  }

  async function getSongs() {
    var results = await Promise.all([
      _get('/songs', { 'status': 'eq.approved', 'order': 'created_at.desc', 'select': '*' }),
      _get('/songs', { 'status': 'eq.pending',  'order': 'created_at.desc', 'select': '*' })
    ]);
    var approved = results[0] || [];
    var pending  = results[1] || [];

    var approvedSongs = approved.map(_rowToSongData);
    var pendingSongs  = pending.map(_rowToSongData);
    var songs = pendingSongs.concat(approvedSongs);

    return {
      success:      true,
      songs:        songs,
      approvedSongs:approvedSongs,
      pendingSongs: pendingSongs
    };
  }

  async function approveSong(songId) {
    await _patch('/songs?id=eq.' + songId, { status: 'approved' });
    return { success: true };
  }

  async function deleteSong(songId) {
    await _delete('/songs?id=eq.' + songId);
    return { success: true };
  }

  async function updateSongSettings(songId, modes, tsStart, tsEnd) {
    await _patch('/songs?id=eq.' + songId, {
      modes:      Array.isArray(modes) ? modes : [],
      trim_start: Number(tsStart) || 0,
      trim_end:   Number(tsEnd)   || 0
    });
    return { success: true };
  }

  async function addSong(songData, autoApprove) {
    if (autoApprove === undefined) autoApprove = true;
    var identity = getAdminIdentity();
    var payload = {
      title:         songData.songTitle || songData.title || '',
      artist:        songData.Singer    || songData.artist || '',
      url:           songData.SongUrl   || songData.url   || '',
      cover_url:     songData.coverImageUrl || songData.cover_url || '',
      status:        autoApprove ? 'approved' : 'pending',
      submitted_by:  session.userId,
      uploader_name: identity.displayName,
      avatar_url:    identity.avatarUrl,
      modes:         Array.isArray(songData.modes) ? songData.modes : [],
      trim_start:    Number(songData.trimStart) || 0,
      trim_end:      Number(songData.trimEnd)   || 0
    };
    var res = await fetch(SUPABASE_URL + '/rest/v1/songs', {
      method: 'POST',
      headers: Object.assign({}, _headers(), { 'Prefer': 'return=representation' }),
      body: JSON.stringify(payload)
    });
    var json = await res.json().catch(function() { return {}; });
    if (!res.ok) throw new Error((json && json.message) || ('HTTP ' + res.status));
    return { success: true, approved: autoApprove };
  }

  /* ============================================================
     USER MANAGEMENT
     ============================================================ */
  async function getAllUsers() {
    try {
      var rows = await _get('/admin_users', {
        'select': 'id,email,display_name,avatar_url,is_admin,is_banned,is_premium,banned_until,created_at,last_sign_in_at',
        'order':  'created_at.desc'
      });
      return { success: true, users: rows || [] };
    } catch(e) {
      var rows2 = await _get('/profiles', {
        'select': 'id,display_name,avatar_url,is_admin,is_banned,is_premium,banned_until,created_at',
        'order':  'created_at.desc'
      });
      return { success: true, users: rows2 || [] };
    }
  }

  async function getUserDataFlags(userId) {
    var rows = await _get('/profiles', {
      'id':     'eq.' + userId,
      'select': 'is_admin,is_banned,is_premium,banned_until'
    });
    if (!rows || rows.length === 0) return { success: false, error: 'User not found.' };
    return Object.assign({ success: true }, rows[0]);
  }

  async function makeAdmin(email, userId) {
    if (!userId) throw new Error('User ID required.');
    await _rpc('set_admin_status', { target_user: userId, new_is_admin: true });
    return { success: true };
  }

  async function revokeAdmin(email, userId) {
    if (!userId) throw new Error('User ID required.');
    await _rpc('set_admin_status', { target_user: userId, new_is_admin: false });
    return { success: true };
  }

  async function makePremium(email, userId) {
    if (!userId) throw new Error('User ID required.');
    await _rpc('set_premium_status', { target_user: userId, new_is_premium: true });
    return { success: true };
  }

  async function revokePremium(email, userId) {
    if (!userId) throw new Error('User ID required.');
    await _rpc('set_premium_status', { target_user: userId, new_is_premium: false });
    return { success: true };
  }

  async function banUser(email, userId, durationDays) {
    if (!userId) throw new Error('User ID required.');
    durationDays = durationDays || 0;
    var expiry = durationDays > 0
      ? new Date(Date.now() + durationDays * 86400000).toISOString()
      : null;
    await _rpc('ban_user', { target_user: userId, reason: 'Banned by admin.', expiry: expiry });
    return { success: true };
  }

  async function unbanUser(email, userId) {
    if (!userId) throw new Error('User ID required.');
    await _rpc('unban_user', { target_user: userId });
    return { success: true };
  }

  async function getUserCharacters(userId) {
    var rows = await _get('/unlocked_characters', {
      'user_id': 'eq.' + userId,
      'select':  'character_id'
    });
    return { unlockedCharacters: (rows || []).map(function(r) { return r.character_id; }) };
  }

  /* ============================================================
     VIDEOS
     ============================================================ */
  async function getVideos() {
    var rows = await _get('/videos', { 'select': '*', 'order': 'created_at.desc' });
    return { success: true, videos: rows || [] };
  }

  async function deleteVideo(videoId) {
    await _delete('/videos?id=eq.' + videoId);
    return { success: true };
  }

  /* ============================================================
     NOTIFICATIONS
     ============================================================ */
  async function getNotifications(targetUserId) {
    var rows = await _get('/notifications', {
      'user_id': 'eq.' + targetUserId,
      'order':   'created_at.desc',
      'select':  '*'
    });
    return { success: true, notifications: rows || [] };
  }

  async function sendNotification(targetUserId, title, message, type) {
    type = type || 'info';
    if (!targetUserId) return { success: false, error: 'No user ID provided.' };
    await _rpc('send_notification', {
      target_user: targetUserId,
      notif_title: title,
      notif_body:  message,
      notif_type:  type
    });
    return { success: true };
  }

  async function broadcastNotification(title, message, type) {
    type = type || 'general';
    await _rpc('send_notification', {
      target_user: null,
      notif_title: title,
      notif_body:  message,
      notif_type:  type
    });
    return { success: true };
  }

  /* ============================================================
     SUPPORT MESSAGES
     ============================================================ */
  async function getSupportMessages() {
    var rows = await _get('/support_messages', {
      'order':  'created_at.desc',
      'select': '*'
    });
    return { success: true, messages: rows || [] };
  }

  async function replyToMessage(messageId, reply) {
    await _rpc('reply_to_support_message', { message_id: messageId, reply_text: reply });
    return { success: true };
  }

  async function deleteSupportMessage(messageId) {
    await _delete('/support_messages?id=eq.' + messageId);
    return { success: true };
  }

  /* ============================================================
     UNLOCK CODES / QR
     ============================================================ */
  async function getUnlockCodes() {
    var rows = await _get('/unlock_codes', {
      'order':  'is_redeemed.asc,code.asc',
      'select': '*'
    });
    return { success: true, codes: rows || [] };
  }

  async function insertUnlockCode(code, characterId, characterName) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/unlock_codes', {
      method: 'POST',
      headers: Object.assign({}, _headers(), { 'Prefer': 'return=representation' }),
      body: JSON.stringify({ code: code, character_id: characterId, character_name: characterName, is_redeemed: false })
    });
    var json = await res.json().catch(function() { return {}; });
    if (!res.ok) throw new Error((json && json.message) || ('HTTP ' + res.status));
    return { success: true };
  }

  async function deleteUnlockCode(code) {
    await _delete('/unlock_codes?code=eq.' + encodeURIComponent(code));
    return { success: true };
  }

  /* ============================================================
     NFT / TCG BATCHES
     ============================================================ */
  async function publishNft(nftObj) {
    var batchPayload = {
      id:           nftObj.id,
      name:         nftObj.name        || '',
      description:  nftObj.description || '',
      image:        nftObj.image       || '',
      character_id: nftObj.name        || nftObj.id,
      created_by:   session.userId
    };

    var batchRes = await fetch(SUPABASE_URL + '/rest/v1/tcg_batches', {
      method: 'POST',
      headers: Object.assign({}, _headers(), { 'Prefer': 'return=minimal' }),
      body: JSON.stringify(batchPayload)
    });
    if (!batchRes.ok) {
      var e1 = await batchRes.json().catch(function() { return {}; });
      throw new Error((e1 && e1.message) || ('Batch insert failed: HTTP ' + batchRes.status));
    }

    var codes = (nftObj.codes || []).map(function(c) {
      return {
        code:           c.token,
        character_id:   batchPayload.character_id,
        character_name: nftObj.name,
        is_redeemed:    false,
        batch_id:       nftObj.id,
        serial:         c.serial || '',
        redeem_url:     c.url    || ''
      };
    });

    if (codes.length > 0) {
      var codesRes = await fetch(SUPABASE_URL + '/rest/v1/unlock_codes', {
        method: 'POST',
        headers: Object.assign({}, _headers(), { 'Prefer': 'return=minimal' }),
        body: JSON.stringify(codes)
      });
      if (!codesRes.ok) {
        var e2 = await codesRes.json().catch(function() { return {}; });
        throw new Error((e2 && e2.message) || ('Codes insert failed: HTTP ' + codesRes.status));
      }
    }

    return { success: true, id: nftObj.id };
  }

  async function getNfts() {
    var batches = await _get('/tcg_batches', {
      'order': 'created_at.desc', 'select': '*'
    }).catch(function() { return []; });

    if (!batches || batches.length === 0) return { success: true, nfts: [] };

    var batchIds = batches.map(function(b) { return b.id; }).join(',');
    var allCodes = await _get('/unlock_codes', {
      'batch_id': 'in.(' + batchIds + ')',
      'select':   'code,serial,redeem_url,is_redeemed,redeemed_at,batch_id'
    }).catch(function() { return []; });

    var codesByBatch = {};
    (allCodes || []).forEach(function(c) {
      if (!codesByBatch[c.batch_id]) codesByBatch[c.batch_id] = [];
      codesByBatch[c.batch_id].push({
        token:      c.code,
        serial:     c.serial     || '',
        url:        c.redeem_url || '',
        redeemed:   c.is_redeemed,
        redeemedAt: c.redeemed_at || null
      });
    });

    var nfts = batches.map(function(b) {
      return {
        id:          b.id,
        name:        b.name,
        description: b.description,
        image:       b.image,
        createdAt:   b.created_at,
        codes:       codesByBatch[b.id] || []
      };
    });

    return { success: true, nfts: nfts };
  }

  async function redeemToken(token) {
    var rows = await _get('/unlock_codes', {
      'code': 'eq.' + token, 'select': '*'
    }).catch(function() { return []; });

    if (!rows || rows.length === 0) return { success: false, error: 'Invalid token.' };
    var code = rows[0];
    if (code.is_redeemed) return { success: false, error: 'This token has already been redeemed.' };

    var patchRes = await fetch(
      SUPABASE_URL + '/rest/v1/unlock_codes?code=eq.' + encodeURIComponent(token),
      {
        method: 'PATCH',
        headers: Object.assign({}, _headers(), { 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ is_redeemed: true, redeemed_at: new Date().toISOString() })
      }
    );
    if (!patchRes.ok) {
      var err = await patchRes.json().catch(function() { return {}; });
      return { success: false, error: (err && err.message) || 'Failed to redeem token.' };
    }

    var nft = { name: code.character_name, image: '', description: '' };
    if (code.batch_id) {
      var batches = await _get('/tcg_batches', {
        'id': 'eq.' + code.batch_id, 'select': 'name,image,description'
      }).catch(function() { return []; });
      if (batches && batches[0]) nft = batches[0];
    }

    return {
      success: true,
      nft:  nft,
      code: { token: code.code, serial: code.serial || '', redeemedAt: new Date().toISOString() }
    };
  }

  async function clearAll() {
    var res = await fetch(SUPABASE_URL + '/rest/v1/tcg_batches', {
      method: 'DELETE',
      headers: _headers()
    });
    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      throw new Error((err && err.message) || 'Failed to clear all TCGs.');
    }
    return { success: true };
  }

  /* ============================================================
     CLOUDINARY
     ============================================================ */
  var CLOUDINARY_DEFAULTS = { cloudName: 'djgvzbxvt', uploadPreset: 'Community_Feed' };

  function getCloudinaryConfig() {
    try {
      var saved = localStorage.getItem('kangi_cloudinary_config');
      if (saved) {
        var p = JSON.parse(saved);
        if (p.cloudName && p.uploadPreset) return p;
      }
    } catch(e) {}
    return CLOUDINARY_DEFAULTS;
  }

  function saveCloudinaryConfig(cloudName, uploadPreset) {
    try {
      localStorage.setItem('kangi_cloudinary_config', JSON.stringify({ cloudName: cloudName, uploadPreset: uploadPreset }));
      return true;
    } catch(e) { return false; }
  }

  function uploadToCloudinary(file, resourceType, onProgress) {
    resourceType = resourceType || 'auto';
    return new Promise(function(resolve) {
      var cfg = getCloudinaryConfig();
      if (!cfg || !cfg.cloudName) {
        resolve({ success: false, error: 'Cloudinary not configured.' });
        return;
      }
      var fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', cfg.uploadPreset);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + cfg.cloudName + '/' + resourceType + '/upload', true);
      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = function(e) {
          if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100), e.loaded, e.total);
        };
      }
      xhr.onload = function() {
        try {
          var d = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300 && d.secure_url) {
            if (onProgress) onProgress(100, file.size, file.size);
            resolve({ success: true, url: d.secure_url, data: d });
          } else {
            resolve({ success: false, error: (d.error && d.error.message) || ('HTTP ' + xhr.status) });
          }
        } catch(err) { resolve({ success: false, error: err.message }); }
      };
      xhr.onerror   = function() { resolve({ success: false, error: 'Network error.' }); };
      xhr.ontimeout = function() { resolve({ success: false, error: 'Request timed out.' }); };
      xhr.send(fd);
    });
  }

  /* ============================================================
     SUPABASE STORAGE
     ============================================================ */
  function uploadToStorage(file, bucket, storagePath, onProgress) {
    return new Promise(function(resolve) {
      var url = SUPABASE_URL + '/storage/v1/object/' + bucket + '/' + storagePath;
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('apikey', SUPABASE_ANON);
      xhr.setRequestHeader('Authorization', 'Bearer ' + session.accessToken);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-upsert', 'true');
      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = function(e) {
          if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
        };
      }
      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          var publicUrl = SUPABASE_URL + '/storage/v1/object/public/' + bucket + '/' + storagePath;
          resolve({ success: true, url: publicUrl });
        } else {
          resolve({ success: false, error: 'Upload failed: HTTP ' + xhr.status + ' - ' + xhr.responseText });
        }
      };
      xhr.onerror   = function() { resolve({ success: false, error: 'Network error during upload.' }); };
      xhr.ontimeout = function() { resolve({ success: false, error: 'Upload timed out.' }); };
      xhr.send(file);
    });
  }

  /* ============================================================
     IMAGE UTIL
     ============================================================ */
  function resizeImage(file, maxWidth) {
    maxWidth = maxWidth || 240;
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function(e) {
        var img = new Image();
        img.onerror = reject;
        img.onload = function() {
          var canvas = document.createElement('canvas');
          var w = img.width, h = img.height;
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

  /* ============================================================
     FIREBASE STUBS (removed)
     ============================================================ */
  function getFirebaseConfig()         { return {}; }
  function saveFirebaseConfig()        { return false; }
  function ensureFirebaseAuth()        { return Promise.resolve(null); }
  function tryAutoFirebaseAuth()       { return Promise.resolve(false); }
  function testFirebaseConnection()    {
    return Promise.resolve({ success: false, error: 'Firebase removed. Using Supabase.' });
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  return {
    login:                  login,
    logout:                 logout,
    sendAccountRecoveryEmail: sendAccountRecoveryEmail,
    restoreSession:         restoreSession,
    getAdminIdentity:       getAdminIdentity,

    getSongs:               getSongs,
    approveSong:            approveSong,
    deleteSong:             deleteSong,
    updateSongSettings:     updateSongSettings,
    addSong:                addSong,

    getAllUsers:             getAllUsers,
    getUserDataFlags:       getUserDataFlags,
    makeAdmin:              makeAdmin,
    revokeAdmin:            revokeAdmin,
    makePremium:            makePremium,
    revokePremium:          revokePremium,
    banUser:                banUser,
    unbanUser:              unbanUser,
    getUserCharacters:      getUserCharacters,

    getVideos:              getVideos,
    deleteVideo:            deleteVideo,

    getNotifications:       getNotifications,
    sendNotification:       sendNotification,
    broadcastNotification:  broadcastNotification,

    getSupportMessages:     getSupportMessages,
    replyToMessage:         replyToMessage,
    deleteSupportMessage:   deleteSupportMessage,

    getUnlockCodes:         getUnlockCodes,
    insertUnlockCode:       insertUnlockCode,
    deleteUnlockCode:       deleteUnlockCode,

    publishNft:             publishNft,
    getNfts:                getNfts,
    redeemToken:            redeemToken,
    clearAll:               clearAll,

    uploadToCloudinary:     uploadToCloudinary,
    uploadToStorage:        uploadToStorage,
    getCloudinaryConfig:    getCloudinaryConfig,
    saveCloudinaryConfig:   saveCloudinaryConfig,
    resizeImage:            resizeImage,

    getFirebaseConfig:      getFirebaseConfig,
    saveFirebaseConfig:     saveFirebaseConfig,
    ensureFirebaseAuth:     ensureFirebaseAuth,
    tryAutoFirebaseAuth:    tryAutoFirebaseAuth,
    testFirebaseConnection: testFirebaseConnection,

    get session() { return session; }
  };

})();
