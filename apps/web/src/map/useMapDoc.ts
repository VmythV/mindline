import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { useAuth } from '../stores/auth';
import { api } from '../lib/api';
import { MapRepository, type EmitEvent } from './MapRepository';
import { ChangeQueue, type QueuedEvent } from './changeQueue';
import type { NodeView } from './types';

const COLLAB_URL = (import.meta.env.VITE_COLLAB_URL as string | undefined) ?? 'ws://localhost:3002';

interface MapDocState {
  repo: MapRepository | null;
  nodes: NodeView[];
  synced: boolean;
  provider: HocuspocusProvider | null;
}

/** 连接协同文档：建立 Hocuspocus provider + Y.Doc，派生节点列表，提供命令层与 provider（awareness）。 */
export function useMapDoc(mapId: string | undefined): MapDocState {
  const token = useAuth((s) => s.accessToken);
  const [nodes, setNodes] = useState<NodeView[]>([]);
  const [synced, setSynced] = useState(false);
  const repoRef = useRef<MapRepository | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);

  useEffect(() => {
    if (!mapId || !token) return;
    setSynced(false);
    setNodes([]);

    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({ url: COLLAB_URL, name: mapId, token, document: doc });
    providerRef.current = provider;

    // D1：持久重试队列承接落库（带稳定 eventId，服务端幂等去重）；不再即发即弃。
    const queue = new ChangeQueue(mapId, (events: QueuedEvent[]) =>
      api(`/maps/${mapId}/changes`, { method: 'POST', body: JSON.stringify({ events }) }),
    );
    const onChanges = (events: EmitEvent[]) => queue.enqueue(events);

    const repo = new MapRepository(mapId, doc, onChanges);
    repoRef.current = repo;

    const update = () => setNodes(repo.list());
    const nodesMap = doc.getMap('nodes');
    nodesMap.observeDeep(update);

    provider.on('synced', () => {
      repo.ensureRoot();
      setSynced(true);
      update();
      void queue.flush(); // 同步完成 → 冲刷上次残留（刷新/关页重开场景）
    });
    // 断线重连恢复连接时补发积压事件
    const onStatus = (e: { status: string }) => {
      if (e.status === 'connected') void queue.flush();
    };
    provider.on('status', onStatus);

    return () => {
      provider.off('status', onStatus);
      queue.dispose();
      nodesMap.unobserveDeep(update);
      provider.destroy();
      doc.destroy();
      repoRef.current = null;
      providerRef.current = null;
    };
  }, [mapId, token]);

  return { repo: repoRef.current, nodes, synced, provider: providerRef.current };
}
