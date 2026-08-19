// ====================================================================================
// MASTER WORKFLOW FOR VIDEO & MUSIC APPLICATION
// Fully Optimized to Prevent Crashes and Ensure Deep Server Wipes
// Copy and Paste this entire file into your PlayFab CloudScript Revision Editor.
// ====================================================================================

handlers.videoAppWorkflow = function (args, context) {
    var action = args.action;

    // --- 1. GLOBAL DATABASE KEYS DEFINITIONS ---
    var VIDEOS_DATABASE_KEY = "GlobalAppVideosMasterList";
    var SONGS_DATABASE_KEY = "GlobalAppSongsMasterList";

    // ====================================================================================
    // USER ACTIONS (CLIENT PIPELINE)
    // ====================================================================================

    // A. FETCH VIDEO FEED DATA
    if (action === "getFeed") {
        var serverData = server.GetTitleInternalData({ Keys: [VIDEOS_DATABASE_KEY] });
        if (serverData.Data && serverData.Data[VIDEOS_DATABASE_KEY]) {
            return serverData.Data[VIDEOS_DATABASE_KEY];
        }
        return JSON.stringify({ videos: [] });
    }

    // B. PUBLISH NEW UPLOADED VIDEO
    if (action === "publish") {
        var newVideoObj = args.videoData;

        newVideoObj.likes = 0;
        newVideoObj.commentsCount = 0;
        newVideoObj.shares = 0;

        var currentFeedJson = server.GetTitleInternalData({ Keys: [VIDEOS_DATABASE_KEY] });
        var masterVideosList = [];

        if (currentFeedJson.Data && currentFeedJson.Data[VIDEOS_DATABASE_KEY]) {
            var parsedData = JSON.parse(currentFeedJson.Data[VIDEOS_DATABASE_KEY]);
            masterVideosList = parsedData.videos || [];
        }

        masterVideosList.unshift(newVideoObj);

        server.SetTitleInternalData({
            Key: VIDEOS_DATABASE_KEY,
            Value: JSON.stringify({ videos: masterVideosList })
        });

        return { success: true, message: "Video metadata successfully appended to global stream database." };
    }

    // C. SUBMIT NEW UPLOADED SONG (Global Master Catalog)
    if (action === "submitSong" || action === "submit") {
        // Premium gate, enforced server-side. The Unity popup is the friendly
        // half of this check; a modified client can skip that, not this one.
        var uploaderIsAllowed = false;
        try {
            var upData = server.GetUserData({ PlayFabId: currentPlayerId, Keys: ["IsPremium", "IsAdmin"] });
            if (upData && upData.Data) {
                if (upData.Data.IsPremium && upData.Data.IsPremium.Value === "true") uploaderIsAllowed = true;
                if (upData.Data.IsAdmin   && upData.Data.IsAdmin.Value   === "true") uploaderIsAllowed = true;
            }
        } catch (ePrem) {}

        if (!uploaderIsAllowed) {
            return {
                success:      false,
                errorCode:    "NOT_PREMIUM",
                error:        "This feature is only for Premium users and admin must approve the music before the music becomes available."
            };
        }

        var newSongObj = args.songData;
        newSongObj.isPending = true;

        // Mode defaults: every song is playable in Mirror Mii and Kawaii Mode.
        // Dance Challenge is opt-in, because it needs a trimmed countdown window.
        if (!newSongObj.modes || !newSongObj.modes.length) {
            newSongObj.modes = ["mirror_mii", "kawaii_mode"];
        }
        // 0 / 0 means "play the whole file" until an admin trims it.
        if (typeof newSongObj.trimStart !== "number") newSongObj.trimStart = 0;
        if (typeof newSongObj.trimEnd   !== "number") newSongObj.trimEnd   = 0;

        // Always stamp the uploader's PlayFab ID server-side — never trust the client
        newSongObj.uploaderId = currentPlayerId;

        var currentSongsJson = server.GetTitleInternalData({ Keys: [SONGS_DATABASE_KEY] });
        var songsList = [];
        var approvedList = [];
        var pendingList = [];

        if (currentSongsJson.Data && currentSongsJson.Data[SONGS_DATABASE_KEY]) {
            try {
                var parsedSongsData = JSON.parse(currentSongsJson.Data[SONGS_DATABASE_KEY]);
                if (Array.isArray(parsedSongsData)) {
                    songsList = parsedSongsData;
                } else if (parsedSongsData.songs) {
                    songsList = parsedSongsData.songs;
                } else {
                    songsList = [];
                    if (parsedSongsData.approvedSongs) songsList = songsList.concat(parsedSongsData.approvedSongs);
                    if (parsedSongsData.pendingSongs) songsList = songsList.concat(parsedSongsData.pendingSongs);
                }
            } catch (e) {
                songsList = [];
            }
        }

        // Add new song to top of master songs list
        songsList.unshift(newSongObj);

        // Separate approved and pending lists
        for (var i = 0; i < songsList.length; i++) {
            if (songsList[i].isPending === true || songsList[i].isPending === "true") {
                pendingList.push(songsList[i]);
            } else {
                approvedList.push(songsList[i]);
            }
        }

        var songsPayload = {
            songs: songsList,
            approvedSongs: approvedList,
            pendingSongs: pendingList
        };

        server.SetTitleInternalData({
            Key: SONGS_DATABASE_KEY,
            Value: JSON.stringify(songsPayload)
        });

        return { success: true, message: "Song metadata successfully submitted to global master catalog." };
    }

    // D. FETCH ALL SONGS (APPROVED & PENDING)
    if (action === "getSongs" || action === "getAll") {
        var musicServerData = server.GetTitleInternalData({ Keys: [SONGS_DATABASE_KEY] });
        if (musicServerData.Data && musicServerData.Data[SONGS_DATABASE_KEY]) {
            try {
                var parsedSongs = JSON.parse(musicServerData.Data[SONGS_DATABASE_KEY]);
                var songsArray = [];
                if (Array.isArray(parsedSongs)) {
                    songsArray = parsedSongs;
                } else if (parsedSongs.songs) {
                    songsArray = parsedSongs.songs;
                } else {
                    return JSON.stringify(parsedSongs);
                }

                var appList = [];
                var pendList = [];
                for (var k = 0; k < songsArray.length; k++) {
                    if (songsArray[k].isPending === true || songsArray[k].isPending === "true") {
                        pendList.push(songsArray[k]);
                    } else {
                        appList.push(songsArray[k]);
                    }
                }

                return JSON.stringify({
                    songs: songsArray,
                    approvedSongs: appList,
                    pendingSongs: pendList
                });
            } catch (e) {
                return JSON.stringify({ songs: [], approvedSongs: [], pendingSongs: [] });
            }
        }
        return JSON.stringify({ songs: [], approvedSongs: [], pendingSongs: [] });
    }

    // E. INTERACTIONS ENGINE (LIKE, UNLIKE, SHARE, COMMENT)
    if (action === "interact") {
        var videoOwnerId = args.ownerId;
        var targetVideoId = args.videoId;
        var interactionType = args.interactionType;

        var dataResponse = server.GetTitleInternalData({ Keys: [VIDEOS_DATABASE_KEY] });
        if (!dataResponse.Data || !dataResponse.Data[VIDEOS_DATABASE_KEY]) {
            return { success: false, error: "Database not initialized" };
        }

        var wrapper = JSON.parse(dataResponse.Data[VIDEOS_DATABASE_KEY]);
        var videos = wrapper.videos || [];
        var targetFound = false;
        var updatedVideo = null;

        for (var i = 0; i < videos.length; i++) {
            if (videos[i].videoId === targetVideoId) {
                targetFound = true;

                if (interactionType === "like") {
                    videos[i].likes += 1;
                    try {
                        server.UpdatePlayerStatistics({
                            PlayFabId: videoOwnerId,
                            Statistics: [{ StatisticName: "TotalLikesReceived", Value: 1 }]
                        });
                    } catch (e) { log.error("Profile statistics update failed: " + e); }
                }
                else if (interactionType === "unlike") {
                    if (videos[i].likes > 0) videos[i].likes -= 1;
                }
                else if (interactionType === "share") {
                    videos[i].shares += 1;
                    try {
                        server.UpdatePlayerStatistics({
                            PlayFabId: videoOwnerId,
                            Statistics: [{ StatisticName: "TotalSharesReceived", Value: 1 }]
                        });
                    } catch (e) { }
                }
                else if (interactionType === "comment") {
                    var commenterUsername = args.username || "Anonymous";
                    var commentText = args.commentText || "";
                    var timestamp = new Date().toISOString();

                    if (!videos[i].comments) {
                        videos[i].comments = [];
                    }
                    videos[i].comments.push({
                        username: commenterUsername,
                        commentText: commentText,
                        timestamp: timestamp
                    });
                    videos[i].commentsCount = videos[i].comments.length;
                }

                updatedVideo = videos[i];
                break;
            }
        }

        if (targetFound) {
            server.SetTitleInternalData({
                Key: VIDEOS_DATABASE_KEY,
                Value: JSON.stringify({ videos: videos })
            });
            return { success: true, type: interactionType, updatedVideo: updatedVideo };
        }

        return { success: false, error: "Video ID lookup key signature matched nothing." };
    }


    // ====================================================================================
    // ADMIN COMMANDS ACTIONS (EDITOR DASHBOARD CONTROL PIPELINE)
    // ====================================================================================
    var adminParams = args.adminData || {};

    // F. APPROVE A PENDING SONG + send notification
    // ====================================================================================
    // UPDATE SONG SETTINGS — which game modes a song appears in, and its trim window.
    //
    // Trim is stored, never applied to the file. The uploaded audio is left
    // untouched and the client plays only [trimStart, trimEnd). That keeps the
    // edit reversible, avoids re-encoding, and costs no storage.
    // ====================================================================================
    if (action === "updateSongSettings") {
        var uParams   = adminParams || args;
        var uSongId   = uParams.songId;
        if (!uSongId) return { success: false, error: "songId is required." };

        var ALLOWED_MODES = ["dance_challenge", "mirror_mii", "kawaii_mode"];

        // Keep only recognised mode keys, and drop duplicates.
        var cleanModes = [];
        if (uParams.modes && uParams.modes.length) {
            for (var mi = 0; mi < uParams.modes.length; mi++) {
                var mk = String(uParams.modes[mi]);
                var known = false;
                for (var ai = 0; ai < ALLOWED_MODES.length; ai++) {
                    if (ALLOWED_MODES[ai] === mk) { known = true; break; }
                }
                var dupe = false;
                for (var ci = 0; ci < cleanModes.length; ci++) {
                    if (cleanModes[ci] === mk) { dupe = true; break; }
                }
                if (known && !dupe) cleanModes.push(mk);
            }
        }

        var tStart = Number(uParams.trimStart);
        var tEnd   = Number(uParams.trimEnd);
        if (isNaN(tStart) || tStart < 0) tStart = 0;
        // 0 means "play to the natural end of the file".
        if (isNaN(tEnd) || tEnd < 0) tEnd = 0;
        if (tEnd > 0 && tEnd <= tStart) {
            return { success: false, error: "Trim end must be greater than trim start." };
        }

        var uResp = server.GetTitleInternalData({ Keys: [SONGS_DATABASE_KEY] });
        if (!uResp.Data || !uResp.Data[SONGS_DATABASE_KEY]) {
            return { success: false, error: "Songs catalog empty" };
        }

        var uWrapper = JSON.parse(uResp.Data[SONGS_DATABASE_KEY]);
        var uSongs = [];
        if (Array.isArray(uWrapper)) {
            uSongs = uWrapper;
        } else if (uWrapper.songs) {
            uSongs = uWrapper.songs;
        } else {
            uSongs = [];
            if (uWrapper.approvedSongs) uSongs = uSongs.concat(uWrapper.approvedSongs);
            if (uWrapper.pendingSongs)  uSongs = uSongs.concat(uWrapper.pendingSongs);
        }

        var uFound = false;
        var uApproved = [];
        var uPending  = [];

        for (var ui = 0; ui < uSongs.length; ui++) {
            if (uSongs[ui].SongId === uSongId) {
                uSongs[ui].modes     = cleanModes;
                uSongs[ui].trimStart = tStart;
                uSongs[ui].trimEnd   = tEnd;
                uFound = true;
            }
            if (uSongs[ui].isPending === true || uSongs[ui].isPending === "true") {
                uPending.push(uSongs[ui]);
            } else {
                uApproved.push(uSongs[ui]);
            }
        }

        if (!uFound) return { success: false, error: "Song not found: " + uSongId };

        server.SetTitleInternalData({
            Key:   SONGS_DATABASE_KEY,
            Value: JSON.stringify({ songs: uSongs, approvedSongs: uApproved, pendingSongs: uPending })
        });

        return {
            success:   true,
            message:   "Song settings updated.",
            songId:    uSongId,
            modes:     cleanModes,
            trimStart: tStart,
            trimEnd:   tEnd
        };
    }

    if (action === "approveSong") {
        var targetSongId = adminParams.songId;
        log.info("=== APPROVE SONG START ===");
        log.info("Target Song ID: " + targetSongId);
        
        var musicDataResponse = server.GetTitleInternalData({ Keys: [SONGS_DATABASE_KEY] });

        if (!musicDataResponse.Data || !musicDataResponse.Data[SONGS_DATABASE_KEY]) {
            log.error("Songs catalog is empty");
            return { success: false, error: "Songs catalog empty" };
        }

        var musicWrapper = JSON.parse(musicDataResponse.Data[SONGS_DATABASE_KEY]);
        var songs = [];
        if (Array.isArray(musicWrapper)) {
            songs = musicWrapper;
        } else if (musicWrapper.songs) {
            songs = musicWrapper.songs;
        } else {
            songs = [];
            if (musicWrapper.approvedSongs) songs = songs.concat(musicWrapper.approvedSongs);
            if (musicWrapper.pendingSongs) songs = songs.concat(musicWrapper.pendingSongs);
        }

        log.info("Total songs found: " + songs.length);

        var statusUpdated = false;
        var approvedList = [];
        var pendingList = [];
        var targetSongOwnerId = "";
        var targetSongTitle = "";
        var foundSong = null;

        for (var j = 0; j < songs.length; j++) {
            if (songs[j].SongId === targetSongId) {
                songs[j].isPending = false;
                statusUpdated = true;
                targetSongOwnerId = songs[j].uploaderId || songs[j].ownerId || songs[j].uploader || "";
                targetSongTitle = songs[j].SongName || songs[j].title || songs[j].name || songs[j].songTitle || songs[j].SongTitle || "";
                foundSong = songs[j];
                log.info("Song found!");
                log.info("Song Title: " + targetSongTitle);
                log.info("Owner ID: " + targetSongOwnerId);
            }

            if (songs[j].isPending === true || songs[j].isPending === "true") {
                pendingList.push(songs[j]);
            } else {
                approvedList.push(songs[j]);
            }
        }

        if (statusUpdated) {
            var updatedMusicPayload = {
                songs: songs,
                approvedSongs: approvedList,
                pendingSongs: pendingList
            };
            server.SetTitleInternalData({
                Key: SONGS_DATABASE_KEY,
                Value: JSON.stringify(updatedMusicPayload)
            });

            log.info("Song approved in database");

            // Send notification to song owner
            if (targetSongOwnerId && targetSongOwnerId !== "") {
                log.info("Sending notification to: " + targetSongOwnerId);
                var notifResult = sendNotification(
                    targetSongOwnerId,
                    "Song Approved! 🎵",
                    targetSongTitle
                        ? "Your song '" + targetSongTitle + "' has been approved and is now live!"
                        : "Your song has been approved and is now live!",
                    "audio_approved",
                    { songId: targetSongId, songTitle: targetSongTitle }
                );
                log.info("Notification result: " + JSON.stringify(notifResult));
            } else {
                log.error("No owner ID found! Cannot send notification.");
                log.error("Song data: " + JSON.stringify(foundSong));
            }

            log.info("=== APPROVE SONG END ===");
            return { 
                success: true, 
                message: "Song approved successfully.",
                ownerId: targetSongOwnerId,
                notificationSent: targetSongOwnerId !== ""
            };
        }
        
        log.error("Song ID not found: " + targetSongId);
        log.info("=== APPROVE SONG END (FAILED) ===");
        return { success: false, message: "Song ID not found." };
    }

    // G. DELETE A SONG FROM THE PLATFORM + send notification
    if (action === "deleteSong") {
        var songIdToDelete = adminParams.songId;
        log.info("=== DELETE SONG START ===");
        log.info("Target Song ID: " + songIdToDelete);
        
        var resSongs = server.GetTitleInternalData({ Keys: [SONGS_DATABASE_KEY] });

        if (resSongs.Data && resSongs.Data[SONGS_DATABASE_KEY]) {
            var wrapSongs = JSON.parse(resSongs.Data[SONGS_DATABASE_KEY]);
            var allSongsList = [];
            if (Array.isArray(wrapSongs)) {
                allSongsList = wrapSongs;
            } else if (wrapSongs.songs) {
                allSongsList = wrapSongs.songs;
            } else {
                allSongsList = [];
                if (wrapSongs.approvedSongs) allSongsList = allSongsList.concat(wrapSongs.approvedSongs);
                if (wrapSongs.pendingSongs) allSongsList = allSongsList.concat(wrapSongs.pendingSongs);
            }

            log.info("Total songs found: " + allSongsList.length);

            // Find the song owner before deleting
            var deletedSongOwnerId = "";
            var deletedSongTitle = "";
            var foundSong = null;
            
            for (var ds = 0; ds < allSongsList.length; ds++) {
                if (allSongsList[ds].SongId === songIdToDelete) {
                    deletedSongOwnerId = allSongsList[ds].uploaderId || allSongsList[ds].ownerId || allSongsList[ds].uploader || "";
                    deletedSongTitle = allSongsList[ds].SongName || allSongsList[ds].title || allSongsList[ds].name || allSongsList[ds].songTitle || allSongsList[ds].SongTitle || "";
                    foundSong = allSongsList[ds];
                    log.info("Song found!");
                    log.info("Song Title: " + deletedSongTitle);
                    log.info("Owner ID: " + deletedSongOwnerId);
                    break;
                }
            }

            allSongsList = allSongsList.filter(function (item) { return item.SongId !== songIdToDelete; });

            var appSongs = [];
            var pendSongs = [];
            for (var m = 0; m < allSongsList.length; m++) {
                if (allSongsList[m].isPending === true || allSongsList[m].isPending === "true") {
                    pendSongs.push(allSongsList[m]);
                } else {
                    appSongs.push(allSongsList[m]);
                }
            }

            var updatedWrap = {
                songs: allSongsList,
                approvedSongs: appSongs,
                pendingSongs: pendSongs
            };

            server.SetTitleInternalData({
                Key: SONGS_DATABASE_KEY,
                Value: JSON.stringify(updatedWrap)
            });

            log.info("Song deleted from database");

            // Send notification to song owner
            if (deletedSongOwnerId && deletedSongOwnerId !== "") {
                log.info("Sending notification to: " + deletedSongOwnerId);
                var deleteNotifResult = sendNotification(
                    deletedSongOwnerId,
                    "Song Removed",
                    deletedSongTitle
                        ? "Your song '" + deletedSongTitle + "' has been removed from the platform."
                        : "Your song has been removed from the platform.",
                    "audio_deleted",
                    { songId: songIdToDelete, songTitle: deletedSongTitle }
                );
                log.info("Notification result: " + JSON.stringify(deleteNotifResult));
            } else {
                log.error("No owner ID found! Cannot send notification.");
                if (foundSong) {
                    log.error("Song data: " + JSON.stringify(foundSong));
                }
            }

            log.info("=== DELETE SONG END ===");
            return { 
                success: true, 
                message: "Song removed from active tables.",
                ownerId: deletedSongOwnerId,
                notificationSent: deletedSongOwnerId !== ""
            };
        }
        
        log.error("No catalog active data found");
        log.info("=== DELETE SONG END (FAILED) ===");
        return { success: false, message: "No catalog active data found." };
    }

    // H. DELETE A VIDEO FEED POST
    if (action === "deleteVideo") {
        var videoIdToDelete = adminParams.videoId;
        var resVideos = server.GetTitleInternalData({ Keys: [VIDEOS_DATABASE_KEY] });

        if (resVideos.Data && resVideos.Data[VIDEOS_DATABASE_KEY]) {
            var wrapVideos = JSON.parse(resVideos.Data[VIDEOS_DATABASE_KEY]);
            var activeVideosList = wrapVideos.videos || [];

            var filteredVideos = activeVideosList.filter(function (v) {
                return v.videoId !== videoIdToDelete;
            });

            server.SetTitleInternalData({
                Key: VIDEOS_DATABASE_KEY,
                Value: JSON.stringify({ videos: filteredVideos })
            });
            return { success: true, message: "Video feed cleaned successfully." };
        }
        return { success: false, message: "Target database feed missing." };
    }

    // I. RESET SERVER COMPLETELY (THE CORE MASTER NUCLEAR WIPE)
    if (action === "resetServer") {
        var doubleCheckConfirmation = adminParams.confirmWipe;

        if (doubleCheckConfirmation === true) {
            // 1. Wipe out videos array structure entirely
            server.SetTitleInternalData({
                Key: VIDEOS_DATABASE_KEY,
                Value: JSON.stringify({ videos: [] })
            });

            // 2. Wipe out songs data fields
            var structuralResetPayload = {
                songs: [],
                approvedSongs: [],
                pendingSongs: []
            };

            server.SetTitleInternalData({
                Key: SONGS_DATABASE_KEY,
                Value: JSON.stringify(structuralResetPayload)
            });

            log.info("Reset Master Workflow: Database clean flush pipeline processed successfully.");
            return { success: true, message: "WIPE COMPLETE" };
        }
        return { success: false, message: "BAD AUTH TOKEN OR SECURITY MISMATCH" };
    }

    return { error: "No matching executable protocol action found inside data layers." };
};


