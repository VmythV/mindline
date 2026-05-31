/** 节点视图模型（从 Y.Doc 派生的扁平结构）。 */
export interface NodeView {
  id: string;
  parentId: string | null;
  order: string;
  type: string;
  title: string;
}
