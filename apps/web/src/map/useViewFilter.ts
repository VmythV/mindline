import { useState } from 'react';
import type { NodeView } from './types';

export interface ViewFilter {
  ownerIds: string[]; // 为空表示不过滤
  types: string[];
  onlyMe: boolean; // 快捷：只看我的
}

const EMPTY: ViewFilter = { ownerIds: [], types: [], onlyMe: false };

export function useViewFilter(myUserId: string) {
  const [filter, setFilter] = useState<ViewFilter>(EMPTY);

  const isActive = filter.onlyMe || filter.ownerIds.length > 0 || filter.types.length > 0;

  function reset() {
    setFilter(EMPTY);
  }

  function toggleOnlyMe() {
    setFilter((f) => ({ ...EMPTY, onlyMe: !f.onlyMe }));
  }

  function setOwnerIds(ids: string[]) {
    setFilter((f) => ({ ...f, ownerIds: ids, onlyMe: false }));
  }

  function setTypes(types: string[]) {
    setFilter((f) => ({ ...f, types }));
  }

  /**
   * 计算每个节点的显示状态。
   *   'normal'  — 正常显示
   *   'path'    — 祖先路径节点（半透明，保留层级骨架）
   *   'hidden'  — 整条分支无命中，折叠
   */
  function applyFilter(nodes: NodeView[]): Map<string, 'normal' | 'path' | 'hidden'> {
    const result = new Map<string, 'normal' | 'path' | 'hidden'>();
    if (!isActive) {
      nodes.forEach((n) => result.set(n.id, 'normal'));
      return result;
    }

    const effectiveOwners = filter.onlyMe ? [myUserId] : filter.ownerIds;

    function matches(node: NodeView): boolean {
      const owner = node.data.ownerId as string | undefined;
      if (effectiveOwners.length > 0 && (!owner || !effectiveOwners.includes(owner))) return false;
      if (filter.types.length > 0 && !filter.types.includes(node.type)) return false;
      return true;
    }

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // 第一遍：标记所有命中节点
    const matched = new Set<string>();
    nodes.forEach((n) => {
      if (matches(n)) matched.add(n.id);
    });

    // 第二遍：对命中节点的所有祖先标记 path
    const pathNodes = new Set<string>();
    matched.forEach((id) => {
      let cur = nodeMap.get(id);
      while (cur?.parentId) {
        const pid = cur.parentId;
        if (!matched.has(pid)) pathNodes.add(pid);
        cur = nodeMap.get(pid);
      }
    });

    nodes.forEach((n) => {
      if (matched.has(n.id)) result.set(n.id, 'normal');
      else if (pathNodes.has(n.id)) result.set(n.id, 'path');
      else result.set(n.id, 'hidden');
    });

    return result;
  }

  return { filter, isActive, reset, toggleOnlyMe, setOwnerIds, setTypes, applyFilter };
}
