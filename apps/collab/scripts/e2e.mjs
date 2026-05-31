// M0.5 端到端验证：协同持久化 + 鉴权。
// 需先启动 api(3001) 与 collab(3002)。用法：node scripts/e2e.mjs
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import WebSocket from 'ws';

const API = 'http://localhost:3001/api';
const COLLAB = 'ws://localhost:3002';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitSynced(provider, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (provider.synced) return resolve();
    const t = setTimeout(() => reject(new Error('sync timeout')), timeoutMs);
    provider.on('synced', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function jpost(path, body, token) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

const email = `e2e${Date.now()}@m.dev`;
const reg = await jpost('/auth/register', { email, password: 'demo1234', displayName: 'E2E' });
const token = reg.accessToken;
const proj = await jpost('/projects', { name: 'E2E协同' }, token);
const mapId = proj.mapId;
console.log('mapId =', mapId);

// ① 连接 + 写入
const doc1 = new Y.Doc();
const p1 = new HocuspocusProvider({
  url: COLLAB,
  name: mapId,
  token,
  document: doc1,
  WebSocketPolyfill: WebSocket,
});
await waitSynced(p1);
console.log('① 连接 + 初次 sync 成功');
const n = new Y.Map();
doc1.getMap('nodes').set('n_test', n);
n.set('title', 'Hello协同');
n.set('type', 'task');
await sleep(3000); // 等 onStoreDocument 防抖落库
p1.destroy();
console.log('② 写入并等待持久化');

// ③ 新文档重连，验证持久化
await sleep(500);
const doc2 = new Y.Doc();
const p2 = new HocuspocusProvider({
  url: COLLAB,
  name: mapId,
  token,
  document: doc2,
  WebSocketPolyfill: WebSocket,
});
await waitSynced(p2);
const loaded = doc2.getMap('nodes').get('n_test');
const title = loaded ? loaded.get('title') : undefined;
console.log('③ 重连读取 title =', JSON.stringify(title), title === 'Hello协同' ? '✅ 持久化成功' : '❌ 持久化失败');
p2.destroy();

// ④ 鉴权：无效 token 应被拒绝
await sleep(300);
let rejected = false;
const doc3 = new Y.Doc();
const p3 = new HocuspocusProvider({
  url: COLLAB,
  name: mapId,
  token: 'invalid.token.here',
  document: doc3,
  WebSocketPolyfill: WebSocket,
  onAuthenticationFailed: () => {
    rejected = true;
  },
});
await sleep(2500);
console.log('④ 无效 token:', rejected ? '✅ 被拒绝' : '❌ 未被拒绝');
p3.destroy();

await sleep(200);
process.exit(0);
