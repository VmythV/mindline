import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { FieldDef } from '@mindline/shared';

const inputCls =
  'w-full mt-1 px-2 py-1 rounded border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300';

function RichText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
  return (
    <div className="mt-1 border border-slate-200 rounded p-2 text-sm text-slate-800">
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
  switch (field.type) {
    case 'richtext':
      return <RichText value={(value as string) ?? ''} onChange={onChange} />;
    case 'number':
      return (
        <input
          type="number"
          className={inputCls}
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case 'date':
      return (
        <input
          type="date"
          className={inputCls}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'datetime':
      return (
        <input
          type="datetime-local"
          className={inputCls}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'checkbox':
      return (
        <input
          type="checkbox"
          className="mt-1"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'enum':
      return (
        <select
          className={inputCls}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
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
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case 'tags': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <input
          className={inputCls}
          placeholder="逗号分隔"
          value={arr.join(', ')}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      );
    }
    case 'link':
      return (
        <input
          type="url"
          className={inputCls}
          placeholder="https://"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'user':
      return (
        <input
          className={inputCls}
          placeholder="用户 ID（M1 简化）"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'text':
    default:
      return (
        <input
          className={inputCls}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
