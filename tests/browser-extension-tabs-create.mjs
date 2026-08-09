#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const archive = fileURLToPath(new URL('../claude-browser-1.0.77-patched.zip', import.meta.url));
const entry = 'claude-browser-1.0.77-patched/assets/mcpPermissions-CJK8I7C7.js';
const extracted = spawnSync('unzip', ['-p', archive, entry], {
  encoding: 'utf8',
  maxBuffer: 4 * 1024 * 1024,
});

assert.equal(extracted.status, 0, extracted.stderr);

const tool = extracted.stdout.match(
  /name:"tabs_create_mcp",description:[\s\S]*?,execute:(async\(e,t\)=>\{[\s\S]*?\}),toAnthropicSchema:async\(\)=>\(\{name:"tabs_create_mcp"/,
);
assert.ok(tool, 'the extension must expose the tabs_create_mcp implementation');

function createHarness(initialTabs) {
  const createdTabs = [];
  const groupedTabs = [];
  const tabs = initialTabs.map((tab) => ({ ...tab }));
  const chrome = {
    tabGroups: {
      async get() {
        return { windowId: 7 };
      },
    },
    tabs: {
      async query() {
        return tabs;
      },
      async create(options) {
        createdTabs.push(options);
        const tab = { id: 43, windowId: options.windowId, groupId: -1, url: options.url };
        tabs.push(tab);
        return tab;
      },
      async group(options) {
        groupedTabs.push(options);
      },
    },
  };
  const Ey = {
    async initialize() {},
  };
  const execute = runInNewContext(`(${tool[1]})`, { chrome, Ey });
  return { createdTabs, execute, groupedTabs };
}

const emptyTab = createHarness([{ id: 42, title: 'New Tab', url: 'chrome://newtab/' }]);
const reused = await emptyTab.execute(undefined, { sessionScope: {}, tabGroupId: 3 });
assert.equal(
  emptyTab.createdTabs.length,
  0,
  'tabs_create_mcp must reuse the empty session placeholder instead of leaving it behind',
);
assert.equal(reused.tabContext.executedOnTabId, 42, 'the reused placeholder must become the tool target');

const populatedTab = createHarness([{ id: 42, title: 'Example', url: 'https://example.com/' }]);
const created = await populatedTab.execute(undefined, { sessionScope: {}, tabGroupId: 3 });
assert.equal(populatedTab.createdTabs.length, 1, 'tabs_create_mcp must create from a populated group');
assert.deepEqual(
  JSON.parse(JSON.stringify(populatedTab.groupedTabs)),
  [{ tabIds: 43, groupId: 3 }],
  'a newly created tab must stay in the current Claude group',
);
assert.equal(created.tabContext.executedOnTabId, 43, 'the created tab must become the tool target');

console.log('browser extension tabs_create checks passed');
