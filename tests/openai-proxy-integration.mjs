#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { request } from 'node:http';

const { startProxy } = createRequire(import.meta.url)('../src/generic/runtime/openai-proxy.cjs');

await (async () => {
  const calls = [];
  let mode = 'tool';
  let toolFinish = 'tool_calls';
  const upstream = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(req) {
      assert.equal(new URL(req.url).pathname, '/v1/chat/completions');
      assert.equal(req.headers.get('authorization'), 'Bearer fixture-key');
      const body = await req.json();
      calls.push(body);
      if (mode === 'tool' || mode === 'text') {
        assert.deepEqual(body.messages.slice(0, 2), [
          { role: 'system', content: 'top-level instructions' },
          { role: 'system', content: 'inline instructions\nadditional context' },
        ]);
      }
      if (mode === 'error') return Response.json({ error: { message: 'slow down' } }, { status: 429, headers: { 'retry-after': '2' } });
      if (mode === 'timeout') return new Response(new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode(':waiting\n\n')); },
      }), { headers: { 'content-type': 'text/event-stream' } });
      const tool = mode === 'tool';
      const message = tool ? { content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'read_file', arguments: '{"path":"README.md"}' } }] } : { content: 'file read' };
      const finish_reason = tool ? toolFinish : 'stop';
      const usage = { prompt_tokens: 42, completion_tokens: 9 };
      if (!body.stream) return Response.json({ id: 'fixture', choices: [{ message, finish_reason }], usage });
      const delta = tool ? { tool_calls: message.tool_calls.map(t => ({ ...t, index: 0 })) } : message;
      const chunks = [
        { id: 'fixture', choices: [{ delta, finish_reason: null, index: 0 }] },
        { id: 'fixture', choices: [{ delta: {}, finish_reason, index: 0 }] },
        { choices: [], usage },
      ];
      // 代理必须跨真实 HTTP 字节分块完整保留事件。
      const wire = new TextEncoder().encode(chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n');
      let offset = 0;
      return new Response(new ReadableStream({
        pull(c) {
          if (offset >= wire.length) return c.close();
          c.enqueue(wire.slice(offset, offset + 5)); offset += 5;
        },
      }), { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  const config = { baseURL: `http://127.0.0.1:${upstream.port}/v1`, apiKey: 'fixture-key' };
  const proxy = startProxy(config);
  let timedProxy;
  async function send(body, path = '/v1/messages', server = proxy) {
    return fetch(`http://127.0.0.1:${server.port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }
  try {
    for (const finish of ['tool_calls', 'stop']) for (const stream of [false, true]) {
      toolFinish = finish;
      mode = 'tool';
      const first = { model: 'fixture-model', system: 'top-level instructions', messages: [
        { role: 'system', content: [{ type: 'text', text: 'inline instructions', cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'additional context' }] },
        { role: 'user', content: 'Read README.md' },
      ], tools: [{ name: 'read_file', input_schema: { type: 'object', properties: { path: { type: 'string' } } } }], tool_choice: { type: 'tool', name: 'read_file' }, max_tokens: 100, stream };
      const r = await send(first);
      assert.equal(r.status, 200);
      let content;
      if (stream) {
        const events = (await r.text()).split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
        assert.equal(events.at(-1).type, 'message_stop');
        assert.equal(events.at(-2).delta.stop_reason, 'tool_use');
        assert.deepEqual(events.at(-2).usage, { input_tokens: 42, output_tokens: 9 });
        content = events.filter(e => e.type === 'content_block_start').map(e => e.content_block);
        content[0].input = JSON.parse(events.find(e => e.delta?.type === 'input_json_delta').delta.partial_json);
      } else {
        const message = await r.json();
        assert.equal(message.stop_reason, 'tool_use');
        content = message.content;
      }
      assert.deepEqual(content, [{ type: 'tool_use', id: 'call-1', name: 'read_file', input: { path: 'README.md' } }]);
      mode = 'text';
      const second = await send({ ...first, stream: false, tool_choice: { type: 'auto' }, messages: [...first.messages, { role: 'assistant', content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'README contents' }] }] });
      assert.equal((await second.json()).content[0].text, 'file read');
      assert.deepEqual(calls.at(-1).messages.at(-1), { role: 'tool', tool_call_id: 'call-1', content: 'README contents' });
      const beforeCount = calls.length;
      const count = await send(first, '/v1/messages/count_tokens');
      assert.equal(count.headers.get('x-clawgod-token-count'), 'estimate');
      assert.ok((await count.json()).input_tokens > 0);
      assert.equal(calls.length, beforeCount);
      mode = 'error';
      const error = await send(first);
      assert.equal(error.status, 429);
      assert.equal(error.headers.get('retry-after'), '2');
      assert.equal((await error.json()).error.type, 'rate_limit_error');
    }
    mode = 'timeout';
    timedProxy = startProxy({ ...config, timeoutMs: 500 });
    const timed = await send({ model: 'fixture', stream: true, messages: [{ role: 'user', content: 'hi' }] }, '/v1/messages', timedProxy);
    assert.equal(timed.status, 200);
    const text = await timed.text();
    assert.match(text, /event: error/);
    assert.doesNotMatch(text, /event: message_stop/);
  } finally {
    proxy.stop();
    timedProxy?.stop();
    upstream.stop(true);
  }
})();
await (async () => {
  let resolveAbort;
  const aborted = new Promise(resolve => { resolveAbort = resolve; });
  const upstream = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
    await req.json();
    return new Response(new ReadableStream({
      start(controller) {
        const chunk = { choices: [{ index: 0, delta: { content: 'early' }, finish_reason: null }] };
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
      },
    }), { headers: { 'content-type': 'text/event-stream' } });
  } });
  const baseURL = `http://127.0.0.1:${upstream.port}/v1`;
  const originalFetch = globalThis.fetch;
  // 验证真实客户端断开到 fetch signal；Bun 的空闲上游 socket 关闭时机由运行时控制。
  globalThis.fetch = (url, options) => {
    if (url === baseURL + '/chat/completions') options.signal.addEventListener('abort', resolveAbort, { once: true });
    return originalFetch(url, options);
  };
  const proxy = startProxy({ baseURL, apiKey: 'fixture-key' });
  let deadline;
  let client;
  try {
    // Bun fetch 的 reader.cancel 不一定关闭空闲 socket，使用原生 HTTP 明确断开客户端。
    await new Promise((resolve, reject) => {
      client = request(`http://127.0.0.1:${proxy.port}/v1/messages`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
      }, response => {
        let text = '';
        response.on('error', reject);
        response.on('data', data => {
          text += data.toString();
          if (!text.includes('early')) return;
          assert.doesNotMatch(text, /event: message_stop/);
          response.destroy();
          client.destroy();
          resolve();
        });
      });
      client.on('error', reject);
      client.setTimeout(5000, () => { client.destroy(); reject(new Error('No early response')); });
      client.end(JSON.stringify({ model: 'fixture', stream: true, messages: [{ role: 'user', content: 'hi' }] }));
    });
    await Promise.race([aborted, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Client cancellation did not reach upstream')), 2000);
    })]);
  } finally {
    clearTimeout(deadline);
    globalThis.fetch = originalFetch;
    client?.destroy();
    proxy.stop();
    upstream.stop(true);
  }
})();
console.log('OpenAI proxy HTTP integration: tool round trip, usage, errors, local count, timeout and client cancellation passed.');
