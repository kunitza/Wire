import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowBigUp, CornerDownLeft, Delete, ChevronDown } from "lucide-react";
import "./keyboard.css";

// Big on-screen keyboard for the wall display (touchscreen, no physical keyboard).
// Shown only in kiosk mode (?kiosk=1) or with ?keyboard=1. It types into whichever text field
// has focus, so every form in the app works without changes.

type Field = HTMLInputElement | HTMLTextAreaElement;

const TEXT_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number", ""]);

function isTextField(el: Element | null): el is Field {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return TEXT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  return false;
}

/** Set a React-controlled field's value so React sees the change. */
function setValue(el: Field, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function caret(el: Field): [number, number] {
  try {
    if (el.selectionStart !== null && el.selectionEnd !== null) return [el.selectionStart, el.selectionEnd];
  } catch {
    /* number/email inputs have no selection API */
  }
  return [el.value.length, el.value.length];
}

function placeCaret(el: Field, pos: number) {
  try {
    el.setSelectionRange(pos, pos);
  } catch {
    /* unsupported input type */
  }
}

function insert(el: Field, text: string) {
  const [s, e] = caret(el);
  const max = el.maxLength > 0 ? el.maxLength : Infinity;
  const next = (el.value.slice(0, s) + text + el.value.slice(e)).slice(0, max);
  setValue(el, next);
  placeCaret(el, Math.min(s + text.length, next.length));
}

function backspace(el: Field) {
  const [s, e] = caret(el);
  if (s !== e) {
    setValue(el, el.value.slice(0, s) + el.value.slice(e));
    placeCaret(el, s);
  } else if (s > 0) {
    // Remove a whole emoji / surrogate pair, not half of it.
    const before = Array.from(el.value.slice(0, s));
    before.pop();
    const head = before.join("");
    setValue(el, head + el.value.slice(s));
    placeCaret(el, head.length);
  }
}

function enter(el: Field) {
  if (el instanceof HTMLTextAreaElement) return insert(el, "\n");
  const ev = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  // Untrusted key events don't submit forms, so do it ourselves unless a handler took care of Enter.
  if (!ev.defaultPrevented && el.form) el.form.requestSubmit();
}

const LETTERS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const SYMBOLS = ["1234567890", "-/:;()$&@\"", ".,?!'#%*+"];

export function useKioskKeyboard(): boolean {
  const [on] = useState(() => {
    const q = new URLSearchParams(location.search);
    return q.has("kiosk") || q.has("keyboard");
  });
  return on;
}

export function OnScreenKeyboard() {
  const [target, setTarget] = useState<Field | null>(null);
  const [shift, setShift] = useState<"off" | "once" | "lock">("once");
  const [symbols, setSymbols] = useState(false);
  const lastShiftTap = useRef(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const el = e.target as Element;
      if (isTextField(el)) {
        setTarget(el);
        // Capitalise the first letter of an empty field, like a phone keyboard.
        setShift(el.value ? "off" : "once");
        setSymbols(el instanceof HTMLInputElement && (el.type === "number" || el.inputMode === "numeric"));
      }
    };
    const onBlur = () => {
      // Wait a tick: focus may be moving to another field.
      setTimeout(() => {
        if (!isTextField(document.activeElement)) setTarget(null);
      }, 50);
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
    };
  }, []);

  // Make room so the focused field isn't hidden behind the keyboard.
  useEffect(() => {
    const root = document.documentElement;
    if (!target) {
      root.style.setProperty("--kb-h", "0px");
      root.classList.remove("kb-open");
      return;
    }
    const h = ref.current?.offsetHeight ?? 0;
    root.style.setProperty("--kb-h", `${h}px`);
    root.classList.add("kb-open");
    requestAnimationFrame(() => target.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [target]);

  if (!target) return null;
  const upper = shift !== "off" && !symbols;
  const press = (fn: () => void) => (e: React.PointerEvent) => {
    e.preventDefault(); // keep focus in the field
    if (!document.contains(target)) return setTarget(null);
    fn();
  };
  const typeChar = (c: string) =>
    press(() => {
      insert(target, upper ? c.toUpperCase() : c);
      if (shift === "once") setShift("off");
    });

  const rows = symbols ? SYMBOLS : LETTERS;
  return createPortal(
    <div className="kb" ref={ref} role="group" aria-label="On-screen keyboard" onPointerDown={(e) => e.preventDefault()}>
      {rows.map((row, i) => (
        <div className="kb-row" key={i} style={{ paddingInline: !symbols && i === 1 ? "3.5%" : undefined }}>
          {i === 2 && !symbols && (
            <button
              type="button"
              className={`kb-key kb-wide ${shift !== "off" ? "on" : ""} ${shift === "lock" ? "lock" : ""}`}
              aria-label="Shift"
              onPointerDown={press(() => {
                const now = Date.now();
                if (now - lastShiftTap.current < 350) setShift("lock");
                else setShift(shift === "off" ? "once" : "off");
                lastShiftTap.current = now;
              })}
            >
              <ArrowBigUp />
            </button>
          )}
          {row.split("").map((c) => (
            <button type="button" key={c} className="kb-key" onPointerDown={typeChar(c)}>
              {upper ? c.toUpperCase() : c}
            </button>
          ))}
          {i === 2 && (
            <button type="button" className="kb-key kb-wide" aria-label="Backspace" onPointerDown={press(() => backspace(target))}>
              <Delete />
            </button>
          )}
        </div>
      ))}
      <div className="kb-row">
        <button type="button" className="kb-key kb-wide" onPointerDown={press(() => setSymbols(!symbols))}>
          {symbols ? "ABC" : "123"}
        </button>
        <button type="button" className="kb-key" onPointerDown={typeChar(symbols ? "@" : ",")}>
          {symbols ? "@" : ","}
        </button>
        <button type="button" className="kb-key kb-space" aria-label="Space" onPointerDown={press(() => insert(target, " "))}>
          space
        </button>
        <button type="button" className="kb-key" onPointerDown={typeChar(".")}>
          .
        </button>
        <button type="button" className="kb-key kb-wide kb-enter" aria-label="Enter" onPointerDown={press(() => enter(target))}>
          <CornerDownLeft />
        </button>
        <button
          type="button"
          className="kb-key kb-wide"
          aria-label="Hide keyboard"
          onPointerDown={press(() => {
            target.blur();
            setTarget(null);
          })}
        >
          <ChevronDown />
        </button>
      </div>
    </div>,
    document.body,
  );
}
