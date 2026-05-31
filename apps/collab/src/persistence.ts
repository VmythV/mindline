import * as Y from 'yjs';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@mindline/db';

/**
 * 持久化（M0 简化版）：onStoreDocument 防抖后存一条全量快照（version++），
 * onLoadDocument 取最新快照重建。
 * 注：文档设计的 yjs_updates 增量 + 周期压实（Yjs协同详设 §7.1）留作后续优化，
 * 当前先用 snapshots-only 跑通协同持久化。
 */

export async function loadSnapshot(mapId: string, doc: Y.Doc): Promise<void> {
  const rows = await db
    .select({ state: schema.yjsSnapshots.state })
    .from(schema.yjsSnapshots)
    .where(eq(schema.yjsSnapshots.mapId, mapId))
    .orderBy(desc(schema.yjsSnapshots.version))
    .limit(1);
  const snap = rows[0];
  if (snap) Y.applyUpdate(doc, new Uint8Array(snap.state));
}

export async function storeSnapshot(mapId: string, doc: Y.Doc): Promise<void> {
  const state = Y.encodeStateAsUpdate(doc);
  const last = await db
    .select({ v: schema.yjsSnapshots.version })
    .from(schema.yjsSnapshots)
    .where(eq(schema.yjsSnapshots.mapId, mapId))
    .orderBy(desc(schema.yjsSnapshots.version))
    .limit(1);
  const version = (last[0]?.v ?? 0) + 1;
  await db.insert(schema.yjsSnapshots).values({
    mapId,
    version,
    state: Buffer.from(state),
  });
  await db.update(schema.maps).set({ version }).where(eq(schema.maps.id, mapId));
}
