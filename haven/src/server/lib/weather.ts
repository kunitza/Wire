import type { Ctx } from "../context.js";
import type { Settings, Weather } from "../../shared/types.js";

// Open-Meteo: free, no API key. https://open-meteo.com

export interface Place {
  name: string;
  lat: number;
  lon: number;
}

export async function geocode(query: string): Promise<Place[]> {
  const q = query.trim();
  if (!q) return [];
  // Open-Meteo matches place names, so try "City" from "City, ST" too.
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=${encodeURIComponent(q.split(",")[0].trim())}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Location lookup failed (${res.status})`);
  const body = (await res.json()) as {
    results?: { name: string; latitude: number; longitude: number; admin1?: string; country_code?: string; postcodes?: string[] }[];
  };
  const rest = q.split(",").slice(1).join(",").trim().toLowerCase();
  const results = (body.results ?? []).map((r) => ({
    name: [r.name, r.admin1, r.country_code].filter(Boolean).join(", "),
    lat: r.latitude,
    lon: r.longitude,
  }));
  // Prefer results matching the region the user typed ("Portland, ME").
  return rest ? [...results.filter((r) => r.name.toLowerCase().includes(rest)), ...results.filter((r) => !r.name.toLowerCase().includes(rest))] : results;
}

export function getWeather(ctx: Ctx): Weather {
  const units = ctx.settings.get<Settings["temperatureUnit"]>("temperatureUnit", "fahrenheit");
  const cached = ctx.settings.get<Weather | null>("weatherCache", null);
  if (cached && cached.units === units) return cached;
  return { current: null, daily: [], units, updatedAt: null };
}

export async function refreshWeather(ctx: Ctx): Promise<Weather> {
  const loc = ctx.settings.get<Place | null>("location", null);
  const units = ctx.settings.get<Settings["temperatureUnit"]>("temperatureUnit", "fahrenheit");
  if (!loc) {
    ctx.settings.delete("weatherCache");
    return getWeather(ctx);
  }
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&temperature_unit=${units}&timezone=auto&forecast_days=14`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Weather service replied ${res.status}`);
  const b = (await res.json()) as {
    current: { temperature_2m: number; weather_code: number; is_day: number };
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: (number | null)[];
    };
  };
  const weather: Weather = {
    current: { temp: Math.round(b.current.temperature_2m), code: b.current.weather_code, isDay: b.current.is_day === 1 },
    daily: b.daily.time.map((date, i) => ({
      date,
      code: b.daily.weather_code[i],
      max: Math.round(b.daily.temperature_2m_max[i]),
      min: Math.round(b.daily.temperature_2m_min[i]),
      precip: b.daily.precipitation_probability_max[i] ?? 0,
    })),
    units,
    updatedAt: ctx.now().toISOString(),
  };
  ctx.settings.set("weatherCache", weather);
  ctx.bus.emit("weather");
  return weather;
}
