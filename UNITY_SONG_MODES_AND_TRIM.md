# Unity: game-mode filtering and song trim

Implementation guide for the Unity client. The admin side is built and live —
this covers what Unity reads and how it plays a trimmed song.

## Your instinct was right — keep the trim non-destructive

You asked whether storing start/end seconds and playing that range is a good
approach, or whether there's something better worth doing quickly. **Store the
seconds.** Don't cut the audio file. Reasons:

- **Nothing can cut it anyway.** PlayFab CloudScript has no audio processing, and
  the sandbox can't run ffmpeg. Actually trimming the file would mean adding a
  media server just for this.
- **It stays reversible.** Fitting a song to the countdown is guess-and-check.
  Changing two numbers beats re-uploading and re-approving every time.
- **No quality loss.** Re-encoding an MP3 degrades it. The original is preserved.
- **Free.** No second copy of every track.

The only thing a real cut would buy is a smaller download, and that matters far
less than being able to retune the window in five seconds.

## The data

`getSongs` returns each song with three added fields:

| Field | Type | Meaning |
|---|---|---|
| `modes` | string array | Which modes the song appears in |
| `trimStart` | number | Seconds into the file where playback begins |
| `trimEnd` | number | Seconds where playback stops. **0 means play to the natural end.** |

Mode keys are exactly these three:

| Key | Mode |
|---|---|
| `dance_challenge` | Dance Challenge |
| `mirror_mii` | Mirror Mii! |
| `kawaii_mode` | Kawaii Mode |

New uploads default to `["mirror_mii", "kawaii_mode"]` with no trim. Dance
Challenge is opt-in, because it's the mode that needs a trimmed window to fit
the countdown.

## 1. Filter by mode

```csharp
[Serializable]
public class SongEntry
{
    public string SongId;
    public string songTitle;
    public string Singer;
    public string SongUrl;
    public string[] modes;
    public float trimStart;
    public float trimEnd;

    public bool IsAvailableIn(string modeKey)
    {
        if (modes == null) return false;
        for (int i = 0; i < modes.Length; i++)
            if (modes[i] == modeKey) return true;
        return false;
    }

    // Seconds of audio that will actually play.
    public float PlayDuration(float clipLength)
    {
        float end = trimEnd > 0f ? trimEnd : clipLength;
        return Mathf.Max(0f, end - trimStart);
    }
}
```

Then build each mode's list off one fetch:

```csharp
var danceSongs  = allSongs.Where(s => s.IsAvailableIn("dance_challenge")).ToList();
var mirrorSongs = allSongs.Where(s => s.IsAvailableIn("mirror_mii")).ToList();
var kawaiiSongs = allSongs.Where(s => s.IsAvailableIn("kawaii_mode")).ToList();
```

Treat an empty or missing `modes` array as "not available anywhere" rather than
"available everywhere" — an admin who unticks every box means to pull the song.

## 2. Download the clip

Same as you're doing now. `DownloadHandlerAudioClip` with `streamAudio = false`
so the whole clip is resident before playback — you cannot seek reliably into a
streaming clip, and seeking is the whole point here.

```csharp
public static IEnumerator LoadSong(string url, Action<AudioClip> onLoaded, Action<string> onError)
{
    using (var req = UnityWebRequestMultimedia.GetAudioClip(url, AudioType.MPEG))
    {
        ((DownloadHandlerAudioClip)req.downloadHandler).streamAudio = false;

        yield return req.SendWebRequest();

        if (req.result != UnityWebRequest.Result.Success)
        {
            onError?.Invoke(req.error);
            yield break;
        }

        onLoaded?.Invoke(DownloadHandlerAudioClip.GetContent(req));
    }
}
```

Cache by `SongId` so re-entering a mode doesn't re-download.

## 3. Play the trimmed window

This is the part worth doing precisely. **Do not poll `AudioSource.time` in
`Update()` to decide when to stop** — that lands on a frame boundary, so the stop
drifts by up to a frame and won't line up with a countdown.

Schedule it on the audio clock instead. This is sample-accurate:

```csharp
public void PlayTrimmed(AudioSource source, AudioClip clip, SongEntry song)
{
    source.clip = clip;

    float start = Mathf.Clamp(song.trimStart, 0f, clip.length);
    float end   = song.trimEnd > 0f ? Mathf.Min(song.trimEnd, clip.length) : clip.length;

    if (end <= start) { start = 0f; end = clip.length; }   // bad data: play it all

    source.time = start;

    // Small lead-in so the scheduler is not racing the current frame.
    double startDsp = AudioSettings.dspTime + 0.1;
    source.PlayScheduled(startDsp);
    source.SetScheduledEndTime(startDsp + (end - start));
}
```

`SetScheduledEndTime` runs on the DSP clock, independent of frame rate. That is
what makes the clip land on the beat every time.

### Syncing the countdown

`end - start` is exactly how long audio will play, so drive the countdown from
the same number rather than a separate timer:

```csharp
float playLength = end - start;
StartCountdown(playLength);
```

If Dance Challenge needs a fixed length (say 30s), the admin sets the window to
match and the UI shows the computed clip length while they do it — so what they
see in the dashboard is what your countdown gets.

## 4. Looping a trimmed window

`AudioSource.loop` ignores the trim and loops the whole file. If you need the
window to repeat, re-schedule instead:

```csharp
double nextStart = startDsp + (end - start);
source.SetScheduledEndTime(nextStart);
// then schedule the next pass from `start` at nextStart
```

Simplest robust version is a second `AudioSource` you alternate between, so each
pass is scheduled before the previous one ends.

## Testing

1. Dashboard → Sounds → **Edit** on a song → tick Dance Challenge → set Start
   `12.5`, End `42.5` → the panel shows `30.0s clip` → **Save settings**.
2. **Play trimmed** in the dashboard confirms the window before you touch Unity.
3. In Unity, the song appears in Dance Challenge, and plays 12.5s → 42.5s.
4. Untick every mode and save → the song disappears from all three lists.
5. Set End back to `0` → plays the full track.

Step 2 is worth using — it removes Unity from the loop while an admin is dialling
in the window.