// ====================================================================================
// MASTER WORKFLOW FOR NFT QR GENERATOR
// Copy and Paste this entire file into your PlayFab CloudScript Revision Editor.
// ====================================================================================

handlers.nftQrWorkflow = function (args, context) {
    var action = args.action;

    // --- 1. GLOBAL DATABASE KEY DEFINITION ---
    // We use Title Internal Data to store the master list of NFTs.
    var NFT_DATABASE_KEY = "GlobalAppNftsMasterList";

    // ====================================================================================
    // A. FETCH ALL NFTs
    // ====================================================================================
    if (action === "getNfts") {
        var serverData = server.GetTitleInternalData({ Keys: [NFT_DATABASE_KEY] });
        if (serverData.Data && serverData.Data[NFT_DATABASE_KEY]) {
            try {
                return JSON.parse(serverData.Data[NFT_DATABASE_KEY]);
            } catch (e) {
                return { nfts: [] };
            }
        }
        return { nfts: [] };
    }

    // ====================================================================================
    // B. PUBLISH NEW NFT BATCH
    //    Image is a Cloudinary CDN URL (uploaded client-side before calling this).
    //    PlayFab TitleInternalData has a 1MB limit per key — using URLs keeps payload tiny.
    // ====================================================================================
    if (action === "publishNft") {
        var newNftObj = args.nftData;

        var currentFeedJson = server.GetTitleInternalData({ Keys: [NFT_DATABASE_KEY] });
        var nftsList = [];

        if (currentFeedJson.Data && currentFeedJson.Data[NFT_DATABASE_KEY]) {
            try {
                var parsedData = JSON.parse(currentFeedJson.Data[NFT_DATABASE_KEY]);
                nftsList = parsedData.nfts || [];
            } catch (e) {
                nftsList = [];
            }
        }

        // Add to the beginning of the list
        nftsList.unshift(newNftObj);

        server.SetTitleInternalData({
            Key: NFT_DATABASE_KEY,
            Value: JSON.stringify({ nfts: nftsList })
        });

        return { success: true, message: "NFT batch successfully published to global database." };
    }

    // ====================================================================================
    // C. REDEEM A QR TOKEN
    // ====================================================================================
    if (action === "redeemToken") {
        var targetToken = args.token;

        var dataResponse = server.GetTitleInternalData({ Keys: [NFT_DATABASE_KEY] });
        if (!dataResponse.Data || !dataResponse.Data[NFT_DATABASE_KEY]) {
            return { success: false, error: "Database not initialized. No NFTs exist." };
        }

        var wrapper;
        try {
            wrapper = JSON.parse(dataResponse.Data[NFT_DATABASE_KEY]);
        } catch (e) {
            return { success: false, error: "Database parse error." };
        }

        var nfts = wrapper.nfts || [];
        var targetFound = false;
        var alreadyRedeemed = false;
        var resultNft = null;
        var resultCode = null;

        // Search for the specific token inside all NFTs and their generated codes
        for (var i = 0; i < nfts.length; i++) {
            var nft = nfts[i];
            for (var j = 0; j < nft.codes.length; j++) {
                if (nft.codes[j].token === targetToken) {
                    targetFound = true;
                    if (nft.codes[j].redeemed) {
                        alreadyRedeemed = true;
                    } else {
                        // Mark as redeemed
                        nft.codes[j].redeemed = true;
                        nft.codes[j].redeemedAt = new Date().toISOString();

                        // We return a simplified NFT without all other codes for efficiency
                        resultNft = {
                            id: nft.id,
                            name: nft.name,
                            description: nft.description,
                            image: nft.image,
                            createdAt: nft.createdAt
                        };
                        resultCode = nft.codes[j];
                    }
                    break;
                }
            }
            if (targetFound) break;
        }

        if (targetFound) {
            if (alreadyRedeemed) {
                return { success: false, error: "This QR code has already been redeemed." };
            } else {
                // Save updated state to PlayFab Title Internal Data
                server.SetTitleInternalData({
                    Key: NFT_DATABASE_KEY,
                    Value: JSON.stringify({ nfts: nfts })
                });
                return { success: true, message: "Token redeemed successfully.", nft: resultNft, code: resultCode };
            }
        }

        return { success: false, error: "Token not found. Invalid QR code." };
    }

    // ====================================================================================
    // D. CLEAR ALL DATA (Nuclear Wipe)
    // ====================================================================================
    if (action === "clearAll") {
        server.SetTitleInternalData({
            Key: NFT_DATABASE_KEY,
            Value: JSON.stringify({ nfts: [] })
        });
        return { success: true, message: "All NFT data cleared completely." };
    }

    return { error: "No matching action found in PlayFab cloud script." };
};


