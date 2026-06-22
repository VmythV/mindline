import type { Proposal } from './domain';

/**
 * 命令契约（Yjs协同详设 §4.1 / §11）。命令层是 Y.Doc 唯一写入口；
 * 前端直接在浏览器执行，服务端（api）经 Hocuspocus provider 连入 collab 后执行同一套命令。
 * 每条命令对应 MapRepository 的一个写方法。
 */
export type Command =
  | { kind: 'ensureRoot' }
  | {
      kind: 'createChild';
      parentId: string;
      title?: string;
      type?: string;
      data?: Record<string, unknown>;
    }
  | { kind: 'rename'; nodeId: string; title: string }
  | { kind: 'setField'; nodeId: string; field: string; value: unknown }
  | { kind: 'setOwner'; nodeId: string; ownerId: string | null }
  | { kind: 'setType'; nodeId: string; newType: string; validFieldKeys: string[] }
  | { kind: 'move'; nodeId: string; newParentId: string }
  | { kind: 'delete'; nodeId: string }
  | {
      kind: 'applyProposal';
      proposal: Proposal;
      /** 接受的 tempId 列表；缺省视为全部接受。 */
      accepted?: string[];
      /** tempId → 改写后的标题。 */
      edits?: Record<string, string>;
    };

export type CommandKind = Command['kind'];

/** POST /maps/:mapId/commands 请求体。 */
export interface ExecuteCommandsRequest {
  commands: Command[];
}

/** 命令执行结果：本次新建的节点 id（create/applyProposal 产生）。 */
export interface ExecuteCommandsResult {
  created: string[];
  /** 落库的变更事件条数。 */
  eventCount: number;
}
