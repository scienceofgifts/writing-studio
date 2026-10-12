/**
 * Science of Gifts - Toast Notification Service (Phase 10)
 * Provides centralized, non-intrusive notification dispatching for editorial workflows.
 */

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number; // ms, default 3500
}

type ToastListener = (toasts: ToastMessage[]) => void;

class ToastManager {
  private toasts: ToastMessage[] = [];
  private listeners: Set<ToastListener> = new Set();

  public subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener([...this.toasts]));
  }

  public show(message: Omit<ToastMessage, 'id'>): string {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const toast: ToastMessage = { ...message, id };
    
    // Limit active toasts to 4
    this.toasts = [...this.toasts.slice(-3), toast];
    this.notify();

    const duration = message.duration ?? (message.type === 'error' ? 5000 : 3500);
    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  public success(title: string, description?: string, duration?: number): string {
    return this.show({ type: 'success', title, description, duration });
  }

  public error(title: string, description?: string, duration?: number): string {
    return this.show({ type: 'error', title, description, duration });
  }

  public info(title: string, description?: string, duration?: number): string {
    return this.show({ type: 'info', title, description, duration });
  }

  public warning(title: string, description?: string, duration?: number): string {
    return this.show({ type: 'warning', title, description, duration });
  }

  public dismiss(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }
}

export const toast = new ToastManager();
export const toastService = toast;