// ====================================================================================
// VERIFY, UNLOCK CHARACTER AND REDEEM TOKEN WORKFLOW
// Safe for NFC, QR, and Manual Text Entries
// ====================================================================================

handlers.verifyAndRedeemCharacter = function (args, context) {
    var rawInput = args.inputCode;
    var requestingPlayerId = currentPlayerId; // Injected by PlayFab Context

    if (!rawInput || rawInput.trim() === "") {
        return { success: false, error: "Input code cannot be empty." };
    }

    var cleanInput = rawInput.trim();
    var NFT_DATABASE_KEY = "GlobalAppNftsMasterList";

    // --- Helper: Extract Base Name (e.g., "Katsumi-001" -> "Katsumi") ---
    function extractBaseName(str) {
        if (!str) return "";
        var dashIdx = str.indexOf('-');
        return (dashIdx > 0) ? str.substring(0, dashIdx).trim() : str.trim();
    }

    var extractedName = extractBaseName(cleanInput);

    // 1. READ GLOBAL NFT DATABASE
    var serverData = server.GetTitleInternalData({ Keys: [NFT_DATABASE_KEY] });
    var nftsList = [];

    if (serverData.Data && serverData.Data[NFT_DATABASE_KEY]) {
        try {
            var parsed = JSON.parse(serverData.Data[NFT_DATABASE_KEY]);
            nftsList = parsed.nfts || [];
        } catch (e) {
            nftsList = [];
        }
    }

    var matchedNft = null;
    var matchedCodeObj = null;
    var isTokenFound = false;

    // 2. TOKEN MATCHING IN MASTER LIST
    for (var i = 0; i < nftsList.length; i++) {
        var nft = nftsList[i];
        
        // Search token list
        if (nft.codes && Array.isArray(nft.codes)) {
            for (var j = 0; j < nft.codes.length; j++) {
                if (nft.codes[j].token && nft.codes[j].token.toLowerCase() === cleanInput.toLowerCase()) {
                    matchedNft = nft;
                    matchedCodeObj = nft.codes[j];
                    isTokenFound = true;
                    break;
                }
            }
        }

        // Direct Match by NFT ID or Name fallback
        if (!isTokenFound) {
            if ((nft.id && nft.id.toLowerCase() === cleanInput.toLowerCase()) ||
                (nft.name && nft.name.toLowerCase() === extractedName.toLowerCase())) {
                matchedNft = nft;
                break;
            }
        }

        if (matchedNft) break;
    }

    // 3. CHECK IF TOKEN WAS ALREADY REDEEMED GENERALLY
    if (matchedCodeObj && matchedCodeObj.redeemed) {
        return { 
            success: false, 
            error: "This code/token has already been redeemed!" 
        };
    }

    // Determine target Character ID & Name
    var characterIdToUnlock = matchedNft ? matchedNft.id : cleanInput;
    var characterNameToUnlock = matchedNft ? matchedNft.name : extractedName;

    // 4. CHECK USER'S PERSONAL UNLOCKED INVENTORY IN USER DATA (regular PlayerData)
    var USER_UNLOCKED_KEY = "UnlockedCharacters";
    var userRecord = server.GetUserData({
        PlayFabId: requestingPlayerId,
        Keys: [USER_UNLOCKED_KEY]
    });

    var userUnlockedList = [];
    if (userRecord.Data && userRecord.Data[USER_UNLOCKED_KEY]) {
        try {
            userUnlockedList = JSON.parse(userRecord.Data[USER_UNLOCKED_KEY].Value);
        } catch (e) {
            userUnlockedList = [];
        }
    }

    // Double check if player already owns it
    for (var k = 0; k < userUnlockedList.length; k++) {
        if (userUnlockedList[k].toLowerCase() === characterIdToUnlock.toLowerCase() ||
            userUnlockedList[k].toLowerCase() === characterNameToUnlock.toLowerCase()) {
            return { 
                success: false, 
                error: characterNameToUnlock + " is already unlocked on your account!" 
            };
        }
    }

    // 5. UPDATE DB MARKING TOKEN AS REDEEMED
    if (matchedCodeObj) {
        matchedCodeObj.redeemed = true;
        matchedCodeObj.redeemedAt = new Date().toISOString();
        matchedCodeObj.redeemedBy = requestingPlayerId;

        // Save updated master database back to Title Internal Data
        server.SetTitleInternalData({
            Key: NFT_DATABASE_KEY,
            Value: JSON.stringify({ nfts: nftsList })
        });
    }

    // 6. GRANT CHARACTER TO PLAYER (Save to regular UserData — Public so admin can read it)
    userUnlockedList.push(characterIdToUnlock);
    
    var dataUpdate = {};
    dataUpdate[USER_UNLOCKED_KEY] = JSON.stringify(userUnlockedList);

    server.UpdateUserData({
        PlayFabId: requestingPlayerId,
        Data: dataUpdate,
        Permission: "Public"
    });

    return {
        success: true,
        message: characterNameToUnlock + " successfully unlocked!",
        characterId: characterIdToUnlock,
        characterName: characterNameToUnlock
    };
};

// ====================================================================================
// NOTIFICATION SYSTEM
// Handles push notifications for ban/unban, audio approval/deletion events
// ====================================================================================

handlers.notificationWorkflow = function (args, context) {
    var action = args.action;
    // Use targetPlayFabId when provided (admin reading another player's data),
    // otherwise fall back to the calling player's ID.
    var playFabId = args.targetPlayFabId || currentPlayerId;

    log.info("Notification Workflow | Action: " + action + " | PlayFabId: " + playFabId);

    switch(action) {
        case "sendNotification":
            return sendNotification(args.targetPlayFabId, args.title, args.message, args.type, args.data);
        case "getNotifications":
            return getNotifications(playFabId);
        case "markAsRead":
            return markNotificationAsRead(playFabId, args.notificationId);
        case "markAllAsRead":
            return markAllNotificationsAsRead(playFabId);
        case "deleteNotification":
            return deleteNotification(playFabId, args.notificationId);
        case "getUnreadCount":
            return getUnreadCount(playFabId);
        default:
            return { success: false, error: "Unknown action: " + action };
    }
};

