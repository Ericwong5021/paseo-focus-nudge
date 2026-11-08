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

interface ToastNode {
  textContent: string | null;
  style: { cssText: string };
  type?: string;
  appendChild(node: ToastNode): void;
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, listener: () => void): void;
  animate?: (frames: object[], options: object) => unknown;
  remove(): void;
}

let removeToast: (() => void) | undefined;

export function showDocumentToast(
  title: string,
  options: {
    message: string;
    durationMs: number;
    placement: "top" | "bottom-end";
    onPress(): void;
  },
): void {
  if (Platform.OS !== "web") return;
  const browser = globalThis as unknown as {
    document: {
      createElement(name: string): ToastNode;
      body: { appendChild(node: ToastNode): void };
    };
    matchMedia?: (query: string) => { matches: boolean };
  };
  removeToast?.();
  const frame = browser.document.createElement("div");
  const top = options.placement === "top";
  frame.style.cssText = `position:fixed;${top ? "top:max(16px,env(safe-area-inset-top));left:16px;right:16px" : "bottom:24px;right:24px;left:auto"};z-index:2147483647;pointer-events:none;max-width:calc(100vw - 32px)`;
  frame.setAttribute("role", "status");
  frame.setAttribute("aria-live", "polite");
  const card = browser.document.createElement("button");
  card.type = "button";
  card.setAttribute("aria-label", `${title}，${options.message}，打开对话`);
  card.style.cssText =
    "display:block;text-align:left;pointer-events:auto;width:360px;max-width:100%;padding:14px 18px;border:0;border-radius:14px;background:Canvas;color:CanvasText;color-scheme:light dark;box-shadow:0 6px 28px #0003;font:14px/1.45 system-ui;cursor:pointer;overflow:hidden";
  const heading = browser.document.createElement("div");
  heading.textContent = title;
  heading.style.cssText =
    "font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px";
  const body = browser.document.createElement("div");
  body.textContent = options.message;
  body.style.cssText =
    "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap";
  card.appendChild(heading);
  card.appendChild(body);
  frame.appendChild(card);
  let timer: ReturnType<typeof setTimeout>;
  const remove = () => {
    clearTimeout(timer);
    frame.remove();
    if (removeToast === remove) removeToast = undefined;
  };
  card.addEventListener("click", () => {
    remove();
    options.onPress();
  });
  browser.document.body.appendChild(frame);
  if (!browser.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    card.animate?.(
      [
        { opacity: 0, transform: `translateY(${top ? "-12px" : "12px"})` },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  }
  timer = setTimeout(remove, options.durationMs);
  removeToast = remove;
}
