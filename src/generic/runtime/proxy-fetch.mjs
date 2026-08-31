#!/usr/bin/env bun
import { BlockList, isIP } from 'node:net';
import { fileURLToPath } from 'node:url';

function emptyProxySettings() {
  return {
    httpProxy: undefined,
    httpsProxy: undefined,
    exceptions: [],
    excludeSimpleHostnames: false,
  };
}

function settingValue(source, name) {
  const match = new RegExp(`^\\s*${name}\\s*:\\s*(.*?)\\s*$`, 'm').exec(source);
  return match?.[1];
}

function proxyUrl(source, prefix) {
  if (settingValue(source, `${prefix}Enable`) !== '1') return undefined;
  const host = settingValue(source, `${prefix}Proxy`)?.trim().replace(/^\[|\]$/g, '');
  const port = Number(settingValue(source, `${prefix}Port`));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  try {
    const url = new URL(`http://${isIP(host) === 6 ? `[${host}]` : host}:${port}`);
    return url.href.replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function validMacOSProxyOutput(source) {
  return typeof source === 'string' && /^\s*<dictionary>\s*\{[\s\S]*\}\s*$/.test(source);
}

export function parseMacOSProxySettings(source) {
  if (!validMacOSProxyOutput(source)) return emptyProxySettings();
  const array = /ExceptionsList\s*:\s*<array>\s*\{([\s\S]*?)^\s*\}/m.exec(source)?.[1] || '';
  const exceptions = [...array.matchAll(/^\s*\d+\s*:\s*(.*?)\s*$/gm)]
    .flatMap(match => match[1].split(','))
    .map(value => value.trim())
    .filter(Boolean);
  return {
    httpProxy: proxyUrl(source, 'HTTP'),
    httpsProxy: proxyUrl(source, 'HTTPS'),
    exceptions,
    excludeSimpleHostnames: settingValue(source, 'ExcludeSimpleHostnames') === '1',
  };
}

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
  return { host: host.replace(/^\*\.?/, '.'), port };
}

function cidrMatches(host, rule) {
  const slash = rule.lastIndexOf('/');
  if (slash <= 0) return false;
  let network = rule.slice(0, slash).replace(/^\[|\]$/g, '');
  if (/^(?:\d{1,3}\.){0,2}\d{1,3}$/.test(network)) network = `${network}${'.0'.repeat(4 - network.split('.').length)}`;
  const family = isIP(network);
  const prefix = Number(rule.slice(slash + 1));
  const width = family === 4 ? 32 : family === 6 ? 128 : 0;
  if (!width || isIP(host) !== family || !Number.isInteger(prefix) || prefix < 0 || prefix > width) return false;
  try {
    const blockList = new BlockList();
    const type = family === 4 ? 'ipv4' : 'ipv6';
    blockList.addSubnet(network, prefix, type);
    return blockList.check(host, type);
  } catch {
    return false;
  }
}

function matchesRule(parsed, value) {
  const rule = noProxyRule(value);
  if (rule.all) return true;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const baseHost = rule.host.replace(/^\./, '');
  const matchesHost = cidrMatches(host, rule.host) || host === baseHost || host.endsWith(`.${baseHost}`);
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : parsed.protocol === 'http:' ? '80' : '');
  return matchesHost && (!rule.port || rule.port === port);
}

function environmentProxy(parsed, env) {
  return parsed.protocol === 'https:'
    ? env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy
    : env.HTTP_PROXY || env.http_proxy;
}

function bypassesEnvironment(parsed, env) {
  const entries = (env.NO_PROXY || env.no_proxy || '').split(',').filter(value => value.trim());
  return entries.some(entry => matchesRule(parsed, entry));
}

function bypassesSystem(parsed, settings) {
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (settings.excludeSimpleHostnames && !host.includes('.') && !isIP(host)) return true;
  return settings.exceptions.some(entry => matchesRule(parsed, entry));
}

let cachedSystemProxy;

export function readMacOSSystemProxy({
  platform = process.platform,
  spawnSync = (command, options) => Bun.spawnSync(command, options),
  warn = message => console.error(`[clawgod] ${message}`),
} = {}) {
  if (platform !== 'darwin') return emptyProxySettings();
  try {
    const result = spawnSync(['/usr/sbin/scutil', '--proxy'], { stdout: 'pipe', stderr: 'pipe' });
    if (result.exitCode !== 0) throw new Error('scutil failed');
    const source = Buffer.from(result.stdout || []).toString('utf8');
    if (!validMacOSProxyOutput(source)) throw new Error('malformed scutil output');
    const settings = parseMacOSProxySettings(source);
    const automatic = ['ProxyAutoConfigEnable', 'ProxyAutoDiscoveryEnable']
      .some(name => settingValue(source, name) === '1');
    if (automatic) {
      warn('macOS PAC and auto-discovery proxy settings are not supported; continuing without a proxy.');
      return emptyProxySettings();
    }
    if (!settings.httpProxy && !settings.httpsProxy && settingValue(source, 'SOCKSEnable') === '1') {
      warn('macOS SOCKS-only proxy settings are not supported; continuing without a proxy.');
    }
    return settings;
  } catch {
    warn('Unable to read macOS system proxy settings; continuing without a proxy.');
    return emptyProxySettings();
  }
}