function sendNotification(targetPlayFabId, title, message, type, additionalData) {
    log.info(">>> sendNotification called");
    log.info("Target: " + targetPlayFabId);
    log.info("Title: " + title);
    log.info("Type: " + type);
    
    try {
        var notifKey = "Notifications";
        
        // Get existing notifications from UserData
        var userDataResult = server.GetUserData({
            PlayFabId: targetPlayFabId,
            Keys: [notifKey]
        });

        var notifications = [];
        if (userDataResult.Data && userDataResult.Data[notifKey]) {
            try {
                notifications = JSON.parse(userDataResult.Data[notifKey].Value);
                log.info("Existing notifications count: " + notifications.length);
            } catch (e) {
                log.error("Failed to parse existing notifications: " + e);
                notifications = [];
            }
        } else {
            log.info("No existing notifications found, creating new list");
        }

        // Create new notification
        var notification = {
            id: generateId("notif"),
            title: title,
            message: message,
            type: type || "info",
            data: additionalData || {},
            read: false,
            createdAt: new Date().toISOString()
        };

        // Add to beginning of array (newest first)
        notifications.unshift(notification);
        log.info("New notification added. Total count: " + notifications.length);

        // Keep only last 50
        if (notifications.length > 50) {
            notifications = notifications.slice(0, 50);
            log.info("Trimmed to 50 notifications");
        }

        // Save to UserData (Public, readable by client)
        server.UpdateUserData({
            PlayFabId: targetPlayFabId,
            Data: {
                Notifications: JSON.stringify(notifications)
            },
            Permission: "Public"
        });

        log.info("✓ Notification saved to UserData successfully!");
        log.info("Notification ID: " + notification.id);

        return {
            success: true,
            message: "Notification sent successfully.",
            notification: notification
        };
    } catch (error) {
        log.error("✗ Error sending notification: " + error);
        return { success: false, error: error.message || "Failed to send notification." };
    }
}

function getNotifications(playFabId) {
    try {
        var notifKey = "Notifications";
        var userDataResult = server.GetUserData({
            PlayFabId: playFabId,
            Keys: [notifKey]
        });

        var notifications = [];
        if (userDataResult.Data && userDataResult.Data[notifKey]) {
            try {
                notifications = JSON.parse(userDataResult.Data[notifKey].Value);
            } catch (e) {
                log.error("Failed to parse notifications: " + e);
                notifications = [];
            }
        }

        var unreadCount = 0;
        for (var i = 0; i < notifications.length; i++) {
            if (!notifications[i].read) unreadCount++;
        }

        return {
            success: true,
            notifications: notifications,
            unreadCount: unreadCount,
            total: notifications.length
        };
    } catch (error) {
        log.error("Error getting notifications: " + error);
        return { success: false, error: error.message || "Failed to get notifications." };
    }
}

function getUnreadCount(playFabId) {
    try {
        var notifKey = "Notifications";
        var userDataResult = server.GetUserData({
            PlayFabId: playFabId,
            Keys: [notifKey]
        });

        var notifications = [];
        if (userDataResult.Data && userDataResult.Data[notifKey]) {
            try {
                notifications = JSON.parse(userDataResult.Data[notifKey].Value);
            } catch (e) {
                return { success: true, unreadCount: 0 };
            }
        }

        var unreadCount = 0;
        for (var i = 0; i < notifications.length; i++) {
            if (!notifications[i].read) unreadCount++;
        }

        return { success: true, unreadCount: unreadCount };
    } catch (error) {
        return { success: true, unreadCount: 0 };
    }
}

function markNotificationAsRead(playFabId, notificationId) {
    try {
        var notifKey = "Notifications";
        var userDataResult = server.GetUserData({
            PlayFabId: playFabId,
            Keys: [notifKey]
        });

        var notifications = [];
        if (userDataResult.Data && userDataResult.Data[notifKey]) {
            notifications = JSON.parse(userDataResult.Data[notifKey].Value);
        }

        var found = false;
        for (var i = 0; i < notifications.length; i++) {
            if (notifications[i].id === notificationId) {
                notifications[i].read = true;
                found = true;
                break;
            }
        }

        if (!found) {
            return { success: false, error: "Notification not found." };
        }

        server.UpdateUserData({
            PlayFabId: playFabId,
            Data: {
                Notifications: JSON.stringify(notifications)
            },
            Permission: "Public"
        });

        return { success: true, message: "Notification marked as read." };
    } catch (error) {
        log.error("Error marking notification as read: " + error);
        return { success: false, error: error.message || "Failed to mark notification as read." };
    }
}

function markAllNotificationsAsRead(playFabId) {
    try {
        var notifKey = "Notifications";
        var userDataResult = server.GetUserData({
            PlayFabId: playFabId,
            Keys: [notifKey]
        });

        var notifications = [];
        if (userDataResult.Data && userDataResult.Data[notifKey]) {
            notifications = JSON.parse(userDataResult.Data[notifKey].Value);
        }

        for (var i = 0; i < notifications.length; i++) {
            notifications[i].read = true;
        }

        server.UpdateUserData({
            PlayFabId: playFabId,
            Data: {
                Notifications: JSON.stringify(notifications)
            },
            Permission: "Public"
        });

        return { success: true, message: "All notifications marked as read." };
    } catch (error) {
        log.error("Error marking all notifications as read: " + error);
        return { success: false, error: error.message || "Failed to mark all as read." };
    }
}

function deleteNotification(playFabId, notificationId) {
    try {
        var notifKey = "Notifications";
        var userDataResult = server.GetUserData({
            PlayFabId: playFabId,
            Keys: [notifKey]
        });

        var notifications = [];
        if (userDataResult.Data && userDataResult.Data[notifKey]) {
            notifications = JSON.parse(userDataResult.Data[notifKey].Value);
        }

        var originalLength = notifications.length;
        var filtered = [];
        for (var i = 0; i < notifications.length; i++) {
            if (notifications[i].id !== notificationId) {
                filtered.push(notifications[i]);
            }
        }

        if (filtered.length === originalLength) {
            return { success: false, error: "Notification not found." };
        }

        server.UpdateUserData({
            PlayFabId: playFabId,
            Data: {
                Notifications: JSON.stringify(filtered)
            },
            Permission: "Public"
        });

        return { success: true, message: "Notification deleted." };
    } catch (error) {
        log.error("Error deleting notification: " + error);
        return { success: false, error: error.message || "Failed to delete notification." };
    }
}

function generateId(prefix) {
    var timestamp = Date.now().toString(36);
    var randomPart = Math.random().toString(36).substring(2, 10);
    return (prefix || "id") + "_" + timestamp + "_" + randomPart;
}

// ====================================================================================
// TEST & DEBUG NOTIFICATION SYSTEM
// ====================================================================================

handlers.testNotificationSystem = function(args, context) {
    var testType = args.testType || "sendTest";
    var targetPlayFabId = args.targetPlayFabId || currentPlayerId;
    
    log.info("=== NOTIFICATION TEST START ===");
    log.info("Test Type: " + testType);
    log.info("Target PlayFabId: " + targetPlayFabId);
    
    // Test 1: Send Test Notification
    if (testType === "sendTest") {
        var result = sendNotification(
            targetPlayFabId,
            "Test Notification",
            "This is a test notification sent at " + new Date().toISOString(),
            "info",
            { testData: "123", timestamp: Date.now() }
        );
        log.info("Send Result: " + JSON.stringify(result));
        return result;
    }
    
    // Test 2: Send Ban Notification
    if (testType === "testBan") {
        return sendNotification(
            targetPlayFabId,
            "Account Suspended",
            "Your account has been temporarily suspended. Please contact support for more information.",
            "ban",
            { reason: "Test ban notification" }
        );
    }
    
    // Test 3: Send Unban Notification
    if (testType === "testUnban") {
        return sendNotification(
            targetPlayFabId,
            "Account Restored",
            "Your account suspension has been lifted. Welcome back!",
            "unban",
            {}
        );
    }
    
    // Test 4: Send Audio Approved Notification
    if (testType === "testAudioApprove") {
        return sendNotification(
            targetPlayFabId,
            "Song Approved!",
            "Your song 'Test Song Title' has been approved and is now live!",
            "audio_approved",
            { songId: "test_song_123", songTitle: "Test Song Title" }
        );
    }
    
    // Test 5: Send Audio Deleted Notification
    if (testType === "testAudioDelete") {
        return sendNotification(
            targetPlayFabId,
            "Song Removed",
            "Your song 'Test Song Title' has been removed from the platform.",
            "audio_deleted",
            { songId: "test_song_123", songTitle: "Test Song Title" }
        );
    }
    
    // Test 6: Get All Notifications
    if (testType === "getAll") {
        var getAllResult = getNotifications(targetPlayFabId);
        log.info("Get All Result: " + JSON.stringify(getAllResult));
        return getAllResult;
    }
    
    // Test 7: Check Raw Storage
    if (testType === "checkStorage") {
        var rawData = server.GetUserData({
            PlayFabId: targetPlayFabId,
            Keys: ["Notifications"]
        });
        
        if (rawData.Data && rawData.Data.Notifications) {
            return {
                success: true,
                rawValue: rawData.Data.Notifications.Value,
                lastUpdated: rawData.Data.Notifications.LastUpdated
            };
        }
        
        return { success: false, error: "No notifications found in storage" };
    }
    
    // Test 8: Clear All Notifications (for testing)
    if (testType === "clearAll") {
        server.UpdateUserData({
            PlayFabId: targetPlayFabId,
            Data: {
                Notifications: JSON.stringify([])
            },
            Permission: "Public"
        });
        return { success: true, message: "All notifications cleared" };
    }
    
    // Test 9: Send Multiple Notifications
    if (testType === "sendMultiple") {
        var count = args.count || 5;
        var results = [];
        
        for (var i = 0; i < count; i++) {
            var result = sendNotification(
                targetPlayFabId,
                "Test Notification #" + (i + 1),
                "This is test notification number " + (i + 1),
                "info",
                { index: i + 1 }
            );
            results.push(result);
        }
        
        return {
            success: true,
            message: "Sent " + count + " notifications",
            results: results
        };
    }
    
    log.info("=== NOTIFICATION TEST END ===");
    return { error: "Unknown test type: " + testType };
};

// ====================================================================================
// ====================================================================================
// ADMIN USER MANAGEMENT WORKFLOW — Direct PlayFab Player Retrieval (v3.0.0)
// Completely decoupled from Title Internal Data / GlobalAppUsersRegistry.
// Queries PlayFab real player accounts directly with pagination & admin security.
// ====================================================================================

// ====================================================================================
// FIREBASE REST SYNC HELPER (Cloud Firestore & Realtime Database)
// Automatically creates or updates the player's document in Firebase from CloudScript.
// ====================================================================================
/* Firebase sync service credentials.

   These are intentionally BLANK in the repo -- github.com/MA-Ciel/KangiAdminApp
   is public, and a password committed here would be world-readable forever, in
   history, even after a later removal.

   Fill them in on the PlayFab CloudScript revision only. The revision that runs
   is not the file in git, so the running code can carry the secret while the
   repo does not. CloudScript source is never exposed to game clients.

   If Title Internal Data is set later, it is used only when these are blank. */
var FIREBASE_SVC_EMAIL    = "ak25117@gmail.com";
var FIREBASE_SVC_PASSWORD = "Kashan@1";

// Cached for the lifetime of a single CloudScript execution so that a batch
// sync signs in once rather than once per player.
var _fbTokenCache = null;

