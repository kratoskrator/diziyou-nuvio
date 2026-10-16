# Verification — 16 October 2026

## Automated checks

- 18 tests pass: catalog matching, remake years, exact series/episode selection, player language options, subtitles, unsafe/advertising URL exclusion, playlist validation, missing files, 403/429 handling, input validation, optional metadata keys and cookie scoping.
- The 23,461-byte bundle runs under Nuvio's current TV QuickJS polyfill with a 32 MiB memory limit, including a 512 KiB stack check. Captured Squid Game pages resolve one HLS stream and two subtitle tracks when the alternate dubbed player is deliberately unavailable. Movie requests perform no network activity. A blocked episode stops without a retry loop.

## Native HTTPS checks

- Breaking Bad S1E1: search, episode, player, original HLS master, child media playlist, dubbed master and Turkish subtitle returned HTTP 200.
- Squid Game S1E1: search, series page, actual listed episode, player, original master and child playlist returned HTTP 200.
- Tested CDN playlists and Turkish subtitles also responded without Referer headers.
- The finished bundle's live Squid Game lookup returned two HLS streams, Turkish subtitled/original and Turkish dubbed, with seven HTTP 200 responses and no warnings in approximately 1.97 seconds.

The final bundle smoke test supplied TMDB metadata as a local fixture and used real native HTTPS for all site, player and playlist requests. It did not use a third-party TMDB key. Media segments were not downloaded.

## Limits

These checks verify extraction, runtime compatibility and playlist availability from the tested network. Physical Samsung/Tizen video playback and other TV model/codec combinations have not been tested. Site availability and network restrictions may change.

## Why DiziYou was selected

The proposed Dizipal address served working pages to a browser but required verification for native episode requests (HTTP 429). Its Formationfeed video host also blocked a native request (HTTP 403). A normal cookie-preserving session did not resolve that restriction. DiziYou completed the native path in the two tested series without browser verification or a PC resolver.