function defaultSystemProxy(env) {
  if (env !== process.env) return emptyProxySettings();
  cachedSystemProxy ||= readMacOSSystemProxy();
  return cachedSystemProxy;
}

function proxyRoute(urlValue, env, systemProxy) {
  const parsed = typeof urlValue === 'string' ? new URL(urlValue) : urlValue;
  if (bypassesEnvironment(parsed, env)) return { bypass: true, proxy: undefined };
  const explicit = environmentProxy(parsed, env);
  if (explicit) return { bypass: false, proxy: explicit };
  const settings = systemProxy || defaultSystemProxy(env);
  if (bypassesSystem(parsed, settings)) return { bypass: true, proxy: undefined };
  const proxy = parsed.protocol === 'https:' ? settings.httpsProxy : settings.httpProxy;
  return { bypass: !proxy, proxy };
}

export function proxyFor(urlValue, env = process.env, systemProxy) {
  return proxyRoute(urlValue, env, systemProxy).proxy;
}

const DIRECT_WORKER_FLAG = '--clawgod-direct-fetch-worker';

function directWorkerEnv() {
  const env = { ...process.env, NO_PROXY: '*', no_proxy: '*' };
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete env[name];
  return env;
}

function directWorkerBody(child) {
  const reader = child.stdout.getReader();
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (!done) {
          controller.enqueue(value);
          return;
        }
        const status = await child.exited;
        if (status === 0) controller.close();
        else {
          const stderr = await new Response(child.stderr).text();
          controller.error(new Error(stderr.trim() || `Direct fetch worker exited with status ${status}`));
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      reader.cancel(reason);
      child.kill();
    },
  });
}

function fetchDirect(url, init, fetchImpl) {
  const method = String(init.method || 'GET').toUpperCase();
  if ((method !== 'GET' && method !== 'HEAD') || init.body != null) {
    throw new Error('Direct downloads support only GET or HEAD requests without a body');
  }
  if (fetchImpl !== fetch) return fetchImpl(url, init);
  return new Promise((resolve, reject) => {
    let metadata;
    let settled = false;
    const child = Bun.spawn([process.execPath, fileURLToPath(import.meta.url), DIRECT_WORKER_FLAG], {
      stdin: Buffer.from(JSON.stringify({
        url: String(url),
        method: init.method || 'GET',
        headers: [...new Headers(init.headers).entries()],
      })),
      stdout: 'pipe',
      stderr: 'pipe',
      env: directWorkerEnv(),
      ipc(message) {
        metadata = message;
        if (!settled && message?.ok) {
          settled = true;
          resolve(new Response(directWorkerBody(child), {
            status: message.status,
            statusText: message.statusText,
            headers: message.headers,
          }));
        }
      },
    });
    child.exited.then(async status => {
      if (settled) return;
      settled = true;
      const stderr = await new Response(child.stderr).text();
      reject(new Error(stderr.trim() || `Direct fetch worker exited with status ${status}`));
    });
    if (init.signal) {
      const abort = () => child.kill();
      if (init.signal.aborted) abort();
      else init.signal.addEventListener('abort', abort, { once: true });
    }
  });
}

async function runDirectFetchWorker() {
  try {
    const { url, method, headers } = await Bun.stdin.json();
    const response = await fetch(url, {
      method,
      headers,
      redirect: 'manual',
    });
    process.send({
      ok: true,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
    });
    if (response.body) {
      for await (const chunk of response.body) {
        await new Promise((resolve, reject) => {
          process.stdout.write(chunk, error => error ? reject(error) : resolve());
        });
      }
    }
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.main && process.argv[2] === DIRECT_WORKER_FLAG) await runDirectFetchWorker();

export async function fetchWithProxy(initialUrl, init = {}, env = process.env, fetchImpl = fetch, systemProxy) {
  let nextUrl = initialUrl;
  const { proxy: _callerProxy, ...baseInit } = init;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const route = proxyRoute(nextUrl, env, systemProxy);
    const timeoutSignal = AbortSignal.timeout(300000);
    const signal = baseInit.signal ? AbortSignal.any([baseInit.signal, timeoutSignal]) : timeoutSignal;
    let response;
    try {
      const requestInit = {
        ...baseInit,
        redirect: 'manual',
        signal,
        ...(route.proxy ? { proxy: route.proxy } : {}),
      };
      signal.throwIfAborted();
      response = route.bypass
        ? await fetchDirect(nextUrl, requestInit, fetchImpl)
        : await fetchImpl(nextUrl, requestInit);
    } catch (error) {
      if (signal.aborted) throw signal.reason || error;
      if (route.proxy) throw new Error('Request failed through configured proxy');
      throw error;
    }
    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
      if (response.body) await response.body.cancel();
      if (redirects === 5) throw new Error('Too many redirects');
      nextUrl = new URL(response.headers.get('location'), nextUrl).href;
      continue;
    }
    if (response.status !== 200) {
      if (response.body) await response.body.cancel();
      throw new Error(`Request failed with HTTP ${response.status}`);
    }
    return response;
  }
  throw new Error('Too many redirects');
}