/* Exchange the dedicated service identity's credentials for a Firebase ID
   token. The credentials live in Title *Internal* Data, which only server-side
   CloudScript can read -- they are never exposed to a game client.

   Note: this is deliberately NOT a Google service-account JWT. Minting one
   requires RS256-signing a 2048-bit assertion, and the Legacy CloudScript
   sandbox exposes no crypto primitives (no require, no Buffer, no subtle) and
   caps execution time. See the security rules for how this uid is scoped. */
function _firebaseGetIdToken(apiKey, email, password) {
    if (_fbTokenCache) return { success: true, idToken: _fbTokenCache };

    if (!email || !password) {
        return {
            success: false,
            error: "Firebase service credentials missing. Set Firebase_SvcEmail and " +
                   "Firebase_SvcPassword in Title Internal Data."
        };
    }

    var signInUrl = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" +
                    encodeURIComponent(apiKey);
    var signInBody = JSON.stringify({ email: email, password: password, returnSecureToken: true });

    var raw;
    try {
        raw = http.request(signInUrl, "post", signInBody, "application/json", null);
    } catch (eSignIn) {
        return { success: false, error: "Firebase sign-in request failed: " + (eSignIn.message || String(eSignIn)) };
    }

    var parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (eParse) {
        return { success: false, error: "Firebase sign-in returned unparseable body: " + String(raw).slice(0, 200) };
    }

    if (!parsed || !parsed.idToken) {
        var reason = (parsed && parsed.error && parsed.error.message) ? parsed.error.message : "no idToken in response";
        return { success: false, error: "Firebase sign-in rejected: " + reason };
    }

    _fbTokenCache = parsed.idToken;
    return { success: true, idToken: parsed.idToken };
}

function _syncPlayerToFirebase(playFabId, displayName, email, avatarUrl, additionalFields) {
    if (!playFabId) return { success: false, error: "No playFabId provided" };

    try {
        // Read Title Internal Data settings for Firebase (or fallback to defaults)
        var titleData = server.GetTitleInternalData({
            Keys: ["Firebase_ProjectId", "Firebase_ApiKey", "Firebase_Collection",
                   "Firebase_DbType", "Firebase_DbUrl", "Firebase_SvcEmail", "Firebase_SvcPassword"]
        });
        var td = (titleData && titleData.Data) ? titleData.Data : {};

        var projectId      = td["Firebase_ProjectId"]  || "dance-withmii";
        var apiKey         = td["Firebase_ApiKey"]     || "AIzaSyBArP6gJqVhhdDTZ2XLINBYIvPMmON7EFM";
        var collectionName = td["Firebase_Collection"] || "users";
        var dbType         = td["Firebase_DbType"]     || "firestore"; // 'firestore' or 'rtdb'
        var dbUrl          = td["Firebase_DbUrl"]      || "";
        // Hardcoded revision values win; Title Internal Data is the fallback.
        var svcEmail       = FIREBASE_SVC_EMAIL    || td["Firebase_SvcEmail"]    || "";
        var svcPassword    = FIREBASE_SVC_PASSWORD || td["Firebase_SvcPassword"] || "";

        // An API key is not authentication. Every write below carries a real
        // Firebase ID token so the security rules can scope it to one uid.
        var auth = _firebaseGetIdToken(apiKey, svcEmail, svcPassword);
        if (!auth.success) {
            log.error("[FirebaseSync] Auth failed for player " + playFabId + ": " + auth.error);
            return { success: false, error: auth.error };
        }
        var authHeaders = { "Authorization": "Bearer " + auth.idToken };

        var nowIso = new Date().toISOString();
        var safeName = displayName || "";
        var safeEmail = email || "";
        var safeAvatar = avatarUrl || "";

        // If displayName or email are empty, try fetching from PlayFab Account Info
        if (!safeName || !safeEmail) {
            try {
                var accInfo = server.GetUserAccountInfo({ PlayFabId: playFabId });
                if (accInfo && accInfo.UserInfo) {
                    if (!safeName && accInfo.UserInfo.TitleInfo && accInfo.UserInfo.TitleInfo.DisplayName) {
                        safeName = accInfo.UserInfo.TitleInfo.DisplayName;
                    }
                    if (!safeName && accInfo.UserInfo.Username) {
                        safeName = accInfo.UserInfo.Username;
                    }
                    if (!safeEmail && accInfo.UserInfo.PrivateInfo && accInfo.UserInfo.PrivateInfo.Email) {
                        safeEmail = accInfo.UserInfo.PrivateInfo.Email;
                    }
                }
            } catch (eAcc) {}
        }

        if (dbType === "rtdb") {
            // Realtime Database REST API: PATCH /users/{playFabId}.json
            // RTDB takes the ID token in ?auth= (it accepts Firebase ID tokens there).
            var rtdbUrl = dbUrl || ("https://" + projectId + "-default-rtdb.firebaseio.com");
            var rtdbEndpoint = rtdbUrl + "/" + encodeURIComponent(collectionName) + "/" +
                               encodeURIComponent(playFabId) + ".json?auth=" + encodeURIComponent(auth.idToken);

            var rtdbPayload = {
                playFabId:   playFabId,
                displayName: safeName || ("Player " + String(playFabId).slice(-4)),
                email:       safeEmail,
                avatarUrl:   safeAvatar,
                updatedAt:   nowIso
            };
            if (additionalFields && typeof additionalFields === "object") {
                for (var k in additionalFields) {
                    if (additionalFields.hasOwnProperty(k)) rtdbPayload[k] = additionalFields[k];
                }
            }

            var rtdbRes;
            try {
                rtdbRes = http.request(rtdbEndpoint, "patch", JSON.stringify(rtdbPayload), "application/json", null);
            } catch (eRtdb) {
                log.error("[FirebaseSync] RTDB write failed for " + playFabId + ": " + (eRtdb.message || String(eRtdb)));
                return { success: false, dbType: "rtdb", error: "RTDB write failed: " + (eRtdb.message || String(eRtdb)) };
            }

            // A successful PATCH echoes the written object back. Anything else
            // (notably an {"error": ...} body) means the write did not land.
            var rtdbParsed = null;
            try { rtdbParsed = JSON.parse(rtdbRes); } catch (eRp) {}
            if (rtdbParsed && rtdbParsed.error) {
                log.error("[FirebaseSync] RTDB rejected write for " + playFabId + ": " + rtdbParsed.error);
                return { success: false, dbType: "rtdb", error: "RTDB rejected write: " + rtdbParsed.error };
            }

            return { success: true, dbType: "rtdb", response: rtdbRes };
        } else {
            // Cloud Firestore REST API: PATCH /projects/{projectId}/databases/(default)/documents/{collection}/{playFabId}
            var firestoreEndpoint = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(projectId) +
                                    "/databases/(default)/documents/" + encodeURIComponent(collectionName) + "/" + encodeURIComponent(playFabId);

            var fields = {
                playFabId:   { stringValue: String(playFabId) },
                displayName: { stringValue: String(safeName || ("Player " + String(playFabId).slice(-4))) },
                email:       { stringValue: String(safeEmail) },
                avatarUrl:   { stringValue: String(safeAvatar) },
                lastLogin:   { stringValue: nowIso }
            };
            if (additionalFields && additionalFields.isNewRegistration) {
                fields.createdAt = { stringValue: nowIso };
            }

            // Without an explicit updateMask a PATCH replaces the whole document,
            // which would wipe createdAt on every subsequent login.
            var maskQuery = "";
            for (var f in fields) {
                if (fields.hasOwnProperty(f)) {
                    maskQuery += (maskQuery ? "&" : "?") + "updateMask.fieldPaths=" + encodeURIComponent(f);
                }
            }
            firestoreEndpoint += maskQuery;

            var firestorePayload = { fields: fields };
            var fsRes;
            try {
                fsRes = http.request(firestoreEndpoint, "patch", JSON.stringify(firestorePayload), "application/json", authHeaders);
            } catch (eFs) {
                log.error("[FirebaseSync] Firestore write failed for " + playFabId + ": " + (eFs.message || String(eFs)));
                return { success: false, dbType: "firestore", error: "Firestore write failed: " + (eFs.message || String(eFs)) };
            }

            // Firestore echoes the written document, including its resource name.
            // No name means the write did not land, whatever the status code was.
            var fsParsed = null;
            try { fsParsed = JSON.parse(fsRes); } catch (eFp) {}
            if (!fsParsed || !fsParsed.name) {
                var fsReason = (fsParsed && fsParsed.error && fsParsed.error.message)
                    ? fsParsed.error.message
                    : String(fsRes).slice(0, 200);
                log.error("[FirebaseSync] Firestore rejected write for " + playFabId + ": " + fsReason);
                return { success: false, dbType: "firestore", error: "Firestore rejected write: " + fsReason };
            }

            return { success: true, dbType: "firestore", document: fsParsed.name };
        }
    } catch (err) {
        log.error("[FirebaseSync] Error syncing player " + playFabId + ": " + (err.message || JSON.stringify(err)));
        return { success: false, error: err.message || String(err) };
    }
}

