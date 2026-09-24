#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { startProxy } = createRequire(import.meta.url)('../src/generic/runtime/openai-proxy.cjs');
const requests = [];
const upstream = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
  const body = await req.json();
  requests.push({ body, auth: req.headers.get('authorization'), path: new URL(req.url).pathname });
  const chunk = { id: 'test', choices: [{ index: 0, delta: { content: 'local reply' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 2 } };
  return body.stream
    ? new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
    : Response.json({ ...chunk, choices: [{ message: { content: 'local reply' }, finish_reason: 'stop' }] });
} });
try {
  for (const stream of [false, true]) {
    for (const [configured, requested, expected] of [
      [undefined, undefined, undefined], [undefined, 'low', 'low'], [undefined, 'medium', 'medium'],
      [undefined, 'high', 'high'], [undefined, 'max', 'xhigh'], [undefined, 'auto', undefined],
      ['max', undefined, 'xhigh'], ['high', 'low', 'high'], ['auto', 'max', undefined], ['low', undefined, 'low'],
    ]) {
      const proxy = startProxy({ apiKey: 'test-key', baseURL: `http://127.0.0.1:${upstream.port}/v1`, effort: configured });
      try {
        const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/messages`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5000),
          body: JSON.stringify({ model: 'custom-model', max_tokens: 42, stream,
            ...(requested === undefined ? {} : { output_config: { effort: requested } }),
            messages: [{ role: 'user', content: 'local test only' }] }),
        });
        assert.equal(response.status, 200);
        const text = await response.text();
        assert.match(text, /local reply/);
        if (stream) assert.match(text, /event: message_stop/);
        const sent = requests.at(-1);
        assert.equal(sent.body.reasoning_effort, expected, `stream=${stream}, config=${configured}, request=${requested}`);
        assert.equal(sent.path, '/v1/chat/completions');
        assert.equal(sent.auth, 'Bearer test-key');
        assert.equal(sent.body.model, 'custom-model');
        assert.equal(sent.body.max_tokens, 42);
        assert.equal(sent.body.stream, stream);
        assert.equal('output_config' in sent.body, false);
      } finally { proxy.stop(); }
    }
  }
} finally { upstream.stop(true); }
console.log('OpenAI proxy effort: streaming/non-streaming loopback checks passed; no external inference.');
