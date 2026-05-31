import { useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { MapRepository } from './MapRepository';
import type { NodeView } from './types';

function ToolbarBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="px-2 py-0.5 text-xs rounded bg-slate-100 hover:bg-slate-200"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** 节点详情侧栏：标题 + 轻富文本正文（Tiptap）。正文存 node.desc，经 setField 同步。 */
export function NodeInspector({ repo, node }: { repo: MapRepository; node: NodeView }) {
  const [title, setTitle] = useState(node.title);
  const editor = useEditor({
    extensions: [StarterKit],
    content: node.desc ?? '',
    onUpdate: ({ editor }) => repo.setField(node.id, 'desc', editor.getHTML()),
  });

  return (
    <aside className="w-80 shrink-0 border-l border-slate-200 bg-white p-4 space-y-4 overflow-auto">
      <div>
        <label className="text-xs text-slate-400">标题</label>
        <input
          className="w-full mt-1 px-2 py-1 rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => repo.rename(node.id, title.trim() || '未命名')}
        />
      </div>

      <div className="text-xs text-slate-400">
        类型：<span className="text-slate-600">{node.type}</span>
      </div>

      <div>
        <label className="text-xs text-slate-400">正文</label>
        <div className="mt-1 flex gap-1">
          <ToolbarBtn label="B" onClick={() => editor?.chain().focus().toggleBold().run()} />
          <ToolbarBtn label="I" onClick={() => editor?.chain().focus().toggleItalic().run()} />
          <ToolbarBtn label="•" onClick={() => editor?.chain().focus().toggleBulletList().run()} />
          <ToolbarBtn label="1." onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
          <ToolbarBtn label="{}" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} />
        </div>
        <div className="mt-1 border border-slate-200 rounded p-2 text-sm text-slate-800">
          <EditorContent editor={editor} />
        </div>
      </div>
    </aside>
  );
}
