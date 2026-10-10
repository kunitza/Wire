import type { ChangeTopic } from "../../shared/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type LockHandler = () => Promise<boolean>;
let lockHandler: LockHandler | null = null;
/** Called when the server says "locked" (423); should ask for the PIN and resolve true if unlocked. */
export function setLockHandler(fn: LockHandler) {
  lockHandler = fn;
}

export async function api<T = unknown>(method: string, url: string, body?: unknown, retried = false): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 423 && !retried && lockHandler) {
    if (await lockHandler()) return api<T>(method, url, body, true);
    throw new ApiError(423, "Locked");
  }
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const get = <T>(url: string) => api<T>("GET", url);
export const post = <T>(url: string, body?: unknown) => api<T>("POST", url, body ?? {});
export const put = <T>(url: string, body?: unknown) => api<T>("PUT", url, body ?? {});
export const del = <T>(url: string) => api<T>("DELETE", url);

// ---- Live updates (server-sent events) ----
type Listener = (topics: ChangeTopic[] | "all") => void;
const listeners = new Set<Listener>();
let source: EventSource | null = null;

function connect() {
  if (source) return;
  source = new EventSource("/api/stream");
  let opened = false;
  source.onopen = () => {
    // After a reconnect, refresh everything in case we missed changes.
    if (opened) listeners.forEach((l) => l("all"));
    opened = true;
  };
  source.onmessage = (e) => {
    try {
      const topics = JSON.parse(e.data) as ChangeTopic[];
      listeners.forEach((l) => l(topics));
    } catch {
      /* ignore */
    }
  };
}

export function onChange(fn: Listener): () => void {
  connect();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Read a picked file as base64 (images are downscaled to keep AI requests small). */
export async function fileToAttachment(file: File): Promise<{ mediaType: string; base64: string; name: string }> {
  if (file.type.startsWith("image/") && file.type !== "image/gif") {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { mediaType: "image/jpeg", base64: dataUrl.split(",")[1], name: file.name };
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { mediaType: file.type || "application/octet-stream", base64: btoa(bin), name: file.name };
}
