# Unity: gate music upload behind premium

Implementation spec for the Unity client. The admin side (PlayFab UserData flag,
dashboard buttons, CloudScript enforcement) is already built and live — this
document covers only what Unity needs to add.

## What already exists

- Admins grant/revoke premium from the dashboard: **Users → open a player →
  Music Upload Access → Make Premium / Revoke Premium**.
- That writes `IsPremium` = `"true"` / `"false"` into the player's PlayFab
  **UserData**, with `Permission: "Public"` — the same shape as the existing
  `IsBanned` and `IsAdmin` flags the client already reads.
- CloudScript `videoAppWorkflow` action `submitSong` **rejects non-premium
  uploads server-side**, returning:

  ```json
  { "success": false, "errorCode": "NOT_PREMIUM", "error": "This feature is only for Premium users and admin must approve the music before the music becomes available." }
  ```

The Unity work is the friendly half of that check: don't let the player get all
the way through picking a file only to be refused.

## The exact popup copy

> This feature is only for Premium users and admin must approve the music before
> the music becomes available.

Use this string verbatim. It is the same text the server returns, so the two
paths cannot drift.

## 1. Read the flag

Add to `PlayFabAuthService` (namespace `Kangi.Auth`). Mirror the existing
`CheckPlayerDataIsBanned` — same API, same tolerant key matching, since the flag
is written as a string, not a bool.

```csharp
// --- Premium status check (music upload access) ---
public static void CheckPlayerIsPremium(Action<bool> onResult, Action<PlayFabError> onFailure)
{
    var request = new GetUserDataRequest();
    PlayFabClientAPI.GetUserData(request, result =>
    {
        bool isPremium = false;
        if (result.Data != null)
        {
            string value = null;

            if (result.Data.ContainsKey("IsPremium"))
                value = result.Data["IsPremium"].Value;
            else if (result.Data.ContainsKey("isPremium"))
                value = result.Data["isPremium"].Value;

            if (!string.IsNullOrEmpty(value))
            {
                string trimmed = value.Trim().ToLower();
                if (trimmed == "true" || trimmed == "1")
                    isPremium = true;
            }
        }
        onResult?.Invoke(isPremium);
    }, onFailure);
}
```

Note the two spellings. The dashboard writes `IsPremium`, but the ban check
already tolerates both cases and this should match that convention.

## 2. Gate the upload entry point

Wherever the "Upload your own music" button lives, check before opening the file
picker — not after.

```csharp
public void OnUploadMusicClicked()
{
    PlayFabAuthService.CheckPlayerIsPremium(
        isPremium =>
        {
            if (isPremium)
            {
                OpenMusicFilePicker();
            }
            else
            {
                notifcationPanel.ShowNotification(
                    "This feature is only for Premium users and admin must approve " +
                    "the music before the music becomes available.");
            }
        },
        err =>
        {
            // Fail closed: if we cannot confirm premium, do not open the picker.
            notifcationPanel.ShowNotification(
                "Could not check your account status. Please try again.");
        });
}
```

**Fail closed on error.** The ban check proceeds on failure, which is right for
a ban (do not lock people out on a network blip). Premium is the opposite: if
the check fails, the server would reject the upload anyway, so opening the
picker only wastes the player's time.

## 3. Handle the server rejection too

Client checks are advisory — a modified build can skip them, which is why the
server enforces this independently. Handle `NOT_PREMIUM` coming back from
`submitSong` so a stale client shows the same message instead of a raw error:

```csharp
// inside the submitSong ExecuteCloudScript success callback
var fn = result.FunctionResult as JsonObject;
if (fn != null && fn.ContainsKey("errorCode") &&
    fn["errorCode"].ToString() == "NOT_PREMIUM")
{
    notifcationPanel.ShowNotification(fn["error"].ToString());
    return;
}
```

Remember that `ExecuteCloudScript` reports success at the transport layer even
when the handler returns `success: false` — the real result is always inside
`FunctionResult`.

## 4. Refresh after a grant

`GetUserData` is a live call, so a player granted premium sees it on their next
check without a restart. Two things worth doing:

- Re-check on app resume, or when the upload screen opens, rather than caching
  the value once at login.
- The dashboard already sends a push notification (`premium_granted`) when
  access is granted. If the client acts on those, treat it as a cue to re-check.

## Testing

1. Dashboard → Users → open a player → **Make Premium**.
2. In Unity, tap upload → the file picker opens.
3. Dashboard → **Revoke Premium**.
4. Tap upload again → the popup appears.
5. Confirm the server half independently: with premium revoked, call
   `submitSong` directly. It must return `NOT_PREMIUM` regardless of what the
   client did.

Step 5 is the one that actually proves the feature. Steps 1–4 only prove the UI.
