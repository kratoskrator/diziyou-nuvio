/* DiziYou TV for Nuvio v1.0.0
MIT License

Copyright (c) 2026 DiziYou TV Nuvio provider contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


*/
(function () {
var modules = {
"utils": function(module, exports, require) {
'use strict';

function entities(value) {
  return String(value || '').replace(/&#(x[\da-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp);/gi, function (all, number, named) {
    if (number) return String.fromCharCode(number.charAt(0).toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : parseInt(number, 10));
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[named.toLowerCase()];
  });
}

function text(value) {
  return entities(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function attr(tag, name) {
  var re = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^\"]*)"|\x27([^\x27]*)\x27|([^\\s>]+))', 'i');
  var match = re.exec(tag || '');
  return match ? entities(match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[3]) : '';
}

function origin(url) {
  var match = /^(https?:\/\/[^/?#]+)/i.exec(url || '');
  return match ? match[1] : '';
}

function absolute(value, base) {
  value = entities(value).trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/\//.test(value)) return (String(base).split(':')[0] || 'https') + ':' + value;
  if (!value || /^[\w+.-]+:/.test(value)) return '';
  var root = origin(base);
  if (!root) return '';
  var path = String(base).slice(root.length).split(/[?#]/)[0] || '/';
  if (value.charAt(0) === '?') return root + path + value;
  if (value.charAt(0) === '#') return '';
  path = value.charAt(0) === '/' ? value : path.slice(0, path.lastIndexOf('/') + 1) + value;
  var suffix = /[?#].*$/.exec(path);
  var parts = path.split(/[?#]/)[0].split('/');
  var clean = [];
  parts.forEach(function (part) {
    if (part === '..') clean.pop();
    else if (part && part !== '.') clean.push(part);
  });
  return root + '/' + clean.join('/') + (clean.length && /\/$/.test(path.split(/[?#]/)[0]) ? '/' : '') + (suffix ? suffix[0] : '');
}

function siteUrl(value) {
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(String(value || '')) ? String(value).replace(/\/+$/, '') : '';
}

function sameSite(url, base) {
  return origin(url).toLowerCase() === origin(base).toLowerCase();
}

function normalize(value) {
  return text(value).replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g').replace(/[çÇ]/g, 'c').replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u').toLowerCase().replace(/\u0307/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function classText(html, className) {
  var re = /<([a-z][\w:-]*)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  var match;
  // Search only opening tags carrying this class, so outer containers do not swallow descendants.
  var opening = new RegExp('<([a-z][\\w:-]*)\\b([^>]*\\bclass\\s*=\\s*(?:"[^"]*\\b' + className + '\\b[^"]*"|\x27[^\x27]*\\b' + className + '\\b[^\x27]*\x27)[^>]*)>', 'gi');
  match = opening.exec(html);
  if (!match) return '';
  re = new RegExp('^([\\s\\S]*?)<\\/' + match[1] + '\\s*>', 'i');
  var body = re.exec(html.slice(opening.lastIndex));
  return body ? text(body[1]) : '';
}

module.exports = { entities: entities, text: text, attr: attr, origin: origin, absolute: absolute, siteUrl: siteUrl, sameSite: sameSite, normalize: normalize, classText: classText };

},
"http": function(module, exports, require) {
'use strict';
var u = require("utils");
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function failure(message, blocked) {
  var error = new Error(message);
  error.providerSafe = true;
  error.siteBlocked = !!blocked;
  return error;
}

// A separate jar per lookup keeps anonymous site sessions out of other providers.
function session() { return { cookies: {} }; }
function saveCookies(response, url, jar) {
  if (!jar || !response.headers || typeof response.headers.get !== 'function') return;
  var raw = response.headers.get('set-cookie');
  if (!raw) return;
  var list = Array.isArray(raw) ? raw : String(raw).split(/,(?=\s*[^;,=\s]+\s*=)/);
  var site = u.origin(url);
  if (!jar.cookies[site]) jar.cookies[site] = {};
  list.forEach(function (entry) {
    var pair = /^\s*([^=;,\s]+)=([^;\r\n]*)/.exec(entry);
    if (pair) jar.cookies[site][pair[1]] = pair[2];
  });
}

function request(url, options) {
  options = options || {};
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return Promise.reject(failure('Unsupported request address.'));
  var site = u.origin(url);
  var headers = { 'User-Agent': USER_AGENT, Accept: options.json ? 'application/json' : 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8' };
  if (options.referer) headers.Referer = options.referer;
  if (options.origin) headers.Origin = options.origin;
  if (options.bearer) headers.Authorization = 'Bearer ' + options.bearer;
  if (options.body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  var jar = options.session;
  if (jar && jar.cookies[site]) {
    var cookie = Object.keys(jar.cookies[site]).map(function (name) { return name + '=' + jar.cookies[site][name]; }).join('; ');
    if (cookie) headers.Cookie = cookie;
  }
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = null;
  var finished = false;
  return new Promise(function (resolve, reject) {
    function finish(error, value) {
      if (finished) return;
      finished = true;
      if (timer !== null && typeof clearTimeout === 'function') clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    }
    if (typeof setTimeout === 'function') timer = setTimeout(function () {
      finish(failure('Request timed out: ' + site));
      if (controller) controller.abort();
    }, options.timeout || 9000);
    var init = { method: options.body !== undefined ? 'POST' : 'GET', headers: headers };
    if (options.body !== undefined) init.body = options.body;
    if (controller) init.signal = controller.signal;
    Promise.resolve().then(function () { return fetch(url, init); }).then(function (response) {
      saveCookies(response, url, jar);
      if (response.status === 403 || response.status === 429 || response.status === 451) throw failure('Website verification or access restriction (HTTP ' + response.status + '): ' + site + '. A standalone TV plugin cannot complete CAPTCHA verification.', true);
      if (!response.ok) throw failure('HTTP ' + response.status + ': ' + site);
      return response.text();
    }).then(function (body) {
      if (body.length > 1024 * 1024) throw failure('Response exceeds TV size limit: ' + site);
      if (/<title>\s*(?:Just a moment|Attention Required|Doğrulama gerekiyor)/i.test(body) || /cf-browser-verification|class=["']cf-turnstile/i.test(body)) throw failure('Website CAPTCHA verification required: ' + site, true);
      if (!options.json) return finish(null, body);
      var value;
      try { value = JSON.parse(body); } catch (ignored) { throw failure('Invalid JSON response: ' + site); }
      finish(null, value);
    }).catch(function (error) { finish(error && error.providerSafe ? error : failure('Network request failed: ' + site)); });
  });
}

module.exports = { request: request, USER_AGENT: USER_AGENT, session: session };


},
"catalog": function(module, exports, require) {
'use strict';
var u = require("utils");

function readableHtml(value) {
  return typeof value === 'string' && value.length <= 4 * 1024 * 1024 ? value.replace(/<!--[\s\S]*?-->/g, '') : '';
}

function safeUrl(value, base) {
  value = String(value || '');
  if (!value || /[\\\x00-\x20\x7f]/.test(value)) return '';
  var url = u.absolute(value, base);
  var host = /^https:\/\/([a-z0-9.-]+)(?::\d+)?(?:[/?#]|$)/i.exec(url);
  if (!host || /(?:^|\.)localhost\.?$/i.test(host[1]) || /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host[1]) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host[1])) return '';
  return url;
}

function localUrl(value, base) {
  var url = safeUrl(value, base);
  if (!url || !u.sameSite(url, base)) return '';
  url = url.split(/[?#]/)[0];
  return /%(?:2f|5c|00|0a|0d)/i.test(url) ? '' : url;
}

function pageSlug(value) {
  var path = String(value || '').slice(u.origin(value).length).split(/[?#]/)[0];
  var match = /^\/([a-z0-9][a-z0-9_-]*)\/?$/i.exec(path);
  return match ? match[1] : '';
}

function yearValue(value) {
  var match = /\b((?:19|20)\d{2})\b/.exec(String(value || ''));
  return match ? Number(match[1]) : null;
}

function cleanTitle(value) {
  return u.text(value).replace(/[\u200e\u200f]/g, '').replace(/\s+izle\s*$/i, '').replace(/\s*\((?:19|20)\d{2}\)\s*$/, '').trim();
}

function titleContainers(html) {
  var results = [];
  var opening = /<([a-z][\w:-]*)\b([^>]*)>/gi;
  var match;
  while ((match = opening.exec(html)) !== null) {
    var id = u.attr(match[2], 'id');
    var classes = ' ' + u.attr(match[2], 'class').replace(/\s+/g, ' ') + ' ';
    if (id !== 'categorytitle' && classes.indexOf(' post-title ') === -1 && classes.indexOf(' entry-title ') === -1) continue;
    var closing = new RegExp('^([\\s\\S]*?)<\\/' + match[1] + '\\s*>', 'i');
    var body = closing.exec(html.slice(opening.lastIndex));
    if (body) results.push(body[1]);
    if (results.length >= 80) break;
  }
  return results;
}

function parseResults(html, base) {
  var result = [];
  var seen = {};
  titleContainers(readableHtml(html)).forEach(function (body) {
    var anchors = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
    var match;
    while ((match = anchors.exec(body)) !== null) {
      var url = localUrl(u.attr(match[1], 'href'), base);
      var slug = pageSlug(url);
      var rawTitle = u.text(match[2]) || u.attr(match[1], 'title');
      var title = cleanTitle(rawTitle);
      if (!url || !slug || /-\d+-sezon-\d+-bolum$/i.test(slug) || !title || seen[url]) continue;
      seen[url] = true;
      var item = { url: url, title: title, type: 'tv' };
      var yearMatch = /\((\d{4})\)\s*(?:izle)?\s*$/i.exec(rawTitle);
      var year = yearMatch ? yearValue(yearMatch[1]) : null;
      if (year) item.year = year;
      result.push(item);
    }
  });
  return result;
}

function titleList(metadata) {
  var titles = [metadata.title, metadata.originalTitle, metadata.turkishTitle];
  if (Array.isArray(metadata.titles)) titles = titles.concat(metadata.titles);
  return titles.filter(function (value) { return typeof value === 'string' && value; }).map(function (value) { return u.normalize(cleanTitle(value)); });
}

function rankResults(results, metadata, query) {
  metadata = metadata || {};
  if (metadata.type && metadata.type !== 'tv' && metadata.type !== 'series') return [];
  var titles = titleList(metadata);
  var queryTitle = typeof query === 'string' ? u.normalize(cleanTitle(query)) : '';
  var targetYear = yearValue(metadata.year);
  return (Array.isArray(results) ? results : []).map(function (item, index) {
    if (!item || item.type !== 'tv') return null;
    var title = u.normalize(cleanTitle(item.title));
    var slug = u.normalize(pageSlug(item.url));
    var exactTitle = titles.indexOf(title) !== -1;
    var exactSlug = titles.indexOf(slug) !== -1;
    if (!exactTitle && !exactSlug) return null;
    if (targetYear && item.year && Math.abs(targetYear - item.year) > 1) return null;
    return { item: item, score: (exactTitle ? 100 : 0) + (exactSlug ? 80 : 0) + (title === queryTitle ? 10 : 0) + (targetYear && targetYear === item.year ? 200 : 0), index: index };
  }).filter(Boolean).sort(function (a, b) { return b.score - a.score || a.index - b.index; }).map(function (entry) { return entry.item; });
}

function integer(value) {
  return value != null && /^\d+$/.test(String(value).trim()) ? Number(value) : null;
}

function episodeUrl(html, seriesUrl, season, episode) {
  var wantedSeason = integer(season);
  var wantedEpisode = integer(episode);
  var series = pageSlug(seriesUrl).replace(/-\d+-sezon-\d+-bolum$/i, '');
  if (!series || wantedSeason === null || wantedEpisode === null) return '';
  var anchors = /<a\b[^>]*>/gi;
  var match;
  html = readableHtml(html);
  while ((match = anchors.exec(html)) !== null) {
    var url = localUrl(u.attr(match[0], 'href'), seriesUrl);
    var numbers = /^(.*)-(\d+)-sezon-(\d+)-bolum$/i.exec(pageSlug(url));
    if (numbers && numbers[1].toLowerCase() === series.toLowerCase() && Number(numbers[2]) === wantedSeason && Number(numbers[3]) === wantedEpisode) return url;
  }
  return '';
}

function frameName(html, url) {
  if (/_tr\.html(?:[?#]|$)/i.test(url)) return { name: 'Türkçe dublaj', language: 'tr' };
  if (/_enSub\.html(?:[?#]|$)/i.test(url)) return { name: 'İngilizce altyazılı', language: 'en' };
  var options = /<[^>]+\bid\s*=\s*(?:"(turkceAltyazili|turkceDublaj|ingilizceAltyazili)"|'(turkceAltyazili|turkceDublaj|ingilizceAltyazili)')[^>]*>/gi;
  var match;
  while ((match = options.exec(html)) !== null) {
    if ((' ' + u.attr(match[0], 'class') + ' ').indexOf(' diziyouActivated ') === -1) continue;
    var id = match[1] || match[2];
    if (id === 'turkceDublaj') return { name: 'Türkçe dublaj', language: 'tr' };
    if (id === 'ingilizceAltyazili') return { name: 'İngilizce altyazılı', language: 'en' };
    return { name: 'Türkçe altyazılı', language: 'tr' };
  }
  return { name: 'Orijinal ses', language: 'original' };
}

function playerFrames(html, pageUrl) {
  html = readableHtml(html);
  var frames = html.match(/<iframe\b[^>]*>/gi) || [];
  var result = [];
  var seen = {};
  frames.forEach(function (tag) {
    if (u.attr(tag, 'id') !== 'diziyouPlayer') return;
    var url = localUrl(u.attr(tag, 'src') || u.attr(tag, 'data-src'), pageUrl);
    var path = url.slice(u.origin(url).length);
    if (!/^\/player\/[a-z0-9_-]+\.html$/i.test(path) || seen[url]) return;
    seen[url] = true;
    var label = frameName(html, url);
    result.push({ url: url, name: label.name, language: label.language });
    var playerId = /^\/player\/(\d+)(?:_tr|_enSub)?\.html$/i.exec(path);
    if (!playerId) return;
    var options = html.match(/<(?:span|a|button|option)\b[^>]*>/gi) || [];
    options.forEach(function (option) {
      var id = u.attr(option, 'id');
      var suffix = id === 'turkceDublaj' ? '_tr' : id === 'ingilizceAltyazili' ? '_enSub' : '';
      if (!suffix) return;
      // These language routes are the same replacements used by the public site's UI.
      var alternate = u.origin(url) + '/player/' + playerId[1] + suffix + '.html';
      if (seen[alternate]) return;
      seen[alternate] = true;
      var alternateLabel = frameName('', alternate);
      result.push({ url: alternate, name: alternateLabel.name, language: alternateLabel.language });
    });
  });
  return result;
}

function parsePlayer(html, frameUrl) {
  html = readableHtml(html);
  // Read the actual video element only: preroll and advertising scripts contain other URLs.
  var videos = /<video\b([^>]*)>([\s\S]*?)<\/video\s*>/gi;
  var match;
  var video;
  while ((match = videos.exec(html)) !== null) {
    if (u.attr(match[1], 'id') === 'diziyou') { video = match; break; }
  }
  if (!video) return [];
  var subtitles = [];
  var subSeen = {};
  var tracks = video[2].match(/<track\b[^>]*>/gi) || [];
  tracks.forEach(function (tag) {
    var kind = u.attr(tag, 'kind');
    if (kind && !/^(?:subtitles|captions)$/i.test(kind)) return;
    var url = safeUrl(u.attr(tag, 'src'), frameUrl);
    if (!url || !/\.vtt(?:[?#]|$)/i.test(url) || subSeen[url]) return;
    subSeen[url] = true;
    var language = u.attr(tag, 'srclang') || 'und';
    subtitles.push({ url: url, label: u.attr(tag, 'label') || language, language: language, default: /\sdefault(?:\s|=|\/?>)/i.test(tag) });
  });
  var sources = video[2].match(/<source\b[^>]*>/gi) || [];
  if (u.attr(video[1], 'src')) sources.unshift('<source src="' + u.attr(video[1], 'src').replace(/"/g, '&quot;') + '">');
  var streams = [];
  var seen = {};
  sources.forEach(function (tag) {
    var url = safeUrl(u.attr(tag, 'src'), frameUrl);
    var extension = /\.(m3u8|mp4)(?:[?#]|$)/i.exec(url);
    if (!url || !extension || seen[url]) return;
    seen[url] = true;
    var quality = u.attr(tag, 'label') || u.attr(tag, 'res') || u.attr(tag, 'size');
    if (!/^(?:\d{3,4}p?|auto)$/i.test(quality)) quality = 'Auto';
    streams.push({ url: url, type: extension[1].toLowerCase() === 'm3u8' ? 'hls' : 'mp4', quality: quality, subtitles: subtitles.slice() });
  });
  return streams;
}

module.exports = { parseResults: parseResults, rankResults: rankResults, episodeUrl: episodeUrl, playerFrames: playerFrames, parsePlayer: parsePlayer };

},
"index": function(module, exports, require) {
'use strict';
var u = require("utils");
var http = require("http");
var catalog = require("catalog");
var DEFAULT_SITE = 'https://www.diziyou.one';

function settings() {
  var root = typeof globalThis !== 'undefined' ? globalThis : {};
  var saved = root.SCRAPER_SETTINGS || {};
  return { site: u.siteUrl(saved.siteUrl || DEFAULT_SITE) || DEFAULT_SITE, key: String(saved.tmdbApiKey || root.TMDB_API_KEY || '').trim(), session: http.session() };
}

function metadata(id, cfg) {
  if (!cfg.key) return Promise.reject(new Error('TMDB key unavailable. Enter your own key in DiziYou TV settings.'));
  var token = cfg.key.length > 40;
  var url = 'https://api.themoviedb.org/3/tv/' + encodeURIComponent(id) + '?language=tr-TR';
  if (!token) url += '&api_key=' + encodeURIComponent(cfg.key);
  return http.request(url, { json: true, bearer: token ? cfg.key : '' }).then(function (data) {
    return { title: data.name || '', originalTitle: data.original_name || '', year: Number(String(data.first_air_date || '').slice(0, 4)) || null };
  });
}

function search(meta, cfg) {
  var queries = [meta.title, meta.originalTitle].filter(function (value, index, all) { return value && all.indexOf(value) === index; });
  function next(index) {
    if (index >= queries.length) return Promise.resolve([]);
    var query = queries[index];
    return http.request(cfg.site + '/?s=' + encodeURIComponent(query), { referer: cfg.site + '/', session: cfg.session }).then(function (html) {
      var matches = catalog.rankResults(catalog.parseResults(html, cfg.site), meta, query);
      return matches.length ? matches.slice(0, 2) : next(index + 1);
    });
  }
  return next(0);
}

function resolveEpisode(page, meta, cfg, season, episode) {
  var frames = catalog.playerFrames(page.html, page.url).slice(0, 2);
  return Promise.all(frames.map(function (frame) {
    return http.request(frame.url, { referer: page.url, session: cfg.session }).then(function (body) {
      var parsed = catalog.parsePlayer(body, frame.url).filter(function (stream) { return stream.type === 'hls'; }).slice(0, 2);
      return Promise.all(parsed.map(function (stream) {
        return http.request(stream.url, { referer: cfg.site + '/', origin: cfg.site }).then(function (playlist) {
          // A visible player can still point at an expired, missing or blocked file.
          if (!/^\s*#EXTM3U(?:\r?\n|$)/.test(playlist)) return null;
          var headers = { Referer: cfg.site + '/', Origin: cfg.site, 'User-Agent': http.USER_AGENT };
          var subtitles = (stream.subtitles || []).map(function (sub, index) {
            return { id: 'diziyou-' + index, url: sub.url, language: sub.language || 'und', name: sub.label || sub.name || sub.language || 'Subtitle', headers: headers };
          });
          return { name: 'DiziYou TV', provider: 'DiziYou TV', title: meta.title + ' S' + season + 'E' + episode + ' | ' + (frame.name || 'Original audio'), url: stream.url, quality: stream.quality || 'Auto', type: 'hls', headers: headers, subtitles: subtitles };
        }).catch(function (error) { console.warn('[DiziYou TV] ' + error.message); return null; });
      }));
    }).catch(function (error) { console.warn('[DiziYou TV] ' + error.message); return []; });
  })).then(function (groups) {
    var streams = [];
    groups.forEach(function (group) { group.forEach(function (stream) { if (stream) streams.push(stream); }); });
    return streams;
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType !== 'tv' && mediaType !== 'series' && mediaType !== 'show') return Promise.resolve([]);
  if (!/^\d+$/.test(String(tmdbId)) || !/^\d+$/.test(String(season)) || !/^\d+$/.test(String(episode)) || Number(episode) < 1) return Promise.resolve([]);
  var cfg = settings();
  return metadata(tmdbId, cfg).then(function (meta) {
    return search(meta, cfg).then(function (matches) {
      function next(index) {
        if (index >= matches.length) return Promise.resolve([]);
        var match = matches[index];
        return http.request(match.url, { referer: cfg.site + '/', session: cfg.session }).then(function (html) {
          var target = catalog.episodeUrl(html, match.url, season, episode);
          if (!target) return [];
          return http.request(target, { referer: match.url, session: cfg.session }).then(function (body) {
            return resolveEpisode({ html: body, url: target }, meta, cfg, season, episode);
          });
        }).then(function (streams) { return streams.length ? streams : next(index + 1); });
      }
      return next(0);
    });
  }).then(function (streams) {
    var seen = {};
    return streams.filter(function (stream) { if (seen[stream.url]) return false; seen[stream.url] = true; return true; });
  }).catch(function (error) {
    console.warn('[DiziYou TV] ' + error.message);
    return [];
  });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'DiziYou TV' },
    { type: 'text', key: 'siteUrl', label: 'Website address', defaultValue: DEFAULT_SITE, description: 'Update this HTTPS origin if the website moves.' },
    { type: 'text', key: 'tmdbApiKey', label: 'TMDB API key (optional)', isPassword: true, defaultValue: '', description: 'Uses Nuvio\'s key when available. Otherwise enter your own v3 key or API Read Access Token.' }
  ]);
}

module.exports = { getStreams: getStreams, onSettings: onSettings };

}
};
var cache = {};
function load(id) {
 if (cache[id]) return cache[id].exports;
 if (!modules[id]) throw new Error("Unknown module: " + id);
 var local = { exports: {} }; cache[id] = local;
 modules[id](local, local.exports, load);
 return local.exports;
}
module.exports = load("index");
}());
