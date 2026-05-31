import type { NodeTypeDefinition } from './domain';

/**
 * 内置开箱节点类型模板（主文档 附录A / §3.3）。
 * 注册新租户时复制为租户级全局模板（project_id = null），用户可改可扩。
 */
export const BUILTIN_NODE_TYPES: NodeTypeDefinition[] = [
  {
    typeKey: 'idea',
    displayName: '想法',
    icon: '💡',
    color: '#F59E0B',
    fields: [
      { key: 'desc', label: '描述', type: 'richtext', collab: true },
      { key: 'tags', label: '标签', type: 'tags' },
    ],
    aiHints: '通用想法节点；拆解时可发散为更具体的子想法或任务。',
  },
  {
    typeKey: 'task',
    displayName: '任务',
    icon: '✅',
    color: '#3B82F6',
    fields: [
      { key: 'desc', label: '描述', type: 'richtext', collab: true },
      { key: 'priority', label: '优先级', type: 'enum', options: ['高', '中', '低'], default: '中' },
      { key: 'due', label: '截止日期', type: 'date' },
      { key: 'estimate', label: '预估工时', type: 'number', unit: 'h' },
      { key: 'ac', label: '验收标准', type: 'richtext', collab: true },
    ],
    aiHints: '可执行任务节点；拆解时产出更细子任务，尽量填写优先级与验收标准。',
  },
  {
    typeKey: 'objective',
    displayName: '目标',
    icon: '🎯',
    color: '#8B5CF6',
    fields: [
      { key: 'desc', label: '描述', type: 'richtext', collab: true },
      { key: 'period', label: '周期', type: 'enum', options: ['年度', '季度', '月度'] },
      { key: 'alignTo', label: '对齐上级', type: 'link' },
    ],
    aiHints: 'OKR 目标节点；拆解时产出关键结果(keyResult)。',
  },
  {
    typeKey: 'keyResult',
    displayName: '关键结果',
    icon: '📈',
    color: '#10B981',
    fields: [
      { key: 'desc', label: '描述', type: 'richtext', collab: true },
      { key: 'target', label: '目标值', type: 'number' },
      { key: 'current', label: '当前值', type: 'number' },
      { key: 'progress', label: '进度', type: 'number', unit: '%' },
    ],
    aiHints: '可量化的关键结果；尽量给出目标值与度量口径。',
  },
  {
    typeKey: 'knowledge',
    displayName: '知识条目',
    icon: '📚',
    color: '#0EA5E9',
    fields: [
      { key: 'body', label: '正文', type: 'richtext', collab: true },
      { key: 'source', label: '来源', type: 'link' },
      { key: 'tags', label: '标签', type: 'tags' },
    ],
    aiHints: '知识/资料节点；拆解时可整理为分类小节。',
  },
  {
    typeKey: 'requirement',
    displayName: '需求',
    icon: '📋',
    color: '#6366F1',
    fields: [
      { key: 'background', label: '背景', type: 'richtext', collab: true },
      { key: 'ac', label: '验收标准', type: 'richtext', collab: true },
      { key: 'priority', label: '优先级', type: 'enum', options: ['高', '中', '低'], default: '中' },
      {
        key: 'status',
        label: '状态',
        type: 'enum',
        options: ['待评审', '已排期', '开发中', '已上线'],
        default: '待评审',
      },
    ],
    aiHints: '需求节点；拆解时产出任务(task)或子需求。',
  },
  {
    typeKey: 'bug',
    displayName: '缺陷',
    icon: '🐛',
    color: '#EF4444',
    fields: [
      { key: 'steps', label: '复现步骤', type: 'richtext', collab: true },
      {
        key: 'severity',
        label: '严重级',
        type: 'enum',
        options: ['致命', '严重', '一般', '轻微'],
        default: '一般',
      },
      {
        key: 'status',
        label: '状态',
        type: 'enum',
        options: ['待处理', '处理中', '已修复', '已关闭'],
        default: '待处理',
      },
      { key: 'assignee', label: '负责人', type: 'user' },
    ],
    aiHints: '缺陷节点；记录复现步骤与严重级。',
  },
];
