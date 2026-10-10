import { useEffect, useMemo, useRef, useState } from "react";
import { Droplets, Sunrise, Sunset } from "lucide-react";
import { Modal } from "./ui";
import { useApp } from "../lib/store";
import { dayLabel, fmtTime, longDate, weatherEmoji, weatherLabel } from "../lib/format";
import { addDays } from "../../shared/dates";
import "./weather.css";

/** Open the weather dialog from anywhere (e.g. a calendar day's weather icon). */
export function openWeather(date?: string) {
  window.dispatchEvent(new CustomEvent("haven:weather", { detail: date ?? null }));
}

/** 10-day forecast with an hourly strip for the selected day. Mounted once in the app shell. */
export function WeatherDialog() {
  const { weather, today, settings, go } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = (e: Event) => setOpen(((e as CustomEvent).detail as string | null) ?? today);
    window.addEventListener("haven:weather", on);
    return () => window.removeEventListener("haven:weather", on);
  }, [today]);

  const days = weather.daily.filter((d) => d.date >= today).slice(0, 10);
  const day = open ? (days.find((d) => d.date === open) ?? days[0]) : undefined;
  const nowHour = new Date();
  const nowKey = `${today}T${String(nowHour.getHours()).padStart(2, "0")}:00`;
  const hours = useMemo(
    () => (weather.hourly ?? []).filter((h) => day && h.time.startsWith(day.date) && (day.date !== today || h.time >= nowKey)),
    [weather.hourly, day, today, nowKey],
  );
  useEffect(() => strip.current?.scrollTo({ left: 0 }), [day?.date]);

  if (!open) return null;
  const close = () => setOpen(null);
  if (!days.length || !day) {
    return (
      <Modal title="Weather" onClose={close} size="narrow">
        <p style={{ margin: 0 }}>Add your town in Settings to see the forecast.</p>
        <button
          className="pill primary"
          onClick={() => {
            close();
            go("settings");
          }}
        >
          Open Settings
        </button>
      </Modal>
    );
  }
  const isToday = day.date === today;
  const cur = isToday ? weather.current : null;
  return (
    <Modal title={isToday ? "Today" : day.date === addDays(today, 1) ? "Tomorrow" : longDate(day.date)} onClose={close} size="wide">
      <div className="wx-hero">
        <span className="wx-hero-icon">{weatherEmoji(cur?.code ?? day.code, cur?.isDay ?? true)}</span>
        <div>
          {cur && <div className="serif wx-hero-temp">{cur.temp}°</div>}
          <div className="wx-hero-sub">
            {weatherLabel(cur?.code ?? day.code)} · High {day.max}° · Low {day.min}°
            {day.precip > 0 && (
              <>
                {" "}
                · <Droplets size={16} style={{ verticalAlign: -2 }} /> {day.precip}%
              </>
            )}
          </div>
          {(day.sunrise || day.sunset) && (
            <div className="wx-sun muted">
              {day.sunrise && (
                <span>
                  <Sunrise size={16} /> {fmtTime(day.sunrise, settings.clock24h)}
                </span>
              )}
              {day.sunset && (
                <span>
                  <Sunset size={16} /> {fmtTime(day.sunset, settings.clock24h)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {hours.length > 0 && (
        <div className="wx-hours" ref={strip} aria-label="Hourly forecast">
          {hours.map((h) => (
            <div key={h.time} className="wx-hour">
              <div className="muted">{h.time === nowKey ? "Now" : fmtTime(h.time, settings.clock24h)}</div>
              <div className="wx-hour-icon">{weatherEmoji(h.code, h.isDay)}</div>
              <div className="wx-hour-temp">{h.temp}°</div>
              <div className="wx-hour-rain">{h.precip >= 10 ? `${h.precip}%` : ""}</div>
            </div>
          ))}
        </div>
      )}

      <div className="wx-days">
        {days.map((d) => {
          const l = dayLabel(d.date);
          return (
            <button key={d.date} className={`wx-day ${d.date === day.date ? "on" : ""}`} onClick={() => setOpen(d.date)}>
              <span className="wx-day-name">{d.date === today ? "Today" : l.dow}</span>
              <span className="wx-day-icon">{weatherEmoji(d.code)}</span>
              <span className="wx-day-rain">{d.precip >= 10 ? `${d.precip}%` : ""}</span>
              <span className="wx-day-lo">{d.min}°</span>
              <span className="wx-day-bar">
                <span style={barStyle(d.min, d.max, days)} />
              </span>
              <span className="wx-day-hi">{d.max}°</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function barStyle(min: number, max: number, days: { min: number; max: number }[]) {
  const lo = Math.min(...days.map((d) => d.min));
  const hi = Math.max(...days.map((d) => d.max));
  const span = Math.max(1, hi - lo);
  return { left: `${((min - lo) / span) * 100}%`, width: `${Math.max(6, ((max - min) / span) * 100)}%` };
}
