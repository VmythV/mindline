import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { FieldDef } from '@mindline/shared';

const inputCls =
  'w-full mt-1 px-2 py-1 rounded border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300';

function RichText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value || '');
  const draftRef = useRef(value || '');
  const composingRef = useRef(false);
  const updateDraft = (next: string) => {
    draftRef.current = next;
    setDraft(next);
  };
  const editor = useEditor({
    extensions: [StarterKit],
    content: draft,
    onUpdate: ({ editor }) => updateDraft(editor.getHTML()),
    editorProps: {
      handleDOMEvents: {
        compositionstart: () => {
          composingRef.current = true;
          return false;
        },
        compositionend: () => {
          composingRef.current = false;
          return false;
        },
        blur: () => {
          onChange(draftRef.current);
          return false;
        },
      },
    },
  });
  useEffect(() => {
    const next = value || '';
    updateDraft(next);
    if (editor && editor.getHTML() !== next) {
      editor.commands.setContent(next, false);
    }
  }, [editor, value]);
  return (
    <div
      data-map-shortcuts="off"
      className="mt-1 border border-slate-200 rounded p-2 text-sm text-slate-800"
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

/** 按字段类型渲染对应控件（Schema 驱动的动态表单单元）。 */
export function DynamicField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => onChange(draft);
  const commitOnEnter = (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onChange(draft);
      (e.currentTarget as HTMLElement).blur();
    }
  };

  switch (field.type) {
    case 'richtext':
      return <RichText value={(value as string) ?? ''} onChange={onChange} />;
    case 'number':
      return (
        <input
          type="number"
          className={inputCls}
          value={draft === undefined || draft === null ? '' : String(draft)}
          onChange={(e) => setDraft(e.target.value === '' ? null : Number(e.target.value))}
          onBlur={commit}
          onKeyDown={commitOnEnter}
        />
      );
    case 'date':
      return (
        <input
          type="date"
          className={inputCls}
          value={(draft as string) ?? ''}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={commitOnEnter}
        />
      );
    case 'datetime':
      return (
        <input
          type="datetime-local"
          className={inputCls}
          value={(draft as string) ?? ''}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={commitOnEnter}
        />
      );
    case 'checkbox':
      return (
        <input
          type="checkbox"
          className="mt-1"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
        />
      );
    case 'enum':
      return (
        <select
          className={inputCls}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
        >
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case 'multiEnum': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="mt-1 flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => (
            <label key={o} className="text-xs flex items-center gap-1">
              <input
                type="checkbox"
                checked={arr.includes(o)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))
                }
                onKeyDown={(e) => e.stopPropagation()}
                onKeyUp={(e) => e.stopPropagation()}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case 'tags': {
      const draftArr = Array.isArray(draft) ? (draft as string[]) : [];
      return (
        <input
          className={inputCls}
          placeholder="逗号分隔"
          value={draftArr.join(', ')}
          onChange={(e) =>
            setDraft(
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          onBlur={commit}
          onKeyDown={commitOnEnter}
        />
      );
    }
    case 'link':
      return (
        <input
          type="url"
          className={inputCls}
          placeholder="https://"
          value={(draft as string) ?? ''}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={commitOnEnter}
        />
      );
    case 'user':
      return (
        <input
          className={inputCls}
          placeholder="用户 ID（M1 简化）"
          value={(draft as string) ?? ''}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={commitOnEnter}
        />
      );
    case 'text':
    default:
      return (
        <input
          className={inputCls}
          value={(draft as string) ?? ''}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={commitOnEnter}
        />
      );
  }
}