handlers.adminUserWorkflow = function (args, context) {
    var CLOUDSCRIPT_VERSION = "3.1.0-firebase-sync";
    var action = args.action;

    // ── 1. Admin Authentication Check ──
    var callerId = currentPlayerId;
    var isCallerAdmin = false;
    try {
        var callerUd = server.GetUserData({ PlayFabId: callerId, Keys: ["IsAdmin"] });
        if (callerUd && callerUd.Data && callerUd.Data.IsAdmin && callerUd.Data.IsAdmin.Value === "true") {
            isCallerAdmin = true;
        }
    } catch (e) {}

    // Allow registerUser without admin privileges (called on player login/registration)
    if (action !== "registerUser" && !isCallerAdmin) {
        return { success: false, error: "Unauthorized: Administrator privileges required." };
    }

    // ====================================================================================
    // A. REGISTER USER — Records the player into a LIVE PlayFab registry and syncs to Firebase
    //    Called by game client on registration/login or automatically triggered.
    // ====================================================================================
    if (action === "registerUser") {
        var REGISTRY_GROUP_ID = "AllRegisteredPlayers";
        var isNewReg = false;

        // 1. Save/refresh basic profile fields on the player's own UserData
        try {
            var existing = server.GetUserData({ PlayFabId: callerId, Keys: ["RegisteredAt"] });
            var alreadyRegistered = !!(existing && existing.Data && existing.Data.RegisteredAt);
            isNewReg = !alreadyRegistered;

            var dataToSet = {
                DisplayName: args.displayName || "",
                Email:       args.email       || "",
                AvatarUrl:   args.avatarUrl    || ""
            };
            if (!alreadyRegistered) {
                dataToSet.RegisteredAt = new Date().toISOString();
            }
            server.UpdateUserData({ PlayFabId: callerId, Data: dataToSet, Permission: "Private" });
        } catch (eUd) {
            log.error("registerUser: failed to write UserData for " + callerId + ": " + eUd);
        }

        // 2. Add the player to the live registry group
        try {
            server.AddSharedGroupMembers({ SharedGroupId: REGISTRY_GROUP_ID, PlayFabIds: [callerId] });
        } catch (eGroup) {
            try {
                server.CreateSharedGroup({ SharedGroupId: REGISTRY_GROUP_ID });
                server.AddSharedGroupMembers({ SharedGroupId: REGISTRY_GROUP_ID, PlayFabIds: [callerId] });
            } catch (eCreate) {
                log.error("registerUser: failed to add " + callerId + " to registry group: " + eCreate);
            }
        }

        // 3. Automatic Firebase Document Sync via REST API
        var fbSyncResult = _syncPlayerToFirebase(callerId, args.displayName, args.email, args.avatarUrl, { isNewRegistration: isNewReg });

        return { 
            success: true, 
            version: CLOUDSCRIPT_VERSION, 
            message: "Player registered in PlayFab and synced to Firebase.",
            firebaseSync: fbSyncResult
        };
    }

    // ====================================================================================
    // B. GET ALL USERS — LIVE read from the "AllRegisteredPlayers" Shared Group.
    //
    //    Replaces the old Segment Export flow (ExportPlayersInSegment / GetSegmentExport),
    //    which snapshots segment membership and can lag behind brand-new registrations.
    //    Membership in the Shared Group is written synchronously by "registerUser", so a
    //    player who just registered shows up here immediately — no polling, no wait.
    //
    //    Returns status:"complete" directly (single round trip, no exportId/poll step).
    // ====================================================================================
    if (action === "getAllUsers") {
        var REGISTRY_GROUP_ID = "AllRegisteredPlayers";
        var rawPlayers = [];

        var memberIds = [];
        try {
            var sgData = server.GetSharedGroupData({ SharedGroupId: REGISTRY_GROUP_ID, GetMembers: true });
            if (sgData && sgData.Members) {
                for (var mi = 0; mi < sgData.Members.length; mi++) {
                    memberIds.push(sgData.Members[mi].PlayFabId);
                }
            }
        } catch (eGroup) {
            // Group not created yet (no one has registered) — treat as empty list, not an error.
            log.info("getAllUsers: registry group not found or empty: " + eGroup);
        }

        log.info("getAllUsers: " + memberIds.length + " player(s) in live registry");

        for (var pi = 0; pi < memberIds.length; pi++) {
            var pfId = memberIds[pi];
            try {
                var ud = server.GetUserData({
                    PlayFabId: pfId,
                    Keys: ["DisplayName", "Email", "AvatarUrl", "RegisteredAt", "IsAdmin", "IsBanned", "IsPremium"]
                });
                var d = (ud && ud.Data) ? ud.Data : {};

                var dName = d.DisplayName ? d.DisplayName.Value : "";
                var dEmail = d.Email ? d.Email.Value : "";
                if (!dName && dEmail) dName = dEmail.split("@")[0];
                if (!dName) dName = "Player " + pfId.slice(-4);

                rawPlayers.push({
                    playFabId:   pfId,
                    displayName: dName,
                    email:       dEmail,
                    avatarUrl:   d.AvatarUrl ? d.AvatarUrl.Value : "",
                    isAdmin:     !!(d.IsAdmin  && d.IsAdmin.Value  === "true"),
                    isBanned:    !!(d.IsBanned && d.IsBanned.Value === "true"),
                    isPremium:   !!(d.IsPremium && d.IsPremium.Value === "true"),
                    created:     d.RegisteredAt ? d.RegisteredAt.Value : "",
                    lastLogin:   ""
                });
            } catch (eUser) {
                log.error("getAllUsers: failed to read UserData for " + pfId + ": " + eUser);
                // Skip this player rather than failing the whole list
            }
        }

        log.info("getAllUsers: returning " + rawPlayers.length + " players from live registry");
        return {
            success: true,
            status:  "complete",
            users:   rawPlayers,
            total:   rawPlayers.length,
            source:  "shared_group_live",
            version: CLOUDSCRIPT_VERSION
        };
    }

    // ====================================================================================
    // B2. GET EXPORT RESULT — LEGACY. getAllUsers no longer starts an export (it now
    //     returns status:"complete" immediately from the live registry above), so the
    //     client never calls this anymore. Left in place only for backward compatibility
    //     in case anything old still calls it directly.
    //     Returns { status: "pending" } if still processing, or
    //             { status: "complete", users: [...] } when done.
    // ====================================================================================
    if (action === "getExportResult") {
        var exportId  = args.exportId  || "";
        var segmentId = (args.segmentId && args.segmentId.trim()) ? args.segmentId.trim() : "39DB56B86E752167";

        if (!exportId) {
            return { success: false, error: "exportId is required for getExportResult." };
        }

        // Retrieve secret key
        var secretKey = "";
        try {
            var skData2 = server.GetTitleInternalData({ Keys: ["PlayFabSecretKey", "DeveloperSecretKey"] });
            if (skData2 && skData2.Data) {
                secretKey = skData2.Data["PlayFabSecretKey"] || skData2.Data["DeveloperSecretKey"] || "";
            }
        } catch (e) {
            log.error("getExportResult: failed to read secret key: " + e);
        }

        if (!secretKey) {
            return { success: false, error: "Server configuration error: PlayFabSecretKey not found in Title Internal Data." };
        }

        // Poll GetSegmentExport
        var pollUrl     = "https://182E5E.playfabapi.com/Admin/GetSegmentExport";
        var pollReqBody = JSON.stringify({ ExportId: exportId });
        var pollRes;
        try {
            var pollRawRes = http.request(
                pollUrl,
                "POST",
                pollReqBody,
                "application/json",
                { "X-SecretKey": secretKey, "Content-Type": "application/json" }
            );
            var pollParsed = JSON.parse(pollRawRes);
            pollRes = pollParsed.data || pollParsed;
        } catch (errPoll) {
            log.error("getExportResult: GetSegmentExport failed: " + JSON.stringify(errPoll));
            return { success: false, error: "GetSegmentExport request failed: " + (errPoll.message || JSON.stringify(errPoll)) };
        }

        var exportState = (pollRes && pollRes.State) ? pollRes.State : "Unknown";
        log.info("getExportResult: state=" + exportState + " exportId=" + exportId);

        // Not yet complete — tell the client to retry
        if (exportState !== "Complete") {
            return {
                success:  true,
                status:   "pending",
                state:    exportState,
                exportId: exportId,
                version:  CLOUDSCRIPT_VERSION
            };
        }

        // Export is complete — download index file, then each fragment
        var indexUrl = pollRes.IndexUrl || "";
        if (!indexUrl) {
            return { success: false, error: "Export is Complete but IndexUrl is missing in GetSegmentExport response." };
        }

        // Download the index file (plain text, each line = a fragment URL)
        var fragmentUrls = [];
        try {
            var indexContent = http.request(indexUrl, "GET", "", "text/plain", {});
            var lines = indexContent.split(/\r?\n/);
            for (var li = 0; li < lines.length; li++) {
                var line = lines[li].trim();
                if (line) fragmentUrls.push(line);
            }
        } catch (errIndex) {
            log.error("getExportResult: failed to download index file: " + JSON.stringify(errIndex));
            return { success: false, error: "Failed to download export index file: " + (errIndex.message || JSON.stringify(errIndex)) };
        }

        log.info("getExportResult: " + fragmentUrls.length + " fragment(s) to download");

        // Download each fragment and parse TSV rows into player objects
        // TSV columns: PlayerId, DisplayName, Email (not always present), AvatarUrl, Created, LastLogin, BannedUntil
        var rawPlayers = [];
        for (var fi = 0; fi < fragmentUrls.length; fi++) {
            try {
                var tsvContent = http.request(fragmentUrls[fi], "GET", "", "text/plain", {});
                var rows = tsvContent.split(/\r?\n/);
                // First row is the header
                if (rows.length < 2) continue;
                var headers = rows[0].split("\t");
                var colIdx  = {};
                for (var hi = 0; hi < headers.length; hi++) {
                    colIdx[headers[hi].trim()] = hi;
                }
                for (var ri = 1; ri < rows.length; ri++) {
                    var row = rows[ri];
                    if (!row.trim()) continue;
                    var cols = row.split("\t");
                    var pfId = (colIdx["PlayerId"]    !== undefined ? (cols[colIdx["PlayerId"]]    || "").trim() : "");
                    if (!pfId) continue;
                    var dName     = (colIdx["DisplayName"]  !== undefined ? (cols[colIdx["DisplayName"]]  || "").trim() : "");
                    var dEmail    = (colIdx["Email"]         !== undefined ? (cols[colIdx["Email"]]         || "").trim() : "");
                    var dAvatar   = (colIdx["AvatarUrl"]     !== undefined ? (cols[colIdx["AvatarUrl"]]     || "").trim() : "");
                    var dCreated  = (colIdx["Created"]       !== undefined ? (cols[colIdx["Created"]]       || "").trim() : "");
                    var dLastLogin= (colIdx["LastLogin"]     !== undefined ? (cols[colIdx["LastLogin"]]     || "").trim() : "");
                    var dBannedUntil = (colIdx["BannedUntil"] !== undefined ? (cols[colIdx["BannedUntil"]] || "").trim() : "");

                    // Derive friendly name if missing
                    if (!dName && dEmail) dName = dEmail.split("@")[0];
                    if (!dName)           dName = "Player " + pfId.slice(-4);

                    var isBanned = false;
                    if (dBannedUntil) {
                        try { isBanned = new Date(dBannedUntil) > new Date(); } catch (e) {}
                    }

                    rawPlayers.push({
                        playFabId:   pfId,
                        displayName: dName,
                        email:       dEmail,
                        avatarUrl:   dAvatar,
                        isAdmin:     false, // enriched below
                        isBanned:    isBanned,
                        created:     dCreated,
                        lastLogin:   dLastLogin
                    });
                }
            } catch (errFrag) {
                log.error("getExportResult: failed to download fragment " + fi + ": " + JSON.stringify(errFrag));
                // Continue — partial data is better than total failure
            }
        }

        log.info("getExportResult: parsed " + rawPlayers.length + " raw player rows");

        // Enrich with IsAdmin / IsBanned from UserData (source of truth for these flags)
        // Batch in groups of 10 to avoid rate limits
        var enriched = [];
        for (var ei = 0; ei < rawPlayers.length; ei++) {
            var rp = rawPlayers[ei];
            try {
                var ud = server.GetUserData({ PlayFabId: rp.playFabId, Keys: ["IsAdmin", "IsBanned", "IsPremium"] });
                if (ud && ud.Data) {
                    if (ud.Data.IsAdmin  && ud.Data.IsAdmin.Value  === "true") rp.isAdmin  = true;
                    if (ud.Data.IsBanned && ud.Data.IsBanned.Value === "true") rp.isBanned = true;
                    if (ud.Data.IsPremium && ud.Data.IsPremium.Value === "true") rp.isPremium = true;
                }
            } catch (eEnrich) {
                // Non-fatal — keep isAdmin:false, isBanned from TSV
            }
            enriched.push(rp);
        }

        log.info("getExportResult: enrichment done, returning " + enriched.length + " players");
        return {
            success:   true,
            status:    "complete",
            users:     enriched,
            total:     enriched.length,
            segmentId: segmentId,
            source:    "playfab_export",
            version:   CLOUDSCRIPT_VERSION
        };
    }

    // ====================================================================================
    // C. MAKE ADMIN — accepts email OR playFabId, sets IsAdmin = "true" in UserData
    // ====================================================================================
    if (action === "makeAdmin") {
        var targetEmail  = args.email      || "";
        var targetPfId   = args.playFabId  || "";

        // Resolve PlayFabId — prefer direct id, fallback to email lookup
        var resolvedId   = "";
        var resolvedName = "";
        var resolvedEmail = targetEmail;

        if (targetPfId) {
            resolvedId = targetPfId;
            try {
                var pfInfo = server.GetUserAccountInfo({ PlayFabId: targetPfId });
                resolvedName  = (pfInfo.UserInfo && pfInfo.UserInfo.TitleInfo && pfInfo.UserInfo.TitleInfo.DisplayName) ? pfInfo.UserInfo.TitleInfo.DisplayName : targetPfId;
                resolvedEmail = (pfInfo.UserInfo && pfInfo.UserInfo.PrivateInfo && pfInfo.UserInfo.PrivateInfo.Email) ? pfInfo.UserInfo.PrivateInfo.Email : targetEmail;
            } catch (e) { resolvedName = targetPfId; }
        } else if (targetEmail) {
            try {
                var emailLookup = server.GetUserAccountInfo({ Email: targetEmail });
                if (!emailLookup || !emailLookup.UserInfo) return { success: false, error: "No account found with that email." };
                resolvedId    = emailLookup.UserInfo.PlayFabId;
                resolvedName  = (emailLookup.UserInfo.TitleInfo && emailLookup.UserInfo.TitleInfo.DisplayName) ? emailLookup.UserInfo.TitleInfo.DisplayName : targetEmail;
            } catch (e) { return { success: false, error: "No account found with that email address." }; }
        } else {
            return { success: false, error: "Email or PlayFabId is required." };
        }

        if (!resolvedId) return { success: false, error: "Could not resolve user." };

        // Set IsAdmin in player UserData
        server.UpdateUserData({
            PlayFabId:  resolvedId,
            Data:       { "IsAdmin": "true" },
            Permission: "Public"
        });

        // Send notification
        log.info("Sending admin granted notification to: " + resolvedId);
        var adminNotifResult = sendNotification(
            resolvedId,
            "Admin Access Granted",
            "You have been granted admin privileges on the platform.",
            "admin_granted",
            { grantedAt: new Date().toISOString() }
        );

        return { success: true, message: "Admin granted.", playFabId: resolvedId, displayName: resolvedName, email: resolvedEmail };
    }

    // ====================================================================================
    // D. REVOKE ADMIN — accepts email OR playFabId
    // ====================================================================================
    if (action === "revokeAdmin") {
        var rEmail  = args.email     || "";
        var rPfId   = args.playFabId || "";
        var rId     = "";

        if (rPfId) {
            rId = rPfId;
        } else if (rEmail) {
            try {
                var rLookup = server.GetUserAccountInfo({ Email: rEmail });
                if (!rLookup || !rLookup.UserInfo) return { success: false, error: "No account found." };
                rId = rLookup.UserInfo.PlayFabId;
            } catch (e) { return { success: false, error: "No account found with that email." }; }
        } else {
            return { success: false, error: "Email or PlayFabId is required." };
        }

        server.UpdateUserData({
            PlayFabId:  rId,
            Data:       { "IsAdmin": "false" },
            Permission: "Public"
        });

        // Send notification
        log.info("Sending admin revoked notification to: " + rId);
        var revokeNotifResult = sendNotification(
            rId,
            "Admin Access Revoked",
            "Your admin privileges have been revoked.",
            "admin_revoked",
            { revokedAt: new Date().toISOString() }
        );

        return { success: true, message: "Admin revoked.", playFabId: rId, email: rEmail };
    }

    // ====================================================================================
    // D2. PREMIUM — grant/revoke music upload access. Sets IsPremium in UserData.
    //     Permission "Public" matches IsAdmin/IsBanned so the Unity client can read
    //     it back through PlayFabClientAPI.GetUserData.
    // ====================================================================================
    if (action === "makePremium" || action === "revokePremium") {
        var granting  = (action === "makePremium");
        var pEmail    = args.email     || "";
        var pPfId     = args.playFabId || "";
        var pId       = "";
        var pName     = "";

        if (pPfId) {
            pId = pPfId;
            try {
                var pInfo = server.GetUserAccountInfo({ PlayFabId: pPfId });
                pName = (pInfo.UserInfo && pInfo.UserInfo.TitleInfo && pInfo.UserInfo.TitleInfo.DisplayName)
                    ? pInfo.UserInfo.TitleInfo.DisplayName : pPfId;
                if (!pEmail && pInfo.UserInfo && pInfo.UserInfo.PrivateInfo) {
                    pEmail = pInfo.UserInfo.PrivateInfo.Email || "";
                }
            } catch (e) { pName = pPfId; }
        } else if (pEmail) {
            try {
                var pLookup = server.GetUserAccountInfo({ Email: pEmail });
                if (!pLookup || !pLookup.UserInfo) return { success: false, error: "No account found with that email." };
                pId   = pLookup.UserInfo.PlayFabId;
                pName = (pLookup.UserInfo.TitleInfo && pLookup.UserInfo.TitleInfo.DisplayName)
                    ? pLookup.UserInfo.TitleInfo.DisplayName : pEmail;
            } catch (e) { return { success: false, error: "No account found with that email address." }; }
        } else {
            return { success: false, error: "Email or PlayFabId is required." };
        }

        if (!pId) return { success: false, error: "Could not resolve user." };

        server.UpdateUserData({
            PlayFabId:  pId,
            Data:       { "IsPremium": granting ? "true" : "false" },
            Permission: "Public"
        });

        sendNotification(
            pId,
            granting ? "Premium Unlocked" : "Premium Ended",
            granting
                ? "You can now upload your own music. Every track is reviewed by an admin before it goes live."
                : "Your premium access has ended. Music uploads are no longer available on your account.",
            granting ? "premium_granted" : "premium_revoked",
            { changedAt: new Date().toISOString() }
        );

        return {
            success:     true,
            message:     granting ? "Premium granted." : "Premium revoked.",
            isPremium:   granting,
            playFabId:   pId,
            displayName: pName,
            email:       pEmail
        };
    }

    // ====================================================================================
    // E. BAN USER — accepts email OR playFabId + sends notification
    // ====================================================================================
    if (action === "banUser") {
        var bEmail = args.email     || "";
        var bPfId  = args.playFabId || "";
        var bId    = "";
        var bName  = "";

        if (bPfId) {
            bId = bPfId;
            try {
                var bInfo = server.GetUserAccountInfo({ PlayFabId: bPfId });
                bName = (bInfo.UserInfo && bInfo.UserInfo.TitleInfo && bInfo.UserInfo.TitleInfo.DisplayName) ? bInfo.UserInfo.TitleInfo.DisplayName : bPfId;
            } catch (e) { bName = bPfId; }
        } else if (bEmail) {
            try {
                var bLookup = server.GetUserAccountInfo({ Email: bEmail });
                if (!bLookup || !bLookup.UserInfo) return { success: false, error: "No account found." };
                bId   = bLookup.UserInfo.PlayFabId;
                bName = (bLookup.UserInfo.TitleInfo && bLookup.UserInfo.TitleInfo.DisplayName) ? bLookup.UserInfo.TitleInfo.DisplayName : bEmail;
            } catch (e) { return { success: false, error: "No account found with that email." }; }
        } else {
            return { success: false, error: "Email or PlayFabId is required." };
        }

        server.UpdateUserData({
            PlayFabId:  bId,
            Data:       { "IsBanned": "true", "IsAdmin": "false" },
            Permission: "Public"
        });

        try { server.BanUsers({ Bans: [{ PlayFabId: bId, Reason: "Banned via Kangi Admin Dashboard", DurationInHours: 87600 }] }); } catch (e) {}

        // Send notification to user
        sendNotification(
            bId,
            "Account Suspended",
            "Your account has been temporarily suspended. Please contact support for more information.",
            "ban",
            { reason: "Banned via Kangi Admin Dashboard" }
        );

        return { success: true, message: "User banned.", playFabId: bId, displayName: bName, email: bEmail };
    }

    // ====================================================================================
    // F. UNBAN USER — accepts email OR playFabId + sends notification
    //    Removes IsBanned from UserData AND revokes PlayFab native ban
    // ====================================================================================
    if (action === "unbanUser") {
        var uEmail = args.email     || "";
        var uPfId  = args.playFabId || "";
        var uId    = "";

        if (uPfId) {
            uId = uPfId;
        } else if (uEmail) {
            try {
                var uLookup = server.GetUserAccountInfo({ Email: uEmail });
                if (!uLookup || !uLookup.UserInfo) return { success: false, error: "No account found." };
                uId = uLookup.UserInfo.PlayFabId;
            } catch (e) { return { success: false, error: "No account found with that email." }; }
        } else {
            return { success: false, error: "Email or PlayFabId is required." };
        }

        // 1. Clear IsBanned flag in UserData
        server.UpdateUserData({
            PlayFabId:  uId,
            Data:       { "IsBanned": "false" },
            Permission: "Public"
        });

        // 2. Get all active bans and revoke them (removes PlayFab native ban)
        try {
            var bansResult = server.GetUserBans({ PlayFabId: uId });
            if (bansResult && bansResult.BanData && bansResult.BanData.length > 0) {
                var banIds = [];
                for (var b = 0; b < bansResult.BanData.length; b++) {
                    if (bansResult.BanData[b].Active) {
                        banIds.push(bansResult.BanData[b].BanId);
                    }
                }
                if (banIds.length > 0) {
                    server.RevokeAllBansForUser({ PlayFabId: uId });
                }
            }
        } catch (e) {
            try {
                server.RevokeAllBansForUser({ PlayFabId: uId });
            } catch (e2) {
                log.info("Note: Could not revoke native ban via API, UserData cleared only.");
            }
        }

        // 3. Send notification to user
        sendNotification(
            uId,
            "Account Restored",
            "Your account suspension has been lifted. Welcome back!",
            "unban",
            {}
        );

        return { success: true, message: "User unbanned successfully.", playFabId: uId, email: uEmail };
    }

    // ====================================================================================
    // G. GET PLAYER CHARACTERS — Read UnlockedCharacters from regular UserData
    // ====================================================================================
    // G. GET PLAYER CHARACTERS — Read UnlockedCharacters from both UserData AND ReadOnlyData
    //    (supports legacy accounts that still have data in ReadOnly)
    // ====================================================================================
    if (action === "getPlayerCharacters") {
        var gcPfId = args.playFabId || "";
        if (!gcPfId) return { success: false, unlockedCharacters: [], error: "playFabId required." };

        try {
            var chars = [];

            // 1. Read from regular UserData
            try {
                var gcResult = server.GetUserData({
                    PlayFabId: gcPfId,
                    Keys: ["UnlockedCharacters"]
                });
                if (gcResult.Data && gcResult.Data["UnlockedCharacters"] && gcResult.Data["UnlockedCharacters"].Value) {
                    var parsed = JSON.parse(gcResult.Data["UnlockedCharacters"].Value);
                    if (Array.isArray(parsed)) {
                        chars = chars.concat(parsed);
                    }
                }
            } catch (e) {}

            // 2. Read from ReadOnly UserData (legacy — older accounts wrote here)
            try {
                var gcReadOnly = server.GetUserReadOnlyData({
                    PlayFabId: gcPfId,
                    Keys: ["UnlockedCharacters"]
                });
                if (gcReadOnly.Data && gcReadOnly.Data["UnlockedCharacters"] && gcReadOnly.Data["UnlockedCharacters"].Value) {
                    var parsedRO = JSON.parse(gcReadOnly.Data["UnlockedCharacters"].Value);
                    if (Array.isArray(parsedRO)) {
                        // Merge, deduplicate
                        for (var ci = 0; ci < parsedRO.length; ci++) {
                            if (chars.indexOf(parsedRO[ci]) === -1) {
                                chars.push(parsedRO[ci]);
                            }
                        }
                    }
                }
            } catch (e) {}

            // 3. If ReadOnly had data but UserData didn't, migrate it to UserData now
            if (chars.length > 0) {
                try {
                    var existingUserData = server.GetUserData({ PlayFabId: gcPfId, Keys: ["UnlockedCharacters"] });
                    var hasUserData = existingUserData.Data && existingUserData.Data["UnlockedCharacters"];
                    if (!hasUserData) {
                        var migrateData = {};
                        migrateData["UnlockedCharacters"] = JSON.stringify(chars);
                        server.UpdateUserData({ PlayFabId: gcPfId, Data: migrateData, Permission: "Public" });
                        log.info("Migrated UnlockedCharacters from ReadOnly to UserData for: " + gcPfId);
                    }
                } catch (e) {}
            }

            return { success: true, unlockedCharacters: chars };
        } catch (e) {
            return { success: false, unlockedCharacters: [], error: e.message || "Failed to read player data." };
        }
    }

    return { error: "No matching action found in adminUserWorkflow." };
};

