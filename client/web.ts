import { Platform } from "react-native";

declare const document: {
  hidden?: boolean;
  visibilityState?: string;
  hasFocus?: () => boolean;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

declare const window: {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

export function isDocumentHidden(): boolean {
  if (Platform.OS !== "web") return false;
  if (typeof document.hasFocus === "function" && !document.hasFocus()) return true;
  if (typeof document.hidden === "boolean") return document.hidden;
  return document.visibilityState === "hidden";
}

export function subscribeDocumentVisibility(onChange: () => void): () => void {
  if (Platform.OS !== "web") return () => {};
  const notify = () => onChange();
  document.addEventListener("visibilitychange", notify);
  window.addEventListener("blur", notify);
  window.addEventListener("focus", notify);
  return () => {
    document.removeEventListener("visibilitychange", notify);
    window.removeEventListener("blur", notify);
    window.removeEventListener("focus", notify);
  };
}

let removeToast: (() => void) | undefined;

export function showDocumentToast(message: string): void {
  if (Platform.OS !== "web") return;
  const dom = (
    globalThis as unknown as {
      document: {
        createElement(name: string): {
          textContent: string;
          style: { cssText: string };
          setAttribute(name: string, value: string): void;
          remove(): void;
        };
        body: { appendChild(node: unknown): void };
      };
    }
  ).document;
  removeToast?.();
  const toast = dom.createElement("div");
  toast.textContent = message;
  toast.setAttribute("role", "alert");
  toast.style.cssText =
    "position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 32px);width:max-content;box-sizing:border-box;padding:14px 18px;border-radius:12px;background:Canvas;color:CanvasText;border:1px solid GrayText;box-shadow:0 8px 28px #0003;font:14px/1.5 system-ui;white-space:pre-wrap;pointer-events:none";
  dom.body.appendChild(toast);
  const timer = setTimeout(() => toast.remove(), 5000);
  removeToast = () => {
    clearTimeout(timer);
    toast.remove();
  };
}
