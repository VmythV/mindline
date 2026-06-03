import { describe, expect, it } from 'vitest';
import { ID_PREFIX, newId, type IdEntity } from './ids';

describe('newId', () => {
  const entities = Object.keys(ID_PREFIX) as IdEntity[];

  it('每个实体生成正确前缀', () => {
    for (const entity of entities) {
      const id = newId(entity);
      expect(id.startsWith(ID_PREFIX[entity])).toBe(true);
    }
  });

  it('前缀后是 26 位 ULID（Crockford Base32）', () => {
    for (const entity of entities) {
      const id = newId(entity);
      const ulidPart = id.slice(ID_PREFIX[entity].length);
      expect(ulidPart).toHaveLength(26);
      // ULID 字符集：去除 I L O U 的大写字母 + 数字
      expect(ulidPart).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    }
  });

  it('同一实体多次生成不重复', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId('node')));
    expect(ids.size).toBe(100);
  });

  it('K-sortable：跨毫秒生成的 ID 字典序严格递增', async () => {
    // ULID 高 10 位是毫秒时间戳，单调递增；同毫秒内随机段不保证有序，
    // 故隔一个真实毫秒再生成，验证时间维度的可排序性（newId 用普通 ulid，非 monotonic）。
    const a = newId('node');
    await new Promise((r) => setTimeout(r, 2));
    const b = newId('node');
    expect(a < b).toBe(true);
  });

  it('不同实体前缀互不为前缀关系（避免误判归属）', () => {
    const prefixes = Object.values(ID_PREFIX);
    for (const p1 of prefixes) {
      for (const p2 of prefixes) {
        if (p1 === p2) continue;
        // 例如 'u_' 与 'ws_'：不应出现一个是另一个的前缀，否则前缀判定会歧义
        expect(p1.startsWith(p2) && p1 !== p2).toBe(false);
      }
    }
  });
});
