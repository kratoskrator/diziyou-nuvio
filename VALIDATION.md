# DiziYou TV 1.0.1 — 26 October 2026

All 60 automated tests pass. Fifteen additional exact TV runtime checks passed against the final 33,460-byte bundle, using official NuvioTVSmart worker and native HTTP sources fetched on 26 October. Tests used a strict 32 MiB memory limit and 512 KiB stack; one cancellation case also passed under the current 64 MiB/default-stack policy.

| Live lookup | Selected audio | Verified result | Recorded lookup time |
| --- | --- | --- | --- |
| Squid Game S1E1 | Original/subtitled | 1080p HLS, two subtitle links | 1,865 ms |
| Breaking Bad S2E2 | Original/subtitled | 1080p HLS, two subtitle links | 1,828 ms |
| Squid Game S1E1 | Turkish dubbing | 1080p HLS, two subtitle links | 1,822 ms |

The master and complete child playlists returned HTTP 200. The manifests declare 1920×1080 resolution but no CODECS attribute, so codec support is not established by these checks. Subtitle counts describe exposed links; physical TV subtitle rendering was not tested.

Only title/year metadata was supplied through local TMDB fixtures. All website search, series/episode pages, player pages and playlists used ordinary live HTTPS through the unmodified TV network service. No real API credentials, browser verification, downloaded-site JavaScript, media segments or full video files were used. The previous public version also resolved both sampled series; this update fixes reliability, validation and delay hazards rather than claiming a general website outage.

The runtime cases cover three live lookups, their three captured replays, eight failure/security/audio regressions, and a modern-policy cancellation check. Both directions of audio fallback work; delayed preferred Turkish audio is retained even when original audio finishes first. A real page exposing original, English-subtitle and Turkish-dub options keeps one original and one dubbed player in its bounded pair. A synthetic unused dubbed player that never responds is cancelled exactly once after the preferred original source verifies, leaving zero pending native promises. The strict and modern checks returned in 347 and 322 ms respectively.

No manual cookies are forwarded across native redirects, and TMDB authorization does not reach website/player/CDN requests or returned streams. Empty/protected manifests and unrelated player redirects are rejected; transient GET retries and all phases share one lookup session.

Physical Samsung playback remains untested. A preferred audio request that hangs still depends on the app's native timeout in a guest without timers; this update cancels unused alternatives once a preferred source succeeds. Availability and TV codec support can vary. Captures containing temporary URLs remain outside the source archive.

Final bundle SHA-256:

```
e443d42b2822108e910f5aac0cce8e15b59ee4166e6dde9ad7a076bc3eacd245
```
