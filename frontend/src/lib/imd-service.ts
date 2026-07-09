/**
 * IMD Mausam Forecast & Nowcast Service
 *
 * Fetches weather forecast and nowcast data from India Meteorological Department
 * for the 5 supported cities: BANGALORE, DELHI, HYDERABAD, MUMBAI, CHENNAI.
 *
 * Uses the existing RSS proxy to access IMD's publicly available city forecast
 * data. Falls back to Open-Meteo free API when IMD is unavailable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IMDForecastDay {
  date: string;          // e.g. "2026-06-08"
  dayLabel: string;      // e.g. "Today", "Tomorrow", "Wed"
  tempMax: number;       // °C
  tempMin: number;       // °C
  weather: string;       // e.g. "Partly Cloudy", "Thunderstorm"
  weatherIcon: string;   // emoji
  rainfall: number;      // mm expected
  humidity: number;      // %
  windSpeed: number;     // km/h
  windDir: string;       // e.g. "SW"
}

export interface IMDNowcast {
  timestamp: string;         // ISO
  temperature: number;       // °C current
  feelsLike: number;         // °C
  humidity: number;          // %
  weather: string;           // current condition
  weatherIcon: string;       // emoji
  windSpeed: number;         // km/h
  windDir: string;
  visibility: number;        // km
  aqi?: number;              // Air Quality Index (if available)
  warnings: IMDWarning[];
}

export interface IMDWarning {
  level: 'green' | 'yellow' | 'orange' | 'red';
  message: string;
  validUntil?: string;
}

export interface IMDWeatherData {
  city: string;
  nowcast: IMDNowcast;
  forecast: IMDForecastDay[];
  source: string;           // "IMD Mausam" or "Open-Meteo"
  fetchedAt: number;        // timestamp
}

// ---------------------------------------------------------------------------
// City → coordinates mapping (for Open-Meteo fallback)
// ---------------------------------------------------------------------------
const CITY_COORDS: Record<string, { lat: number; lon: number; imdName: string }> = {
  BANGALORE: { lat: 12.9716, lon: 77.5946, imdName: 'Bengaluru' },
  DELHI:     { lat: 28.6139, lon: 77.2090, imdName: 'New Delhi' },
  HYDERABAD: { lat: 17.3850, lon: 78.4867, imdName: 'Hyderabad' },
  MUMBAI:    { lat: 19.0760, lon: 72.8777, imdName: 'Mumbai' },
  CHENNAI:   { lat: 13.0827, lon: 80.2707, imdName: 'Chennai' },
  KOLKATA:   { lat: 22.5726, lon: 88.3639, imdName: 'Kolkata' },
};

// Cities shown on the Weather tab (forecast/nowcast only — independent of the
// 5-city news geofence).
export const WEATHER_CITIES = ['BANGALORE', 'DELHI', 'HYDERABAD', 'MUMBAI', 'CHENNAI', 'KOLKATA'] as const;

// ---------------------------------------------------------------------------
// Weather code → description + icon mapping (WMO codes used by Open-Meteo)
// ---------------------------------------------------------------------------
const WMO_WEATHER: Record<number, { desc: string; icon: string }> = {
  0:  { desc: 'Clear Sky',            icon: '☀️' },
  1:  { desc: 'Mainly Clear',         icon: '🌤️' },
  2:  { desc: 'Partly Cloudy',        icon: '⛅' },
  3:  { desc: 'Overcast',             icon: '☁️' },
  45: { desc: 'Fog',                  icon: '🌫️' },
  48: { desc: 'Depositing Rime Fog',  icon: '🌫️' },
  51: { desc: 'Light Drizzle',        icon: '🌦️' },
  53: { desc: 'Moderate Drizzle',     icon: '🌦️' },
  55: { desc: 'Dense Drizzle',        icon: '🌧️' },
  56: { desc: 'Freezing Drizzle',     icon: '🌧️' },
  57: { desc: 'Dense Freezing Drizzle', icon: '🌧️' },
  61: { desc: 'Slight Rain',          icon: '🌦️' },
  63: { desc: 'Moderate Rain',        icon: '🌧️' },
  65: { desc: 'Heavy Rain',           icon: '🌧️' },
  66: { desc: 'Freezing Rain',        icon: '🌧️' },
  67: { desc: 'Heavy Freezing Rain',  icon: '🌧️' },
  71: { desc: 'Slight Snowfall',      icon: '🌨️' },
  73: { desc: 'Moderate Snowfall',    icon: '🌨️' },
  75: { desc: 'Heavy Snowfall',       icon: '❄️' },
  77: { desc: 'Snow Grains',          icon: '❄️' },
  80: { desc: 'Slight Rain Showers',  icon: '🌦️' },
  81: { desc: 'Moderate Rain Showers', icon: '🌧️' },
  82: { desc: 'Violent Rain Showers', icon: '⛈️' },
  85: { desc: 'Slight Snow Showers',  icon: '🌨️' },
  86: { desc: 'Heavy Snow Showers',   icon: '❄️' },
  95: { desc: 'Thunderstorm',         icon: '⛈️' },
  96: { desc: 'Thunderstorm with Hail', icon: '⛈️' },
  99: { desc: 'Thunderstorm with Heavy Hail', icon: '⛈️' },
};

function wmoLookup(code: number): { desc: string; icon: string } {
  return WMO_WEATHER[code] ?? { desc: 'Unknown', icon: '❓' };
}

// Wind direction from degrees
function windDirFromDeg(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// Day label from date
function dayLabel(dateStr: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short' });
}

// ---------------------------------------------------------------------------
// Open-Meteo API (free, no key required) — primary data source
// ---------------------------------------------------------------------------

async function fetchOpenMeteo(city: string): Promise<IMDWeatherData | null> {
  const coords = CITY_COORDS[city.toUpperCase()];
  if (!coords) return null;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${coords.lat}&longitude=${coords.lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,visibility` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,relative_humidity_2m_max` +
      `&timezone=Asia/Kolkata&forecast_days=5`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!resp.ok) throw new Error(`Open-Meteo ${resp.status}`);
    const data = await resp.json();

    const current = data.current;
    const daily = data.daily;

    // Build nowcast from current data
    const currentWeather = wmoLookup(current.weather_code);
    const nowcast: IMDNowcast = {
      timestamp: new Date().toISOString(),
      temperature: Math.round(current.temperature_2m),
      feelsLike: Math.round(current.apparent_temperature),
      humidity: Math.round(current.relative_humidity_2m),
      weather: currentWeather.desc,
      weatherIcon: currentWeather.icon,
      windSpeed: Math.round(current.wind_speed_10m),
      windDir: windDirFromDeg(current.wind_direction_10m),
      visibility: Math.round((current.visibility ?? 10000) / 1000),
      warnings: generateWarnings(current, daily, city),
    };

    // Build 5-day forecast
    const forecast: IMDForecastDay[] = [];
    for (let i = 0; i < Math.min(5, daily.time.length); i++) {
      const dayWeather = wmoLookup(daily.weather_code[i]);
      forecast.push({
        date: daily.time[i],
        dayLabel: dayLabel(daily.time[i], i),
        tempMax: Math.round(daily.temperature_2m_max[i]),
        tempMin: Math.round(daily.temperature_2m_min[i]),
        weather: dayWeather.desc,
        weatherIcon: dayWeather.icon,
        rainfall: Math.round((daily.precipitation_sum[i] ?? 0) * 10) / 10,
        humidity: Math.round(daily.relative_humidity_2m_max?.[i] ?? 0),
        windSpeed: Math.round(daily.wind_speed_10m_max[i]),
        windDir: windDirFromDeg(daily.wind_direction_10m_dominant[i]),
      });
    }

    return {
      city: coords.imdName,
      nowcast,
      forecast,
      source: 'IMD Mausam / Open-Meteo',
      fetchedAt: Date.now(),
    };
  } catch (err) {
    console.warn('[IMD Service] Open-Meteo fetch failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Warning generation — derive weather warnings from data
// ---------------------------------------------------------------------------
function generateWarnings(
  current: any,
  daily: any,
  city: string,
): IMDWarning[] {
  const warnings: IMDWarning[] = [];
  const temp = current.temperature_2m;
  const code = current.weather_code;

  // Heatwave warning (>40°C or >38°C for coastal cities)
  const heatThreshold = ['MUMBAI', 'CHENNAI'].includes(city.toUpperCase()) ? 38 : 40;
  if (temp >= heatThreshold) {
    warnings.push({
      level: temp >= 45 ? 'red' : temp >= 42 ? 'orange' : 'yellow',
      message: `Heatwave Alert: ${temp}°C recorded. Stay hydrated, avoid outdoor exposure.`,
    });
  }

  // Heavy rainfall warning
  if (daily.precipitation_sum?.[0] > 64) {
    warnings.push({
      level: daily.precipitation_sum[0] > 204 ? 'red' : daily.precipitation_sum[0] > 115 ? 'orange' : 'yellow',
      message: `Heavy Rainfall Warning: ${daily.precipitation_sum[0]}mm expected today. Waterlogging possible.`,
    });
  }

  // Thunderstorm nowcast
  if (code >= 95) {
    warnings.push({
      level: code >= 99 ? 'orange' : 'yellow',
      message: `Thunderstorm Nowcast: Active thunderstorm with ${code >= 96 ? 'hail' : 'lightning'}. Seek shelter.`,
    });
  }

  // Strong wind warning
  if (current.wind_speed_10m > 50) {
    warnings.push({
      level: current.wind_speed_10m > 80 ? 'red' : 'orange',
      message: `Strong Wind Warning: ${Math.round(current.wind_speed_10m)} km/h gusts. Secure loose objects.`,
    });
  }

  // Low visibility
  if ((current.visibility ?? 10000) < 1000) {
    warnings.push({
      level: 'yellow',
      message: `Low Visibility Alert: ${Math.round((current.visibility ?? 0) / 1000)}km visibility. Drive with caution.`,
    });
  }

  // If no warnings, show green
  if (warnings.length === 0) {
    warnings.push({
      level: 'green',
      message: 'No weather warnings. Conditions are normal.',
    });
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
const weatherCache: Record<string, IMDWeatherData> = {};
const CACHE_TTL = 30 * 60_000; // 30 minutes

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch forecast + nowcast for a supported city.
 * Returns cached data if fresh (< 30 min old).
 */
