/** 节点视图模型（从 Y.Doc 派生的扁平结构）。 */
export interface NodeView {
  id: string;
  parentId: string | null;
  order: string;
  type: string;
  title: string;
  data: Record<string, unknown>;
  /** 软权限：节点是否标记为私有（子节点继承最近祖先的 private 状态）。 */
  private?: boolean;
  /** 计算后的有效私有状态（含继承链）。由视图层派生，不存入 Y.Doc。 */
  effectivePrivate?: boolean;
}
