#!/usr/bin/env bun
import { existsSync, renameSync, rmSync } from 'node:fs';

const [url, destination] = process.argv.slice(2);
if (!url || !destination) throw new Error('usage: fetch-file.mjs <url> <destination>');

function noProxyRule(value) {
  let entry = value.trim().toLowerCase();
  if (entry === '*') return { all: true };

  let host = entry;
  let port = '';
  if (entry.startsWith('[')) {
    const close = entry.indexOf(']');
    if (close === -1) return { host: entry, port };
    host = entry.slice(1, close);
    const suffix = entry.slice(close + 1);
    if (/^:\d+$/.test(suffix)) port = suffix.slice(1);
    else if (suffix) return { host: entry, port };
  } else {
    const colon = entry.lastIndexOf(':');
    if (colon > 0 && colon === entry.indexOf(':') && /^\d+$/.test(entry.slice(colon + 1))) {
      host = entry.slice(0, colon);
      port = entry.slice(colon + 1);
    }
  }
  return { host: host.replace(/^\*\./, '.'), port };
}

function bypassesProxy(urlValue) {
  const parsed = typeof urlValue === 'string' ? new URL(urlValue) : urlValue;
  const entries = (process.env.NO_PROXY || process.env.no_proxy || '').split(',').filter(value => value.trim());
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : parsed.protocol === 'http:' ? '80' : '');
  return entries.some(entry => {
    const rule = noProxyRule(entry);
    if (rule.all) return true;
    const baseHost = rule.host.replace(/^\./, '');
    const matchesHost = host === baseHost || host.endsWith(`.${baseHost}`);
    return matchesHost && (!rule.port || rule.port === port);
  });
}

function proxyFor(urlValue) {
  const parsed = new URL(urlValue);
  if (bypassesProxy(parsed)) return undefined;
  return parsed.protocol === 'https:'
    ? process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
    : process.env.HTTP_PROXY || process.env.http_proxy;
}

async function fetchWithProxy(initialUrl) {
  let nextUrl = initialUrl;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const proxy = proxyFor(nextUrl);
    const response = await fetch(nextUrl, { redirect: 'manual', signal: AbortSignal.timeout(300000), ...(proxy ? { proxy } : {}) });
    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
      if (redirects === 5) throw new Error('too many redirects');
      nextUrl = new URL(response.headers.get('location'), nextUrl).href;
      continue;
    }
    if (response.status !== 200) throw new Error(`download failed with HTTP ${response.status}`);
    return response;
  }
  throw new Error('too many redirects');
}

const temporary = `${destination}.${process.pid}.tmp`;
try {
  const response = await fetchWithProxy(url);
  await Bun.write(temporary, response);
  renameSync(temporary, destination);
} finally {
  if (existsSync(temporary)) rmSync(temporary, { force: true });
}
