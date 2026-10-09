import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, get, onChange, post } from "./api";
import { localDateOf } from "../../shared/dates";
import type { ChangeTopic, MealCategory, Profile, SessionInfo, Settings, SyncedCalendar, Weather } from "../../shared/types";

export type Screen = "home" | "calendar" | "lists" | "tasks" | "rewards" | "meals" | "recipes" | "sidekick" | "settings";

interface Boot {
  settings: Settings;
  session: SessionInfo;
  profiles: Profile[];
  weather: Weather;
  mealCategories: MealCategory[];
  calendars: SyncedCalendar[];
  timezone: string;
}

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface AppState extends Boot {
  ready: boolean;
  now: Date;
  today: string;
  screen: Screen;
  go: (s: Screen) => void;
  isPhone: boolean;
  reload: () => Promise<void>;
  toast: (text: string, action?: Toast["action"]) => void;
  toasts: Toast[];
  /** Run a change that might need the parent PIN; shows errors as toasts. Returns undefined on failure. */
  run: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>;
  /** Ask for the PIN (if Parental Lock is on and this screen is locked). */
  unlock: () => Promise<boolean>;
  pinPrompt: { resolve: (ok: boolean) => void } | null;
  setPinPrompt: (p: { resolve: (ok: boolean) => void } | null) => void;
  celebrate: (kind?: "day" | "reward" | "small", emoji?: string[]) => void;
  celebration: { id: number; kind: string; emoji: string[] } | null;
  sleeping: boolean;
  setSleeping: (s: boolean) => void;
  profileById: (id: number | null | undefined) => Profile | undefined;
  people: Profile[]; // kind === "profile"
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

const SCREENS: Screen[] = ["home", "calendar", "lists", "tasks", "rewards", "meals", "recipes", "sidekick", "settings"];

function screenFromHash(): Screen {
  const h = location.hash.replace("#/", "").replace("#", "") as Screen;
  return SCREENS.includes(h) ? h : "home";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [screen, setScreen] = useState<Screen>(screenFromHash);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pinPrompt, setPinPrompt] = useState<{ resolve: (ok: boolean) => void } | null>(null);
  const [celebration, setCelebration] = useState<AppState["celebration"]>(null);
  const [sleeping, setSleeping] = useState(false);
  const [isPhone, setIsPhone] = useState(() => window.matchMedia("(max-width: 820px)").matches);
  const toastId = useRef(0);

  const reload = useCallback(async () => {
    const b = await get<Boot>("/api/bootstrap");
    setBoot(b);
  }, []);

  useEffect(() => {
    reload().catch(() => setTimeout(reload, 3000));
    const t = setInterval(() => setNow(new Date()), 15000);
    const mq = window.matchMedia("(max-width: 820px)");
    const onMq = () => setIsPhone(mq.matches);
    mq.addEventListener("change", onMq);
    const onHash = () => setScreen(screenFromHash());
    window.addEventListener("hashchange", onHash);
    return () => {
      clearInterval(t);
      mq.removeEventListener("change", onMq);
      window.removeEventListener("hashchange", onHash);
    };
  }, [reload]);

  // Keep bootstrap data fresh when other screens/devices change things.
  useEffect(
    () =>
      onChange((topics) => {
        const relevant: ChangeTopic[] = ["settings", "profiles", "stars", "weather", "meals", "calendars"];
        if (topics === "all" || topics.some((t) => relevant.includes(t))) reload().catch(() => undefined);
      }),
    [reload],
  );

  // Session lock expiry: re-check shortly after the unlock window ends.
  useEffect(() => {
    const until = boot?.session.unlockedUntil;
    if (!until) return;
    const ms = new Date(until).getTime() - Date.now();
    if (ms > 2 ** 31 - 1) return;
    const t = setTimeout(() => reload(), Math.max(1000, ms + 500));
    return () => clearTimeout(t);
  }, [boot?.session.unlockedUntil, reload]);

  const toast = useCallback((text: string, action?: Toast["action"]) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3500);
  }, []);

  const unlock = useCallback(async () => {
    if (!boot?.session.lockEnabled || boot.session.canEdit) return true;
    return new Promise<boolean>((resolve) => setPinPrompt({ resolve }));
  }, [boot?.session]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string) => {
      try {
        const out = await fn();
        if (success) toast(success);
        return out;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 423)) toast(e instanceof Error ? e.message : "Something went wrong");
        return undefined;
      }
    },
    [toast],
  );

  const celebrate = useCallback((kind: "day" | "reward" | "small" = "day", emoji?: string[]) => {
    setCelebration({ id: Date.now(), kind, emoji: emoji ?? [] });
  }, []);

  const go = useCallback((s: Screen) => {
    location.hash = `#/${s}`;
    setScreen(s);
  }, []);

  const value = useMemo<AppState | null>(() => {
    if (!boot) return null;
    const byId = new Map(boot.profiles.map((p) => [p.id, p]));
    return {
      ...boot,
      ready: true,
      now,
      today: localDateOf(now),
      screen,
      go,
      isPhone,
      reload,
      toast,
      toasts,
      run,
      unlock,
      pinPrompt,
      setPinPrompt,
      celebrate,
      celebration,
      sleeping,
      setSleeping,
      profileById: (id) => (id == null ? undefined : byId.get(id)),
      people: boot.profiles.filter((p) => p.kind === "profile"),
    };
  }, [boot, now, screen, go, isPhone, reload, toast, toasts, run, unlock, pinPrompt, celebrate, celebration, sleeping]);

  if (!value) {
    return (
      <div className="empty" style={{ height: "100%" }}>
        <div className="big">🏡</div>
        <div className="serif" style={{ fontSize: 28 }}>
          Loading Haven…
        </div>
      </div>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Fetch JSON and keep it fresh: refetches when any of `topics` change on the server
 * (from this screen, another screen, or a phone).
 */
export function useLive<T>(url: string | null, topics: ChangeTopic[]): { data: T | undefined; reload: () => void; error: string | null } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;
  const seq = useRef(0);
  const load = useCallback(() => {
    const u = urlRef.current;
    if (!u) return;
    const n = ++seq.current;
    get<T>(u)
      .then((d) => {
        if (n === seq.current && urlRef.current === u) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => n === seq.current && setError(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [url, load]);
  const key = topics.join(",");
  useEffect(
    () =>
      onChange((changed) => {
        if (changed === "all" || changed.some((t) => key.split(",").includes(t))) load();
      }),
    [key, load],
  );
  return { data, reload: load, error };
}

export { post };
