# DiziYou TV for Nuvio

A series provider for Nuvio, intended for direct use on Samsung/Tizen and other Nuvio clients. It searches DiziYou, selects the requested episode, reads its player sources and subtitles, and checks each HLS playlist before offering it. No PC or hosted resolver is needed during use.

## Install

In Nuvio, open Settings → Plugins → Add repository and enter:

`https://raw.githubusercontent.com/kratoskrator/diziyou-nuvio/main/manifest.json`

Refresh and enable **DiziYou TV 1.0.1**. Open a series and select a season and episode. This provider supplies series; keep a separate movie provider enabled for movies.

## Settings

- **Website address:** defaults to `https://www.diziyou.one`. Update it if the site moves.
- **Audio language:** `original` selects original/subtitled audio; `tr` selects Turkish dubbing. The provider falls back to the other published audio choice if your preferred one is unavailable. It returns the verified preferred source promptly rather than waiting for unused audio choices.
- **TMDB API key:** normally uses the key supplied by Nuvio. If your app does not supply one, enter your own TMDB v3 API key or API Read Access Token. No third-party API key is embedded in this provider.

## Compatibility and verification

The bundled provider uses dependency-free ES5 and Promise chains. It does not need a browser DOM, Cheerio, Node modules, `URL`, timers, dynamic script execution or a local server. It preserves source/subtitle request headers and never manually copies site cookies through native redirects.

Version 1.0.1 checks real HLS structure and DRM markers, takes resolution from the manifest, shares a lookup budget across metadata/pages/media, retries transient GET failures once, and cancels unused requests after the selected audio is verified. A page with three subtitle/dubbing buttons retains both an original and a dubbed player in the bounded lookup pair. A failed first matching detail page does not hide a second valid match. Website verification and access restrictions stop the affected origin without a retry loop.

Native HTTPS requests were tested from this workspace against real episode/player pages and original/dubbed HLS playlists. Tests also check the bundled provider in an isolated VM and Nuvio's current QuickJS polyfill. These checks establish source resolution and playlist availability; actual video playback on a physical Samsung TV has not been tested. Availability can still change by network, region, site changes or codec support.

The provider only offers sources exposed by the episode's player. An unavailable language or invalid playlist is omitted. It does not claim a resolution that the source has not supplied. All **60 automated tests pass**; see [VALIDATION.md](VALIDATION.md) for the current TV runtime checks. When all eligible sources hang, a guest without timers still depends on Nuvio's native request timeout; early success cancels unused work.

## Build and test

Install Node.js 18 or newer, then run `npm test`. No package installation is required. `node build.js` regenerates `diziyou.js` from `src/`.

Publish `manifest.json` and `diziyou.js` in the same directory. The full source is included in `source.zip` in the published repository.

## References

[Nuvio provider documentation](https://github.com/yoruix/nuvio-providers) describes the manifest and `getStreams` contract. [Anthology](https://github.com/falsisdev/anthology) helped identify the current DiziYou origin and native storage player. This provider implements its own parsing against public HTML fixtures and does not include Anthology's code or embedded API key.

This repository contains provider code, not video files. Use it with content you are authorized to access.
