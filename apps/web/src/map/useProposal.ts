import { useCallback, useRef, useState } from 'react';
import type { Proposal, ProposalOp } from '@mindline/shared';
import { apiStream } from '../lib/api';
import type { MapRepository } from './MapRepository';

interface MetaData {
  proposalId: string;
  batchId: string;
  provider: string;
  model: string;
}

export interface DecomposeReq {
  nodeId: string;
  targetType?: string;
  prompt?: string;
  maxChildren?: number;
}

export interface ProposalController {
  proposal: Proposal | null;
  running: boolean;
  error: string | null;
  decisions: Record<string, boolean>; // tempId → 是否接受
  edits: Record<string, string>; // tempId → 编辑后的标题
  start: (req: DecomposeReq) => void;
  toggle: (tempId: string, accept: boolean) => void;
  edit: (tempId: string, title: string) => void;
  apply: () => string[]; // 写入被接受的 op，返回新建节点 id
  clear: () => void;
}

/** AI 拆解预览本地态（不进 Y.Doc）：SSE 拉取 → 虚影预览 → 确认写入。 */
export function useProposal(repo: MapRepository): ProposalController {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const acRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    acRef.current?.abort();
    acRef.current = null;
    setProposal(null);
    setRunning(false);
    setError(null);
    setDecisions({});
    setEdits({});
  }, []);

  const start = useCallback(
    (req: DecomposeReq) => {
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      setProposal(null);
      setError(null);
      setDecisions({});
      setEdits({});
      setRunning(true);
      const ops: ProposalOp[] = [];
      void apiStream(
        '/ai/decompose',
        { mapId: repo.mapId, ...req },
        (event, data) => {
          if (event === 'meta') {
            const m = data as MetaData;
            setProposal({
              proposalId: m.proposalId,
              capability: 'decompose',
              mapId: repo.mapId,
              anchorNodeId: req.nodeId,
              batchId: m.batchId,
              ops: [],
            });
          } else if (event === 'op') {
            const op = data as ProposalOp;
            ops.push(op);
            setProposal((p) => (p ? { ...p, ops: [...ops] } : p));
            setDecisions((d) => ({ ...d, [op.tempId]: op.valid })); // valid 默认勾选
          } else if (event === 'done') {
            setRunning(false);
          } else if (event === 'error') {
            setError((data as { message?: string }).message ?? '生成失败');
            setRunning(false);
          }
        },
        ac.signal,
      ).catch((e: unknown) => {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : '生成失败');
        setRunning(false);
      });
    },
    [repo],
  );

  const toggle = useCallback((tempId: string, accept: boolean) => {
    setDecisions((d) => ({ ...d, [tempId]: accept }));
  }, []);

  const edit = useCallback((tempId: string, title: string) => {
    setEdits((e) => ({ ...e, [tempId]: title }));
  }, []);

  const apply = useCallback((): string[] => {
    if (!proposal) return [];
    const accepted = new Set(
      Object.entries(decisions)
        .filter(([, v]) => v)
        .map(([k]) => k),
    );
    const ids = repo.applyProposal(proposal, accepted, edits);
    clear();
    return ids;
  }, [proposal, decisions, edits, repo, clear]);

  return { proposal, running, error, decisions, edits, start, toggle, edit, apply, clear };
}
