import { ulid } from 'ulid';

/**
 * ID 前缀规范 —— 见 API契约总览 §1.6。
 * 主键值形如 `<前缀><ULID>`，由应用层生成（K-sortable，便于按创建序排序）。
 */
export const ID_PREFIX = {
  tenant: 'tn_',
  user: 'u_',
  workspace: 'ws_',
  project: 'p_',
  map: 'm_',
  node: 'n_',
  nodeType: 'nt_',
  changeEvent: 'c_',
  batch: 'b_',
  milestone: 'ms_',
  imChannel: 'ch_',
  aiProposal: 'prop_',
  migration: 'mig_',
  job: 'job_',
} as const;

export type IdEntity = keyof typeof ID_PREFIX;
export type IdPrefix = (typeof ID_PREFIX)[IdEntity];

/**
 * 生成带前缀的 K-sortable ID（决策 D3：ULID + 前缀，应用层生成，不做 DB 兜底）。
 * @example newId('node') // => 'n_01HX...'
 */
export function newId(entity: IdEntity): string {
  return ID_PREFIX[entity] + ulid();
}
