export interface ContextMenuItem {
  label: string;
  run: () => void;
  danger?: boolean;
}

/** 节点右键上下文菜单。 */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <ul
        className="fixed z-50 min-w-[140px] bg-white rounded-lg shadow-lg border border-slate-200 text-sm py-1"
        style={{ left: x, top: y }}
      >
        {items.map((it, i) => (
          <li
            key={i}
            className={`px-3 py-1.5 cursor-pointer hover:bg-slate-100 ${
              it.danger ? 'text-red-500' : 'text-slate-700'
            }`}
            onClick={() => {
              it.run();
              onClose();
            }}
          >
            {it.label}
          </li>
        ))}
      </ul>
    </>
  );
}
