import { describe, expect, it } from 'vitest';
import type { NodeTypeDefinition, ProposalModelMeta } from '@mindline/shared';
import type { RawNode } from './gateway';
import { buildProposal } from './validate';

type Params = Parameters<typeof buildProposal>[0];

const modelMeta: ProposalModelMeta = {
  provider: 'stub',
  model: 'stub',
  tokens: { in: 0, out: 0 },
};

/** 构造 buildProposal 入参，仅覆盖关心的字段，其余给安全默认。 */
function makeParams(over: Partial<Params> & { rawNodes: RawNode[] }): Params {
  return {
    schema: null,
    targetType: 'task',
    anchorNodeId: 'n_anchor',
    mapId: 'm_test',
    proposalId: 'prop_test',
    batchId: 'b_test',
    maxChildren: 20,
    existingChildTitles: [],
    modelMeta,
    ...over,
  };
}

const schema = (fields: NodeTypeDefinition['fields']): NodeTypeDefinition => ({
  typeKey: 'task',
  displayName: '任务',
  fields,
});

describe('buildProposal · 基础结构', () => {
  it('每个 raw 节点产出一条 addChild op，挂到 anchor', () => {
    const p = makeParams({ rawNodes: [{ title: 'A' }, { title: 'B' }] });
    const proposal = buildProposal(p);
    expect(proposal.ops).toHaveLength(2);
    expect(proposal.ops.every((o) => o.op === 'addChild')).toBe(true);
    expect(proposal.ops.every((o) => o.parentRef === 'n_anchor')).toBe(true);
    expect(proposal.ops.map((o) => o.tempId)).toEqual(['t1', 't2']);
    expect(proposal.capability).toBe('decompose');
    expect(proposal.anchorNodeId).toBe('n_anchor');
  });

  it('节点 type 取 targetType', () => {
    const p = makeParams({ rawNodes: [{ title: 'A' }], targetType: 'objective' });
    expect(buildProposal(p).ops[0]!.node!.type).toBe('objective');
  });
});

describe('buildProposal · 标题归整', () => {
  it('trim 前后空白', () => {
    const p = makeParams({ rawNodes: [{ title: '  hi  ' }] });
    expect(buildProposal(p).ops[0]!.node!.title).toBe('hi');
  });

  it('截断到 60 字符', () => {
    const long = 'x'.repeat(80);
    const p = makeParams({ rawNodes: [{ title: long }] });
    expect(buildProposal(p).ops[0]!.node!.title).toHaveLength(60);
  });

  it('空标题兜底为「子节点 N」（按位置编号）', () => {
    const p = makeParams({ rawNodes: [{ title: '   ' }, { title: '' }] });
    const ops = buildProposal(p).ops;
    expect(ops[0]!.node!.title).toBe('子节点 1');
    expect(ops[1]!.node!.title).toBe('子节点 2');
  });
});

describe('buildProposal · maxChildren 截断', () => {
  it('超出 maxChildren 的节点被丢弃', () => {
    const raw = Array.from({ length: 25 }, (_, i) => ({ title: `n${i}` }));
    const p = makeParams({ rawNodes: raw, maxChildren: 20 });
    expect(buildProposal(p).ops).toHaveLength(20);
  });

  it('不足 maxChildren 时全保留', () => {
    const p = makeParams({ rawNodes: [{ title: 'a' }, { title: 'b' }], maxChildren: 20 });
    expect(buildProposal(p).ops).toHaveLength(2);
  });
});

