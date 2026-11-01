import { createPortal } from 'react-dom';
import { useUI } from '../state/ui';
import { Button } from './ui';

export function Toasts() {
  const { toasts, dismissToast } = useUI();
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.message}</span>
          {t.actionLabel && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                t.onAction?.();
                dismissToast(t.id);
              }}
            >
              {t.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function ConfirmDialog() {
  const { confirmState } = useUI();
  if (!confirmState) return null;
  return createPortal(
    <div className="sheet-root sheet-root--center">
      <div className="sheet-backdrop" onClick={() => confirmState.resolve(false)} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={confirmState.title}>
        <h2 className="dialog__title">{confirmState.title}</h2>
        {confirmState.body && <p className="dialog__body">{confirmState.body}</p>}
        <div className="dialog__actions">
          <Button variant="ghost" onClick={() => confirmState.resolve(false)} autoFocus>
            Cancel
          </Button>
          <Button variant={confirmState.danger ? 'danger' : 'primary'} onClick={() => confirmState.resolve(true)}>
            {confirmState.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
