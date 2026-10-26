/* DiziYou TV for Nuvio v1.0.1
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
var MAX_BYTES = 1024 * 1024;

function safeError(message, blocked, transient, cancelled) {
  var error = new Error(message);
  error.providerSafe = true;
  error.siteBlocked = !!blocked;
  error.transient = !!transient;
  error.requestCancelled = !!cancelled;
  return error;
}

// Only request state is retained. Native TV redirects do not safely scope a
// manually supplied Cookie header, so this provider never copies site cookies.
function session() { return { deadline: Date.now() + 45000, blocked: {}, pending: [], cancelled: false }; }

// The native TV fetch bridge supports AbortController even when the guest has
// no timers. Stop unused alternatives once the caller has a verified source.
function cancel(state) {
  if (!state || state.cancelled) return;
  state.cancelled = true;
  var pending = (state.pending || []).slice();
  state.pending = [];
  pending.forEach(function (abort) { abort(); });
}

function byteLength(value) {
  var bytes = 0;
  for (var i = 0; i < value.length && bytes <= MAX_BYTES; i++) {
    var ch = value.charCodeAt(i);
    if (ch < 128) bytes++;
    else if (ch < 2048) bytes += 2;
    else if (ch >= 55296 && ch <= 56319 && i + 1 < value.length && value.charCodeAt(i + 1) >= 56320 && value.charCodeAt(i + 1) <= 57343) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

function readBody(response, options) {
  if (options.binary) {
    if (typeof response.arrayBuffer !== 'function' || typeof Uint8Array === 'undefined') return Promise.reject(safeError('Runtime binary responses unavailable'));
    return response.arrayBuffer().then(function (buffer) {
      if (buffer.byteLength > 4096) throw safeError('Media verification response exceeds size limit');
      var bytes = new Uint8Array(buffer), data = [];
      for (var i = 0; i < bytes.length; i++) data.push(bytes[i]);
      return { body: '', bytes: bytes.length, data: data };
    });
  }
  return response.text().then(function (body) { return { body: body, bytes: byteLength(body) }; });
}

function request(url, options) {
  options = options || {};
  if (!/^https?:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/i.test(url)) return Promise.reject(safeError('Unsupported request URL'));
  var site = u.origin(url);
  var state = options.session || session();
  var method = String(options.method || 'GET').toUpperCase();
  var timeout = Math.min(Math.max(Number(options.timeout) || 12000, 1), 12000);
  var headers = {
    'User-Agent': USER_AGENT,
    Accept: options.json ? 'application/json, text/javascript, */*; q=0.01' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
  };
  if (options.referer) headers.Referer = options.referer;
  if (options.origin) headers.Origin = options.origin;
  if (options.search) headers['X-Requested-With'] = 'fetch';
  if (options.bearer) headers.Authorization = 'Bearer ' + options.bearer;
  Object.keys(options.headers || {}).forEach(function (name) {
    if (/^(?:cookie|host|content-length|connection|proxy-authorization)$/i.test(name)) return;
    headers[name] = String(options.headers[name]);
  });

  function blocked(message) {
    state.blocked[site] = message;
    return safeError(message, true);
  }

  function attempt(number) {
    if (state.cancelled) return Promise.reject(safeError('Lookup cancelled: ' + site, false, false, true));
    if (state.blocked[site]) return Promise.reject(safeError(state.blocked[site], true));
    var remaining = state.deadline - Date.now();
    if (remaining <= 0) return Promise.reject(safeError('Lookup time budget exhausted: ' + site));
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    var finished = false;
    return new Promise(function (resolve, reject) {
      function cancelPending() {
        finish(safeError('Lookup cancelled: ' + site, false, false, true));
        if (controller) controller.abort();
      }
      function finish(error, value) {
        if (finished) return;
        finished = true;
        if (timer !== null && typeof clearTimeout === 'function') clearTimeout(timer);
        var pendingIndex = state.pending.indexOf(cancelPending);
        if (pendingIndex !== -1) state.pending.splice(pendingIndex, 1);
        if (error) reject(error); else resolve(value);
      }
      if (!state.pending) state.pending = [];
      state.pending.push(cancelPending);
      if (typeof setTimeout === 'function') {
        timer = setTimeout(function () {
          finish(safeError('Request timed out: ' + site, false, true));
          if (controller) controller.abort();
        }, Math.min(timeout, remaining));
      }
      var init = { method: method, headers: headers, credentials: 'same-origin' };
      if (controller) init.signal = controller.signal;
      Promise.resolve().then(function () {
        if (finished) return null;
        return fetch(url, init);
      }).then(function (response) {
        if (finished) return;
        var mitigation = response.headers && typeof response.headers.get === 'function' ? response.headers.get('cf-mitigated') : '';
        if (response.status === 403 || response.status === 429 || response.status === 451) throw blocked('Site access blocked (HTTP ' + response.status + '): ' + site);
        if (mitigation === 'challenge') throw blocked('Cloudflare challenge: ' + site);
        if (!response.status) throw safeError('Network request failed: ' + site, false, true);
        return readBody(response, options).then(function (result) {
          if (finished) return;
          var body = result.body;
          var receivedBytes = result.bytes;
          // The native bridge can truncate exactly at its byte quota without a
          // separate truncation flag. A quota-sized body cannot be trusted.
          if (receivedBytes >= MAX_BYTES) throw safeError('Response reaches TV size limit: ' + site);
          if (/<title[^>]*>\s*(?:Just a moment|Attention Required)/i.test(body) || /cf-browser-verification|class=["']cf-turnstile/i.test(body)) throw blocked('Cloudflare challenge: ' + site);
          if (!response.ok) throw safeError('HTTP ' + response.status + ': ' + site, false, [502, 503, 504].indexOf(response.status) !== -1);
          var value = body;
          if (options.json) {
            try { value = JSON.parse(body); } catch (ignored) { throw safeError('Invalid JSON response: ' + site); }
          }
          if (options.responseInfo) value = {
            body: value,
            status: response.status,
            finalUrl: response.url || url,
            contentType: response.headers && typeof response.headers.get === 'function' ? response.headers.get('content-type') || '' : '',
            contentLength: response.headers && typeof response.headers.get === 'function' ? Number(response.headers.get('content-length')) || 0 : 0,
            contentRange: response.headers && typeof response.headers.get === 'function' ? response.headers.get('content-range') || '' : '',
            receivedBytes: receivedBytes,
            data: result.data || []
          };
          finish(null, value);
        });
      }).catch(function (error) {
        finish(error && error.providerSafe ? error : safeError('Network request failed: ' + site, false, true));
      });
    }).catch(function (error) {
      // One GET retry for a transport failure or a temporary upstream outage.
      // Never retry access restrictions, verification pages, or malformed data.
      if (!state.cancelled && method === 'GET' && number === 0 && error.transient && state.deadline - Date.now() >= timeout) return attempt(1);
      throw error;
    });
  }
  return attempt(0);
}

module.exports = { request: request, USER_AGENT: USER_AGENT, session: session, cancel: cancel };

},
"media": function(module, exports, require) {
'use strict';
var u = require("utils");

function codecName(value) {
  if (/^avc[13]/i.test(value)) return 'H.264';
  if (/^(?:hvc1|hev1|hevc)/i.test(value)) return 'HEVC';
  if (/^(?:vp09|vp9)/i.test(value)) return 'VP9';
  if (/^av01/i.test(value)) return 'AV1';
  if (/^mp4a/i.test(value)) return 'AAC';
  if (/^opus/i.test(value)) return 'Opus';
  if (/^ac-3/i.test(value)) return 'AC-3';
  if (/^ec-3/i.test(value)) return 'E-AC-3';
  if (/^flac/i.test(value)) return 'FLAC';
  return '';
}
function codecs(values) {
  var found = [];
  values.forEach(function (value) {
    String(value || '').split(',').forEach(function (item) {
      var name = codecName(item.trim());
      if (name && found.indexOf(name) < 0) found.push(name);
    });
  });
  return found.join(' + ');
}
function dash(body) {
  if (typeof body !== 'string' || body.length > 1024 * 1024 || !/<(?:[\w.-]+:)?MPD\b/i.test(body)) return null;
  body = body.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<(?:[\w.-]+:)?Period\b/i.test(body) || !/<\/(?:[\w.-]+:)?MPD\s*>\s*$/i.test(body)) return null;
  // This provider only exposes ordinary clear streams, not protected manifests.
  if (/<(?:[\w.-]+:)?ContentProtection\b|default_KID|<(?:[\w.-]+:)?pssh\b/i.test(body)) return null;
  var tags = /<(\/?)(?:[\w.-]+:)?(Representation|AdaptationSet)\b([^>]*)>/gi, match;
  var height = 0, width = 0, values = [], representations = 0, parent = {};
  while ((match = tags.exec(body))) {
    var adaptation = match[2].toLowerCase() === 'adaptationset';
    if (match[1]) { if (adaptation) parent = {}; continue; }
    var h = Number(u.attr(match[3], 'height')) || Number(u.attr(match[3], 'maxHeight')) || 0;
    var w = Number(u.attr(match[3], 'width')) || Number(u.attr(match[3], 'maxWidth')) || 0;
    var codec = u.attr(match[3], 'codecs');
    if (adaptation) { parent = { height: h, width: w, codec: codec }; continue; }
    representations++;
    h = h || parent.height || 0; w = w || parent.width || 0;
    if (h > height) { height = h; width = w; }
    values.push(codec || parent.codec);
  }
  if (!representations || !height || height > 8640 || width > 15360) return null;
  return { quality: height + 'p', codecSummary: codecs(values), height: height, width: width };
}
function hls(body) {
  if (typeof body !== 'string' || body.length > 1024 * 1024 || !/^\s*#EXTM3U/.test(body)) return null;
  // AES-128 HLS can be played by the native player. DRM key formats cannot.
  var keys = /#EXT-X-(?:SESSION-)?KEY:([^\r\n]*)/gi, key;
  while ((key = keys.exec(body))) {
    if (/\bMETHOD=SAMPLE-AES(?:-CTR)?\b/i.test(key[1])) return null;
    var format = /\bKEYFORMAT=(?:"([^"]+)"|'([^']+)'|([^,\s]+))/i.exec(key[1]);
    if (format && String(format[1] || format[2] || format[3]).toLowerCase() !== 'identity') return null;
  }
  var lines = body.split(/\r?\n/), playable = false;
  for (var i = 0; i < lines.length; i++) {
    if (!/^\s*#EXT(?:INF:|-X-STREAM-INF:)/i.test(lines[i])) continue;
    var next = i + 1;
    while (next < lines.length && (!lines[next].trim() || /^\s*#/.test(lines[next]))) next++;
    if (next < lines.length && /^[^#<>\s]+$/.test(lines[next].trim())) { playable = true; break; }
  }
  if (!playable) return null;
  var heights = /\bRESOLUTION=(\d+)x(\d+)/gi, match, height = 0, width = 0, values = [];
  while ((match = heights.exec(body))) if (Number(match[2]) > height) { height = Number(match[2]); width = Number(match[1]); }
  var codec = /\bCODECS="([^"]+)"/gi;
  while ((match = codec.exec(body))) values.push(match[1]);
  return { quality: height ? height + 'p' : '', codecSummary: codecs(values), height: height, width: width };
}
module.exports = { dash: dash, hls: hls };

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
var media = require("media");
var DEFAULT_SITE = 'https://www.diziyou.one';

function settings() {
  var root = typeof globalThis !== 'undefined' ? globalThis : {};
  var saved = root.SCRAPER_SETTINGS || {};
  return { site: u.siteUrl(saved.siteUrl || DEFAULT_SITE) || DEFAULT_SITE, key: String(saved.tmdbApiKey || root.TMDB_API_KEY || '').trim(), audio: /^(?:tr|turkish)$/i.test(String(saved.audioPreference || '')) ? 'tr' : 'original', session: http.session() };
}

function metadata(id, cfg) {
  if (!cfg.key) return Promise.reject(new Error('TMDB key unavailable. Enter your own key in DiziYou TV settings.'));
  var token = cfg.key.length > 40;
  var url = 'https://api.themoviedb.org/3/tv/' + encodeURIComponent(id) + '?language=tr-TR';
  if (!token) url += '&api_key=' + encodeURIComponent(cfg.key);
  return http.request(url, { json: true, bearer: token ? cfg.key : '', session: cfg.session }).then(function (data) {
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
    }).catch(function (error) {
      if (error.siteBlocked || /budget exhausted/i.test(error.message || '')) throw error;
      return next(index + 1);
    });
  }
  return next(0);
}

function firstSource(tasks, preferFirst) {
  if (!tasks.length) return Promise.resolve([]);
  return new Promise(function (resolve) {
    var results = [], completed = [], remaining = tasks.length, finished = false;
    tasks.forEach(function (task, index) {
      Promise.resolve().then(task).catch(function () { return []; }).then(function (streams) {
        results[index] = streams || []; completed[index] = true; remaining--;
        if (finished) return;
        // Preserve the selected audio. An unused, slower language must not hold
        // its verified preferred source; fall back after that preference fails.
        if (preferFirst && !completed[0]) return;
        for (var i = 0; i < results.length; i++) if (results[i] && results[i].length) { finished = true; resolve(results[i]); return; }
        if (!remaining) { finished = true; resolve([]); }
      });
    });
  });
}

function resolveEpisode(page, meta, cfg, season, episode) {
  var frames = catalog.playerFrames(page.html, page.url);
  function preferred(frame) { var dub = /dublaj/i.test(frame.name); return cfg.audio === 'tr' ? dub : !dub; }
  // English-subtitle and Turkish-subtitle frames can point at the same original
  // audio. Keep a dubbed choice in the bounded pair when the site publishes it.
  var originals = frames.filter(function (frame) { return !/dublaj/i.test(frame.name); });
  var dubbed = frames.filter(function (frame) { return /dublaj/i.test(frame.name); });
  frames = originals.length && dubbed.length ? [originals[0], dubbed[0]] : frames.slice(0, 2);
  frames.sort(function (a, b) { return Number(preferred(b)) - Number(preferred(a)); });
  return firstSource(frames.slice(0, 2).map(function (frame) {
    return function () { return http.request(frame.url, { referer: page.url, session: cfg.session, responseInfo: true }).then(function (response) {
      if (!u.sameSite(response.finalUrl, frame.url) || response.finalUrl.split(/[?#]/)[0] !== frame.url.split(/[?#]/)[0]) return [];
      var parsed = catalog.parsePlayer(response.body, response.finalUrl).filter(function (stream) { return stream.type === 'hls'; }).slice(0, 2);
      return firstSource(parsed.map(function (stream) {
        return function () { return http.request(stream.url, { referer: cfg.site + '/', origin: cfg.site, session: cfg.session }).then(function (playlist) {
          var info = media.hls(playlist);
          if (!info) return [];
          var headers = { Referer: cfg.site + '/', Origin: cfg.site, 'User-Agent': http.USER_AGENT };
          var subtitles = (stream.subtitles || []).map(function (sub, index) {
            return { id: 'diziyou-' + index, url: sub.url, language: sub.language || 'und', name: sub.label || sub.name || sub.language || 'Subtitle', headers: headers };
          });
          return [{ name: 'DiziYou TV', provider: 'DiziYou TV', title: meta.title + ' S' + season + 'E' + episode + ' | ' + (frame.name || 'Original audio'), url: stream.url, quality: info.quality || 'Auto', type: 'hls', headers: headers, subtitles: subtitles }];
        }).catch(function () { return []; }); };
      }), false);
    }).catch(function () { return []; }); };
  }), true);
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
        }).then(function (streams) { return streams.length ? streams : next(index + 1); }).catch(function (error) {
          if (error.siteBlocked || /budget exhausted/i.test(error.message || '')) throw error;
          return next(index + 1);
        });
      }
      return next(0);
    });
  }).then(function (streams) {
    http.cancel(cfg.session);
    var seen = {};
    return streams.filter(function (stream) { if (seen[stream.url]) return false; seen[stream.url] = true; return true; });
  }).catch(function (error) {
    http.cancel(cfg.session);
    console.warn('[DiziYou TV] ' + (error.providerSafe ? error.message : !cfg.key ? 'TMDB key unavailable. Enter your own key in plugin settings.' : 'Source could not be resolved.'));
    return [];
  });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'DiziYou TV' },
    { type: 'text', key: 'audioPreference', label: 'Audio language', defaultValue: 'original', description: 'Enter original for original/subtitled audio, or tr for Turkish dubbing. Falls back when unavailable.' },
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