describe('buildProposal · Schema 校验', () => {
  it('必填缺失且有 default → 填充 default，不报 issue', () => {
    const p = makeParams({
      rawNodes: [{ title: 'A', data: {} }],
      schema: schema([{ key: 'status', label: '状态', type: 'text', required: true, default: 'todo' }]),
    });
    const op = buildProposal(p).ops[0]!;
    expect(op.node!.data!.status).toBe('todo');
    expect(op.issues).toHaveLength(0);
    expect(op.valid).toBe(true);
  });

  it('必填缺失且无 default → 标 issue，valid=false', () => {
    const p = makeParams({
      rawNodes: [{ title: 'A', data: {} }],
      schema: schema([{ key: 'owner', label: '负责人', type: 'user', required: true }]),
    });
    const op = buildProposal(p).ops[0]!;
    expect(op.valid).toBe(false);
    expect(op.issues.some((m) => m.includes('负责人'))).toBe(true);
  });

  it('非必填缺失 → 不报 issue', () => {
    const p = makeParams({
      rawNodes: [{ title: 'A', data: {} }],
      schema: schema([{ key: 'note', label: '备注', type: 'text' }]),
    });
    expect(buildProposal(p).ops[0]!.valid).toBe(true);
  });

  it('enum 取值越界 → 标 issue', () => {
    const p = makeParams({
      rawNodes: [{ title: 'A', data: { priority: 'urgent' } }],
      schema: schema([{ key: 'priority', label: '优先级', type: 'enum', options: ['low', 'high'] }]),
    });
    const op = buildProposal(p).ops[0]!;
    expect(op.valid).toBe(false);
    expect(op.issues.some((m) => m.includes('优先级'))).toBe(true);
  });

  it('enum 取值合法 → 通过', () => {
    const p = makeParams({
      rawNodes: [{ title: 'A', data: { priority: 'high' } }],
      schema: schema([{ key: 'priority', label: '优先级', type: 'enum', options: ['low', 'high'] }]),
    });
    expect(buildProposal(p).ops[0]!.valid).toBe(true);
  });

  it('multiEnum 含非法选项 → 标 issue 并列出非法项', () => {
    const p = makeParams({
      rawNodes: [{ title: 'A', data: { tags: ['a', 'x', 'y'] } }],
      schema: schema([{ key: 'tags', label: '标签', type: 'multiEnum', options: ['a', 'b'] }]),
    });
    const op = buildProposal(p).ops[0]!;
    expect(op.valid).toBe(false);
    const msg = op.issues.find((m) => m.includes('标签'))!;
    expect(msg).toContain('x');
    expect(msg).toContain('y');
  });

  it('multiEnum 全合法 → 通过', () => {
    const p = makeParams({
      rawNodes: [{ title: 'A', data: { tags: ['a', 'b'] } }],
      schema: schema([{ key: 'tags', label: '标签', type: 'multiEnum', options: ['a', 'b'] }]),
    });
    expect(buildProposal(p).ops[0]!.valid).toBe(true);
  });
});

describe('buildProposal · 标题查重', () => {
  it('与已有子节点标题重复 → 标 issue', () => {
    const p = makeParams({
      rawNodes: [{ title: '设计' }, { title: '开发' }],
      existingChildTitles: ['设计'],
    });
    const ops = buildProposal(p).ops;
    expect(ops[0]!.valid).toBe(false);
    expect(ops[0]!.issues.some((m) => m.includes('重复'))).toBe(true);
    expect(ops[1]!.valid).toBe(true);
  });

  it('existingChildTitles 含空白项不误伤', () => {
    const p = makeParams({
      rawNodes: [{ title: '开发' }],
      existingChildTitles: ['  ', ''],
    });
    expect(buildProposal(p).ops[0]!.valid).toBe(true);
  });
});

describe('buildProposal · 多 issue 累加', () => {
  it('一节点同时触发必填缺失 + enum 越界 → issues 累加且 valid=false', () => {
    const p = makeParams({
      rawNodes: [{ title: 'A', data: { priority: 'urgent' } }],
      schema: schema([
        { key: 'owner', label: '负责人', type: 'user', required: true },
        { key: 'priority', label: '优先级', type: 'enum', options: ['low', 'high'] },
      ]),
    });
    const op = buildProposal(p).ops[0]!;
    expect(op.valid).toBe(false);
    expect(op.issues.length).toBeGreaterThanOrEqual(2);
  });
});