// ====================================================================================
// SUPPORT / CONTACT ADMIN WORKFLOW
// Users send messages via ContactAdmin.cs → stored in Title Internal Data.
// The admin web dashboard reads and replies via this same handler.
// ====================================================================================

handlers.supportWorkflow = function (args, context) {
    var action      = args.action;
    var INBOX_KEY   = "AdminInbox";

    // ── Helper: read the inbox array ──
    function _readInbox() {
        var raw = server.GetTitleInternalData({ Keys: [INBOX_KEY] });
        if (raw.Data && raw.Data[INBOX_KEY]) {
            try { return JSON.parse(raw.Data[INBOX_KEY]); } catch (e) {}
        }
        return [];
    }

    // ── Helper: save the inbox array ──
    function _saveInbox(list) {
        // Keep newest 200 messages max to stay within PlayFab size limits
        if (list.length > 200) list = list.slice(0, 200);
        server.SetTitleInternalData({
            Key:   INBOX_KEY,
            Value: JSON.stringify(list)
        });
    }

    // ────────────────────────────────────────────────────────────────────────
    // A. USER → send a message to the admin
    // ────────────────────────────────────────────────────────────────────────
    if (action === "sendMessage") {
        var body = (args.body || "").trim();
        if (!body) return { success: false, error: "Message cannot be empty." };

        // Resolve display name
        var displayName = "";
        try {
            var info = server.GetUserAccountInfo({ PlayFabId: currentPlayerId });
            displayName = (info.UserInfo && info.UserInfo.TitleInfo && info.UserInfo.TitleInfo.DisplayName)
                ? info.UserInfo.TitleInfo.DisplayName
                : currentPlayerId;
        } catch (e) {
            displayName = currentPlayerId;
        }

        var msg = {
            id:          generateId("msg"),
            playFabId:   currentPlayerId,
            displayName: displayName,
            body:        body,
            status:      "open",        // open | replied
            adminReply:  "",
            createdAt:   new Date().toISOString(),
            repliedAt:   ""
        };

        var inbox = _readInbox();
        inbox.unshift(msg);             // newest first
        _saveInbox(inbox);

        log.info("Support message received from " + displayName + " (" + currentPlayerId + ")");
        return { success: true, message: "Message sent to admin.", id: msg.id };
    }

    // ────────────────────────────────────────────────────────────────────────
    // B. ADMIN → get all messages
    // ────────────────────────────────────────────────────────────────────────
    if (action === "getMessages") {
        try {
            var messages = _readInbox();
            var open = 0;
            for (var i = 0; i < messages.length; i++) {
                if (messages[i].status === "open") open++;
            }
            log.info("getMessages: returning " + messages.length + " messages, " + open + " open");
            return { success: true, messages: messages, total: messages.length, openCount: open };
        } catch (e) {
            log.error("getMessages error: " + e);
            return { success: true, messages: [], total: 0, openCount: 0 };
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // B2. USER → get only their own messages (for InboxViewer in Unity)
    // ────────────────────────────────────────────────────────────────────────
    if (action === "getMyMessages") {
        var allMessages = _readInbox();
        var myMessages  = [];
        for (var mi = 0; mi < allMessages.length; mi++) {
            if (allMessages[mi].playFabId === currentPlayerId) {
                myMessages.push(allMessages[mi]);
            }
        }
        return { success: true, messages: myMessages, total: myMessages.length };
    }

    // ────────────────────────────────────────────────────────────────────────
    // C. ADMIN → reply to a message
    //    Stores the reply in the inbox AND sends a notification to the user.
    // ────────────────────────────────────────────────────────────────────────
    if (action === "replyMessage") {
        var targetId   = args.messageId  || "";
        var replyText  = (args.reply     || "").trim();

        if (!targetId || !replyText)
            return { success: false, error: "messageId and reply are required." };

        var inbox2 = _readInbox();
        var found  = false;

        for (var j = 0; j < inbox2.length; j++) {
            if (inbox2[j].id === targetId) {
                inbox2[j].status     = "replied";
                inbox2[j].adminReply = replyText;
                inbox2[j].repliedAt  = new Date().toISOString();
                found = true;

                // Push a notification to the user so they see the reply in-game
                sendNotification(
                    inbox2[j].playFabId,
                    "Admin replied to your message",
                    replyText,
                    "admin_reply",
                    { messageId: targetId }
                );
                break;
            }
        }

        if (!found) return { success: false, error: "Message not found." };

        _saveInbox(inbox2);
        return { success: true, message: "Reply sent." };
    }

    // ────────────────────────────────────────────────────────────────────────
    // D. ADMIN → delete / close a message
    // ────────────────────────────────────────────────────────────────────────
    if (action === "deleteMessage") {
        var delId   = args.messageId || "";
        var inbox3  = _readInbox();
        var before  = inbox3.length;
        inbox3 = inbox3.filter(function (m) { return m.id !== delId; });

        if (inbox3.length === before)
            return { success: false, error: "Message not found." };

        _saveInbox(inbox3);
        return { success: true, message: "Message deleted." };
    }

    return { success: false, error: "Unknown action: " + action };
};

// ====================================================================================
// PLAYSTREAM AUTOMATION & DIRECT HANDLERS FOR FIREBASE SYNC
// 1. onPlayerCreated: Fires on PlayFab PlayStream 'player_created' / 'player_logged_in' Rule
// 2. syncPlayerToFirebase: Explicit trigger from client or admin tool
// ====================================================================================

handlers.onPlayerCreated = function (args, context) {
    var playerId = null;
    var displayName = "";
    var email = "";
    var avatarUrl = "";

    if (context && context.playStreamEvent) {
        var ev = context.playStreamEvent;
        playerId = ev.PlayerId || ev.EntityId || null;
        if (ev.UserInfo) {
            displayName = ev.UserInfo.TitleInfo ? ev.UserInfo.TitleInfo.DisplayName : (ev.UserInfo.Username || "");
            email = ev.UserInfo.PrivateInfo ? ev.UserInfo.PrivateInfo.Email : "";
        }
    }

    if (!playerId && args) {
        playerId = args.playFabId || args.playerId || currentPlayerId;
        displayName = args.displayName || "";
        email = args.email || "";
        avatarUrl = args.avatarUrl || "";
    }

    if (!playerId) {
        return { success: false, error: "No PlayerId found in event or args." };
    }

    // Add to Live Registry group
    try {
        server.AddSharedGroupMembers({ SharedGroupId: "AllRegisteredPlayers", PlayFabIds: [playerId] });
    } catch (e) {
        try {
            server.CreateSharedGroup({ SharedGroupId: "AllRegisteredPlayers" });
            server.AddSharedGroupMembers({ SharedGroupId: "AllRegisteredPlayers", PlayFabIds: [playerId] });
        } catch (e2) {}
    }

    // Sync to Firebase
    var syncRes = _syncPlayerToFirebase(playerId, displayName, email, avatarUrl, { isNewRegistration: true });
    return { success: true, playFabId: playerId, firebaseSync: syncRes };
};

handlers.syncPlayerToFirebase = function(args, context) {
    var pId = (args && args.playFabId) || currentPlayerId;
    return _syncPlayerToFirebase(
        pId, 
        args ? args.displayName : "", 
        args ? args.email : "", 
        args ? args.avatarUrl : "", 
        args ? args.additionalFields : null
    );
};


/* One-time bootstrap: writes the Firebase service credentials into Title
   INTERNAL Data, which is server-only and unreadable by any game client.

   Game Manager no longer exposes an internal-data table, so run this once from
   Automation > Scheduled Tasks (type: Run CloudScript, function:
   setFirebaseCredentials) with an argument of:

       { "email": "...", "password": "..." }

   Then DELETE the scheduled task, so the credentials do not linger in its
   argument. Never put these values in Title Data -- that table is readable by
   every client. */
handlers.setFirebaseCredentials = function (args, context) {
    if (!args || !args.email || !args.password) {
        return { success: false, error: "Pass both email and password in the task argument." };
    }

    try {
        server.SetTitleInternalData({ Key: "Firebase_SvcEmail",    Value: String(args.email) });
        server.SetTitleInternalData({ Key: "Firebase_SvcPassword", Value: String(args.password) });
    } catch (eSet) {
        return { success: false, error: "SetTitleInternalData failed: " + (eSet.message || String(eSet)) };
    }

    // Read back through the same call the sync uses, so a pass here means the
    // sync will find them too. Values are never echoed.
    var check = server.GetTitleInternalData({ Keys: ["Firebase_SvcEmail", "Firebase_SvcPassword"] });
    var d = (check && check.Data) ? check.Data : {};

    return {
        success:     !!(d["Firebase_SvcEmail"] && d["Firebase_SvcPassword"]),
        emailSet:    !!d["Firebase_SvcEmail"],
        passwordSet: !!d["Firebase_SvcPassword"],
        message:     "Delete this scheduled task now that it has run."
    };
};