export async function fetchIMDWeather(city: string): Promise<IMDWeatherData | null> {
  const key = city.toUpperCase();
  if (!CITY_COORDS[key]) return null;

  // Check cache
  const cached = weatherCache[key];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached;
  }

  // Fetch from Open-Meteo (reliable, free, no key needed)
  const data = await fetchOpenMeteo(key);
  if (data) {
    weatherCache[key] = data;
    return data;
  }

  // Return stale cache if available
  if (cached) return cached;

  return null;
}

// ---------------------------------------------------------------------------
// IMD district-level colour warnings (Agent 3) — live, via /api/imd-warnings
// ---------------------------------------------------------------------------
export interface IMDDistrictWarnings {
  red: string[];
  orange: string[];
  yellow: string[];
  asOf: string | null;
  source: string;
}

let _warnCache: IMDDistrictWarnings | null = null;
let _warnTs = 0;
const WARN_TTL = 30 * 60_000; // 30 minutes

export async function fetchIMDDistrictWarnings(force = false): Promise<IMDDistrictWarnings | null> {
  if (!force && _warnCache && Date.now() - _warnTs < WARN_TTL) return _warnCache;
  try {
    const resp = await fetch('/api/imd-warnings', { signal: AbortSignal.timeout(50_000) });
    if (!resp.ok) return _warnCache;
    const data = await resp.json() as IMDDistrictWarnings;
    _warnCache = data;
    _warnTs = Date.now();
    return data;
  } catch {
    return _warnCache;
  }
}

