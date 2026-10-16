# DiziYou TV for Nuvio

A series provider for Nuvio, intended for direct use on Samsung/Tizen and other Nuvio clients. It searches DiziYou, selects the requested episode, reads its player sources and subtitles, and checks each HLS playlist before offering it. No PC or hosted resolver is needed during use.

## Install

In Nuvio, open Settings → Plugins → Add repository and enter:

`https://raw.githubusercontent.com/kratoskrator/diziyou-nuvio/main/manifest.json`

Refresh and enable **DiziYou TV**. Open a series and select a season and episode. This provider supplies series; keep a separate movie provider enabled for movies.

## Settings

- **Website address:** defaults to `https://www.diziyou.one`. Update it if the site moves.
- **TMDB API key:** normally uses the key supplied by Nuvio. If your app does not supply one, enter your own TMDB v3 API key or API Read Access Token. No third-party API key is embedded in this provider.

## Compatibility and verification

The bundled provider uses dependency-free ES5 and Promise chains. It does not need a browser DOM, Cheerio, Node modules, `URL`, timers, dynamic script execution or a local server. It keeps site session cookies within a single lookup and preserves source/subtitle request headers.

Native HTTPS requests were tested from this workspace against real episode/player pages and original/dubbed HLS playlists. Tests also check the bundled provider in an isolated VM and Nuvio's current QuickJS polyfill. These checks establish source resolution and playlist availability; actual video playback on a physical Samsung TV has not been tested. Availability can still change by network, region, site changes or codec support.

The provider only offers sources exposed by the episode's player. An unavailable language or invalid playlist is omitted. It does not claim a resolution that the source has not supplied.

## Build and test

Install Node.js 18 or newer, then run `npm test`. No package installation is required. `node build.js` regenerates `diziyou.js` from `src/`.

Publish `manifest.json` and `diziyou.js` in the same directory. The full source is included in `source.zip` in the published repository.

## References

[Nuvio provider documentation](https://github.com/yoruix/nuvio-providers) describes the manifest and `getStreams` contract. [Anthology](https://github.com/falsisdev/anthology) helped identify the current DiziYou origin and native storage player. This provider implements its own parsing against public HTML fixtures and does not include Anthology's code or embedded API key.

This repository contains provider code, not video files. Use it with content you are authorized to access.
