/* ============================================================
   service.js -- Supabase Data & Auth Service Layer
   Project: https://bfqwlcjflbybhltiflkt.supabase.co
   ============================================================ */

const KangiService = (function () {

  /* -- Supabase Config -- */
  const SUPABASE_URL  = 'https://bfqwlcjflbybhltiflkt.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcXdsY2pmbGJ5YmhsdGlmbGt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4MTUyNjksImV4cCI6MjExMDM5MTI2OX0.0L2agSv5n9-5iXfcUavgJktXRfL1Hs8InvCW2N2YYbk';

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

  /* -- Product id --
     Every request to Supabase carries an `x-product-id` header so the
     server/logs can tell the admin dashboard apart from the Unity app
     ("kangi-unityapp"). It is a header, not a body field, because PostgREST
     rejects unknown columns in insert/update bodies and RPCs reject unknown
     arguments. This local `fetch` shadows the global one for every call in
     this file, so no endpoint can miss it. */
  const PRODUCT_ID = 'kangi-admin';
  function fetch(url, opts) {
    opts = Object.assign({}, opts || {});
    if (String(url).indexOf(SUPABASE_URL) === 0) {
      opts.headers = Object.assign({}, opts.headers || {}, { 'x-product-id': PRODUCT_ID });
    }
    return window.fetch(url, opts);
  }

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

    var rows = null;
    try {
      rows = await _get('/profiles', {
        'id':     'eq.' + session.userId,
        'select': 'display_name,avatar_url,is_admin,is_banned'
      });
    } catch (e) {
      console.warn('[KangiService] Profile fetch failed (non-fatal):', e.message);
      rows = [];
    }
    var profile = (rows && rows[0]) || {};

    // Admin check is decided by the server (am_i_admin → is_admin_user():
    // admin flag AND not banned). Admin RPCs re-check on every action.
    var isAdmin = false;
    try {
      isAdmin = (await _rpc('am_i_admin')) === true;
    } catch (e) {
      // Migration 016 not deployed yet → fall back to the profile flag.
      if (String(e.message).indexOf('am_i_admin') === -1) throw e;
      isAdmin = profile.is_admin === true && !profile.is_banned;
    }
    if (!isAdmin) {
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

  /* ============================================================
     AUTHORISATION CHECK
     Called every 5 s and on every tab click. Returns:
       'ok'        – session valid and still an admin
       'expired'   – session gone/invalid (and refresh failed)
       'not_admin' – admin rights removed or account banned
       'offline'   – network problem; keep the session, try again later
     ============================================================ */
  function _tokenExpiresSoon(token) {
    try {
      var payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return !payload.exp || (payload.exp * 1000 - Date.now()) < 60 * 1000;
    } catch (e) { return true; }
  }

  async function _refreshSession() {
    if (!session.refreshToken) return false;
    try {
      var res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON },
        body: JSON.stringify({ refresh_token: session.refreshToken })
      });
      if (!res.ok) return false;
      var data = await res.json();
      if (!data.access_token) return false;
      session.accessToken  = data.access_token;
      session.refreshToken = data.refresh_token || session.refreshToken;
      return true;
    } catch (e) { return false; }
  }

  var _authCheckInFlight = null;
  function checkAuthorization() {
    // Overlapping callers (timer + tab click) share one request.
    if (!_authCheckInFlight) {
      _authCheckInFlight = _checkAuthorization().finally(function() { _authCheckInFlight = null; });
    }
    return _authCheckInFlight;
  }

  async function _checkAuthorization() {
    if (!session.accessToken) return 'expired';
    if (!navigator.onLine) return 'offline';

    if (_tokenExpiresSoon(session.accessToken) && !(await _refreshSession())) return 'expired';

    try {
      // 1. Is the session itself still valid on the server?
      var userRes = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: _headers() });
      if (userRes.status === 401 || userRes.status === 403) {
        if (!(await _refreshSession())) return 'expired';
        userRes = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: _headers() });
        if (!userRes.ok) return 'expired';
      } else if (!userRes.ok) {
        return 'offline';
      }

      // 2. Is this user still an admin (and not banned)?
      var isAdmin;
      try {
        isAdmin = (await _rpc('am_i_admin')) === true;
      } catch (e) {
        if (String(e.message).indexOf('am_i_admin') === -1) return 'offline';
        var rows = await _get('/profiles', {
          'id': 'eq.' + session.userId, 'select': 'is_admin,is_banned'
        });
        var p = (rows && rows[0]) || {};
        isAdmin = p.is_admin === true && !p.is_banned;
      }
      return isAdmin ? 'ok' : 'not_admin';
    } catch (e) {
      return 'offline';
    }
  }

  /* ============================================================
     PER-USER IN-GAME LOGS
     No extra table/column: the choice is sent to the player as a
     `debug_logs_on` / `debug_logs_off` notification (existing admin-only
     send_notification RPC). The Unity app applies it silently and keeps
     it out of the player's notification list. The newest one wins.
     ============================================================ */
  async function setUserShowLogs(targetUserId, enabled) {
    if (!targetUserId) return { success: false, error: 'No user ID provided.' };
    await _rpc('send_notification', {
      target_user: targetUserId,
      notif_title: 'Debug logs',
      notif_body:  enabled ? 'In-game logs enabled by admin.' : 'In-game logs disabled by admin.',
      notif_type:  enabled ? 'debug_logs_on' : 'debug_logs_off'
    });
    try { localStorage.setItem('kangi_logs_' + targetUserId, enabled ? '1' : '0'); } catch (e) {}
    return { success: true };
  }

  async function getUserShowLogs(targetUserId) {
    if (!targetUserId) return false;
    try {
      var rows = await _get('/notifications', {
        'user_id': 'eq.' + targetUserId,
        'type':    'in.(debug_logs_on,debug_logs_off)',
        'order':   'created_at.desc',
        'limit':   '1',
        'select':  'type'
      });
      if (rows && rows[0]) return rows[0].type === 'debug_logs_on';
    } catch (e) { /* admins may not be allowed to read other users' notifications */ }
    // Fall back to what this dashboard last set for the user.
    try { return localStorage.getItem('kangi_logs_' + targetUserId) === '1'; } catch (e) { return false; }
  }

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

  /* Looks up a song's uploader and title (for owner notifications). */
  async function _songOwner(songId) {
    try {
      var rows = await _get('/songs', { 'id': 'eq.' + songId, 'select': 'submitted_by,title' });
      return rows && rows[0] ? rows[0] : null;
    } catch (e) { return null; }
  }

  /* Notifies the song's uploader through the existing admin-only
     send_notification RPC. Never throws — the song change already
     succeeded; a failed notification is only reported. */
  async function _notifySongOwner(song, title, body, type) {
    if (!song || !song.submitted_by) return false;
    try {
      await _rpc('send_notification', {
        target_user: song.submitted_by,
        notif_title: title,
        notif_body:  body,
        notif_type:  type
      });
      return true;
    } catch (e) {
      console.warn('[KangiService] Could not notify song owner:', e);
      return false;
    }
  }

  function _songName(song) {
    return '"' + ((song && song.title) || 'Your song') + '"';
  }

  async function approveSong(songId) {
    var song = await _songOwner(songId);
    await _patch('/songs?id=eq.' + songId, { status: 'approved' });
    var sent = await _notifySongOwner(song, 'Song Approved',
      _songName(song) + ' is approved and now available.', 'audio_approved');
    return { success: true, notificationSent: sent };
  }

  async function deleteSong(songId) {
    var song = await _songOwner(songId);   // read before the row is gone
    await _delete('/songs?id=eq.' + songId);
    var sent = await _notifySongOwner(song, 'Song Removed',
      _songName(song) + ' was removed by the admin.', 'audio_deleted');
    return { success: true, notificationSent: sent };
  }

  async function updateSongSettings(songId, modes, tsStart, tsEnd) {
    var song = await _songOwner(songId);
    await _patch('/songs?id=eq.' + songId, {
      modes:      Array.isArray(modes) ? modes : [],
      trim_start: Number(tsStart) || 0,
      trim_end:   Number(tsEnd)   || 0
    });
    var sent = await _notifySongOwner(song, 'Song Updated',
      'The admin updated the settings of ' + _songName(song) + '.', 'audio_settings_updated');
    return { success: true, notificationSent: sent };
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
      // Admin-only server function (migration 018) — includes email + last sign-in
      var rows = await _rpc('admin_list_users', {});
      return { success: true, users: rows || [] };
    } catch(e) {
      if (String(e.message).indexOf('admin_list_users') === -1) {
        console.warn('[KangiService] admin_list_users failed, falling back to profiles:', e.message);
      }
      var rows2 = await _get('/profiles', {
        'select': 'id,display_name,avatar_url,is_admin,is_banned,is_premium,banned_until,created_at',
        'order':  'created_at.desc'
      });
      rows2 = rows2 || [];
      // Emails live in Supabase Auth; the admin-user-emails Edge Function
      // returns them to admins only. Without it the list still loads.
      var emails = await _getUserEmails();
      rows2.forEach(function(r) {
        var e = emails[r.id];
        if (e) { r.email = e.email; r.last_sign_in_at = e.last_sign_in_at; }
      });
      return { success: true, users: rows2 };
    }
  }

  /* Calls the admin-only Edge Function. Returns { <userId>: { email,
     last_sign_in_at } }, or {} if the function is not deployed or fails. */
  async function _getUserEmails() {
    try {
      var res = await fetch(SUPABASE_URL + '/functions/v1/admin-user-emails', {
        method: 'POST',
        headers: _headers(),
        body: '{}'
      });
      if (!res.ok) {
        console.warn('[KangiService] admin-user-emails: HTTP ' + res.status);
        return {};
      }
      var json = await res.json();
      var map = {};
      (json.users || []).forEach(function(u) { map[u.id] = u; });
      return map;
    } catch (e) {
      console.warn('[KangiService] admin-user-emails unavailable:', e);
      return {};
    }
  }

  async function getUserByEmail(email) {
    try {
      const rows = await _rpc('admin_list_users', { p_email: email });
      return rows && rows[0] ? rows[0] : null;
    } catch (e) {
      // Fallback: find the id through the Edge Function, then load the profile.
      var want = String(email || '').trim().toLowerCase();
      if (!want) return null;
      var emails = await _getUserEmails();
      var id = Object.keys(emails).find(function(k) {
        return String(emails[k].email || '').toLowerCase() === want;
      });
      if (!id) return null;
      var rows2 = await _get('/profiles', {
        'id': 'eq.' + id,
        'select': 'id,display_name,avatar_url,is_admin,is_banned,is_premium,banned_until,created_at'
      }).catch(function() { return []; });
      return rows2 && rows2[0] ? Object.assign(rows2[0], { email: emails[id].email }) : null;
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
    }) || [];

    // Current usernames from profiles (the name saved on the message can be
    // empty or out of date).
    var names = {};
    var ids = rows.map(function(r) { return r.user_id; })
                  .filter(function(id, i, a) { return id && a.indexOf(id) === i; });
    if (ids.length) {
      try {
        var profiles = await _get('/profiles', {
          'id':     'in.(' + ids.join(',') + ')',
          'select': 'id,display_name'
        });
        (profiles || []).forEach(function(p) { names[p.id] = p.display_name; });
      } catch (e) {
        console.warn('[KangiService] Could not load usernames for messages:', e);
      }
    }

    // The UI reads camelCase fields.
    var messages = rows.map(function(r) {
      return {
        id:          r.id,
        user_id:     r.user_id,
        displayName: names[r.user_id] || r.display_name || 'Unknown user',
        body:        r.body,
        status:      r.status,
        adminReply:  r.admin_reply,
        repliedAt:   r.replied_at,
        createdAt:   r.created_at
      };
    });
    var openCount = messages.filter(function(m) { return m.status === 'open'; }).length;
    return { success: true, messages: messages, openCount: openCount };
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
        // Don't leave an empty batch behind when its codes could not be saved
        await _delete('/tcg_batches?id=eq.' + encodeURIComponent(nftObj.id)).catch(function() {});
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

  /* ============================================================
     STORAGE (SUPABASE STORAGE - replaces Cloudinary)
     ============================================================ */
  function uploadToStorage(file, bucket, storagePath, onProgress) {
    return new Promise(function(resolve) {
      if (!file) {
        resolve({ success: false, error: 'No file provided.' });
        return;
      }
      var token = session.accessToken || SUPABASE_ANON;
      var path = storagePath || ((session.userId || 'admin') + '/' + Date.now() + '_' + encodeURIComponent(file.name || 'file'));
      var url = SUPABASE_URL + '/storage/v1/object/' + bucket + '/' + path;
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('apikey', SUPABASE_ANON);
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-upsert', 'true');
      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = function(e) {
          if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
        };
      }
      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          var publicUrl = SUPABASE_URL + '/storage/v1/object/public/' + bucket + '/' + path;
          resolve({ success: true, url: publicUrl, secure_url: publicUrl });
        } else {
          resolve({ success: false, error: 'Upload failed: HTTP ' + xhr.status + ' - ' + xhr.responseText });
        }
      };
      xhr.onerror   = function() { resolve({ success: false, error: 'Network error during upload.' }); };
      xhr.ontimeout = function() { resolve({ success: false, error: 'Upload timed out.' }); };
      xhr.send(file);
    });
  }

  // Legacy wrapper: routes any remaining uploadToCloudinary calls to Supabase Storage
  function uploadToCloudinary(file, resourceType, onProgress) {
    var bucket = (resourceType === 'image') ? 'covers' : (resourceType === 'video' ? 'videos' : 'songs');
    var ext = file.name ? (file.name.split('.').pop() || 'bin') : (resourceType === 'image' ? 'jpg' : 'mp3');
    var path = (session.userId || 'admin') + '/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext;
    return uploadToStorage(file, bucket, path, onProgress);
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
    checkAuthorization:     checkAuthorization,
    setUserShowLogs:        setUserShowLogs,
    getUserShowLogs:        getUserShowLogs,
    getAdminIdentity:       getAdminIdentity,

    getSongs:               getSongs,
    approveSong:            approveSong,
    deleteSong:             deleteSong,
    updateSongSettings:     updateSongSettings,
    addSong:                addSong,

    getAllUsers:             getAllUsers,
    getUserByEmail:         getUserByEmail,
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
