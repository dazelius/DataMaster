import { useToastStore } from '../stores/toastStore';

const ICONS: Record<string, string> = {
  wiki: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  check: 'M4.5 12.75l6 6 9-13.5',
  error: 'M6 18L18 6M6 6l12 12',
};

const TYPE_STYLES: Record<string, string> = {
  success: 'border-green-500/30 bg-green-500/10',
  error: 'border-red-500/30 bg-red-500/10',
  info: 'border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10',
};

const ICON_COLORS: Record<string, string> = {
  success: 'text-green-400',
  error: 'text-red-400',
  info: 'text-[var(--color-accent)]',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const iconPath = toast.icon ? ICONS[toast.icon] : ICONS.check;
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md animate-in slide-in-from-right duration-300 ${TYPE_STYLES[toast.type] ?? TYPE_STYLES.info}`}
          >
            {iconPath && (
              <svg className={`w-4 h-4 flex-shrink-0 ${ICON_COLORS[toast.type] ?? ICON_COLORS.info}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
              </svg>
            )}
            <span className="text-sm text-[var(--color-text-primary)] flex-1">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
