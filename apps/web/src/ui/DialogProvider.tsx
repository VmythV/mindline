import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

type DialogTone = 'info' | 'warning' | 'danger';
type DialogKind = 'alert' | 'confirm' | 'prompt';

interface DialogRequest {
  kind: DialogKind;
  tone: DialogTone;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  defaultValue?: string;
  placeholder?: string;
  resolve: (value: boolean | string | null) => void;
}

interface DialogOptions {
  tone?: DialogTone;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
}

interface PromptOptions extends DialogOptions {
  defaultValue?: string;
  placeholder?: string;
}

interface DialogApi {
  alert: (options: DialogOptions) => Promise<void>;
  confirm: (options: DialogOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

const toneCls: Record<DialogTone, { badge: string; confirm: string }> = {
  info: {
    badge: 'bg-blue-50 text-blue-700 border-blue-100',
    confirm: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  warning: {
    badge: 'bg-amber-50 text-amber-700 border-amber-100',
    confirm: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  danger: {
    badge: 'bg-red-50 text-red-700 border-red-100',
    confirm: 'bg-red-600 hover:bg-red-700 text-white',
  },
};

const toneLabel: Record<DialogTone, string> = {
  info: '信息',
  warning: '注意',
  danger: '危险',
};

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const open = useCallback(
    (request: Omit<DialogRequest, 'resolve'>) =>
      new Promise<boolean | string | null>((resolve) => {
        setPromptValue(request.defaultValue ?? '');
        setDialog({ ...request, resolve });
      }),
    [],
  );

  const close = useCallback(
    (value: boolean | string | null) => {
      dialog?.resolve(value);
      setDialog(null);
    },
    [dialog],
  );

  const api = useMemo<DialogApi>(
    () => ({
      alert: async (options) => {
        await open({
          kind: 'alert',
          tone: options.tone ?? 'info',
          title: options.title,
          message: options.message,
          confirmText: options.confirmText ?? '知道了',
        });
      },
      confirm: async (options) =>
        (await open({
          kind: 'confirm',
          tone: options.tone ?? 'warning',
          title: options.title,
          message: options.message,
          confirmText: options.confirmText ?? '确认',
          cancelText: options.cancelText ?? '取消',
        })) === true,
      prompt: async (options) => {
        const value = await open({
          kind: 'prompt',
          tone: options.tone ?? 'info',
          title: options.title,
          message: options.message,
          confirmText: options.confirmText ?? '确认',
          cancelText: options.cancelText ?? '取消',
          defaultValue: options.defaultValue,
          placeholder: options.placeholder,
        });
        return typeof value === 'string' ? value : null;
      },
    }),
    [open],
  );

  useEffect(() => {
    if (dialog?.kind === 'prompt') {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(dialog.kind === 'alert' ? true : null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, dialog]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!dialog) return;
    close(dialog.kind === 'prompt' ? promptValue : true);
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog && (
        <div
          data-map-shortcuts="off"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 px-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close(dialog.kind === 'alert' ? true : null);
          }}
        >
          <form
            className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            onSubmit={submit}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span
                className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${toneCls[dialog.tone].badge}`}
              >
                {toneLabel[dialog.tone]}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="app-dialog-title" className="text-sm font-semibold text-slate-800">
                  {dialog.title}
                </h2>
                {dialog.message && (
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-500">
                    {dialog.message}
                  </p>
                )}
              </div>
            </div>

            {dialog.kind === 'prompt' && (
              <input
                ref={inputRef}
                className="mt-4 w-full rounded border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={promptValue}
                placeholder={dialog.placeholder}
                onChange={(e) => setPromptValue(e.target.value)}
              />
            )}

            <div className="mt-5 flex justify-end gap-2">
              {dialog.kind !== 'alert' && (
                <button
                  type="button"
                  className="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                  onClick={() => close(null)}
                >
                  {dialog.cancelText ?? '取消'}
                </button>
              )}
              <button
                type="submit"
                className={`rounded px-3 py-1.5 text-sm font-medium ${toneCls[dialog.tone].confirm}`}
              >
                {dialog.confirmText ?? '确认'}
              </button>
            </div>
          </form>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}