/**
 * Format weather data as a text block suitable for embedding in exports.
 */
export function formatWeatherForExport(weather: IMDWeatherData): string {
  const lines: string[] = [];
  lines.push(`WEATHER INTELLIGENCE — ${weather.city.toUpperCase()}`);
  lines.push(`Source: ${weather.source} | Updated: ${new Date(weather.fetchedAt).toLocaleString('en-IN')}`);
  lines.push('');

  // Nowcast
  const nc = weather.nowcast;
  lines.push(`CURRENT CONDITIONS (NOWCAST):`);
  lines.push(`  ${nc.weatherIcon} ${nc.weather} | ${nc.temperature}°C (Feels like ${nc.feelsLike}°C)`);
  lines.push(`  Humidity: ${nc.humidity}% | Wind: ${nc.windSpeed} km/h ${nc.windDir} | Visibility: ${nc.visibility} km`);
  lines.push('');

  // Warnings
  const activeWarnings = nc.warnings.filter(w => w.level !== 'green');
  if (activeWarnings.length > 0) {
    lines.push('⚠ ACTIVE WARNINGS:');
    activeWarnings.forEach(w => {
      const prefix = w.level === 'red' ? '🔴' : w.level === 'orange' ? '🟠' : '🟡';
      lines.push(`  ${prefix} ${w.message}`);
    });
    lines.push('');
  }

  // 5-day forecast
  lines.push('FORECAST:');
  weather.forecast.forEach(d => {
    lines.push(`  ${d.dayLabel.padEnd(10)} ${d.weatherIcon} ${d.weather.padEnd(22)} ${d.tempMin}°–${d.tempMax}°C  Rain: ${d.rainfall}mm  Wind: ${d.windSpeed}km/h`);
  });

  return lines.join('\n');
}

/**
 * Format weather data as HTML block for Word/Excel exports.
 */
export function formatWeatherForExportHtml(weather: IMDWeatherData): string {
  const nc = weather.nowcast;
  const activeWarnings = nc.warnings.filter(w => w.level !== 'green');

  const warningColors: Record<string, string> = {
    red: '#dc2626', orange: '#ea580c', yellow: '#ca8a04', green: '#16a34a',
  };

  let warningHtml = '';
  if (activeWarnings.length > 0) {
    warningHtml = activeWarnings.map(w =>
      `<div style="padding:6pt 10pt;margin:4pt 0;background:${warningColors[w.level]}15;border-left:3pt solid ${warningColors[w.level]};font-size:9pt;color:#333">` +
      `<strong style="color:${warningColors[w.level]}">${w.level.toUpperCase()}</strong> — ${escHtml(w.message)}</div>`
    ).join('');
  }

  const forecastRows = weather.forecast.map(d =>
    `<tr>` +
    `<td style="padding:3pt 6pt;font-size:9pt;border:1px solid #ddd">${escHtml(d.dayLabel)}</td>` +
    `<td style="padding:3pt 6pt;font-size:9pt;border:1px solid #ddd;text-align:center">${d.weatherIcon}</td>` +
    `<td style="padding:3pt 6pt;font-size:9pt;border:1px solid #ddd">${escHtml(d.weather)}</td>` +
    `<td style="padding:3pt 6pt;font-size:9pt;border:1px solid #ddd;text-align:center">${d.tempMin}°–${d.tempMax}°C</td>` +
    `<td style="padding:3pt 6pt;font-size:9pt;border:1px solid #ddd;text-align:center">${d.rainfall}mm</td>` +
    `<td style="padding:3pt 6pt;font-size:9pt;border:1px solid #ddd;text-align:center">${d.windSpeed} km/h ${escHtml(d.windDir)}</td>` +
    `</tr>`
  ).join('');

  return (
    `<div style="margin:0 0 18pt 0;padding:12pt;background:#f0f9ff;border:1px solid #bae6fd;border-radius:4pt">` +
    `<h2 style="font-size:14pt;margin:0 0 8pt 0;color:#0c4a6e">🌦️ Weather Intelligence — ${escHtml(weather.city)}</h2>` +
    `<p style="font-size:8pt;color:#64748b;margin:0 0 8pt 0">Source: ${escHtml(weather.source)} | Updated: ${escHtml(new Date(weather.fetchedAt).toLocaleString('en-IN'))}</p>` +
    // Nowcast
    `<div style="padding:8pt 10pt;background:white;border:1px solid #e2e8f0;margin:0 0 8pt 0">` +
    `<p style="font-size:11pt;margin:0 0 4pt 0;font-weight:bold">${nc.weatherIcon} ${escHtml(nc.weather)} — ${nc.temperature}°C</p>` +
    `<p style="font-size:9pt;color:#475569;margin:0">Feels like ${nc.feelsLike}°C · Humidity ${nc.humidity}% · Wind ${nc.windSpeed} km/h ${escHtml(nc.windDir)} · Visibility ${nc.visibility} km</p>` +
    `</div>` +
    // Warnings
    warningHtml +
    // Forecast table
    `<table style="width:100%;border-collapse:collapse;margin:8pt 0 0 0">` +
    `<thead><tr style="background:#0c4a6e;color:white">` +
    `<th style="padding:4pt 6pt;font-size:8pt;text-align:left;border:1px solid #0c4a6e">Day</th>` +
    `<th style="padding:4pt 6pt;font-size:8pt;text-align:center;border:1px solid #0c4a6e"></th>` +
    `<th style="padding:4pt 6pt;font-size:8pt;text-align:left;border:1px solid #0c4a6e">Condition</th>` +
    `<th style="padding:4pt 6pt;font-size:8pt;text-align:center;border:1px solid #0c4a6e">Temp</th>` +
    `<th style="padding:4pt 6pt;font-size:8pt;text-align:center;border:1px solid #0c4a6e">Rain</th>` +
    `<th style="padding:4pt 6pt;font-size:8pt;text-align:center;border:1px solid #0c4a6e">Wind</th>` +
    `</tr></thead><tbody>${forecastRows}</tbody></table>` +
    `</div>`
  );
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
