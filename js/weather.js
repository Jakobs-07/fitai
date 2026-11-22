// Orai iš Open-Meteo (nemokama, be rakto).
import { getSetting, setSetting } from './db.js';

const CODES = {
  0: ['Giedra', '☀️'], 1: ['Daugiausia giedra', '🌤️'], 2: ['Debesuota su pragiedruliais', '⛅'], 3: ['Debesuota', '☁️'],
  45: ['Rūkas', '🌫️'], 48: ['Rūkas', '🌫️'],
  51: ['Dulksna', '🌦️'], 53: ['Dulksna', '🌦️'], 55: ['Dulksna', '🌦️'], 56: ['Lijundra', '🌧️'], 57: ['Lijundra', '🌧️'],
  61: ['Lietus', '🌧️'], 63: ['Lietus', '🌧️'], 65: ['Smarkus lietus', '🌧️'], 66: ['Lijundra', '🌧️'], 67: ['Lijundra', '🌧️'],
  71: ['Sniegas', '🌨️'], 73: ['Sniegas', '🌨️'], 75: ['Smarkus sniegas', '❄️'], 77: ['Sniegas', '🌨️'],
  80: ['Liūtys', '🌦️'], 81: ['Liūtys', '🌧️'], 82: ['Smarkios liūtys', '⛈️'], 85: ['Sniego liūtys', '🌨️'], 86: ['Sniego liūtys', '❄️'],
  95: ['Perkūnija', '⛈️'], 96: ['Perkūnija su kruša', '⛈️'], 99: ['Perkūnija su kruša', '⛈️'],
};

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geo'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject,
      { timeout: 8000, maximumAge: 3 * 3600 * 1000 }
    );
  });
}

export async function findCity(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=lt&name=${encodeURIComponent(name)}`);
  const j = await r.json();
  const c = j.results?.[0];
  if (!c) throw new Error('Miestas nerastas');
  return { lat: c.latitude, lon: c.longitude, name: c.name };
}

async function getLocation() {
  let loc = await getSetting('location');
  if (!loc || loc.auto) {
    try {
      const p = await getPosition();
      loc = { ...p, auto: true, name: 'Tavo vieta' };
      await setSetting('location', loc);
    } catch (_) {
      if (!loc) loc = { lat: 54.6872, lon: 25.2797, name: 'Vilnius' };
    }
  }
  return loc;
}

export async function getWeather() {
  const loc = await getLocation();
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Orų gauti nepavyko');
  const j = await r.json();
  const code = j.current.weather_code;
  const [text, emoji] = CODES[code] || ['', '🌡️'];
  return {
    place: loc.name,
    temp: Math.round(j.current.temperature_2m),
    feels: Math.round(j.current.apparent_temperature),
    wind: Math.round(j.current.wind_speed_10m),
    min: Math.round(j.daily.temperature_2m_min[0]),
    max: Math.round(j.daily.temperature_2m_max[0]),
    rain: j.daily.precipitation_probability_max[0],
    text,
    emoji,
  };
}

const hhmm = (iso) => (iso || '').slice(11, 16);
function uvText(uv) {
  if (uv == null) return '';
  if (uv < 3) return 'žemas';
  if (uv < 6) return 'vidutinis';
  if (uv < 8) return 'aukštas';
  if (uv < 11) return 'labai aukštas';
  return 'ekstremalus';
}

// Platesnė dienos informacija: valandos iki rytojaus, saulė, UV, krituliai, vėjas, rytojaus prognozė
export async function getWeatherDay() {
  const loc = (await getSetting('location')) || { lat: 54.6872, lon: 25.2797, name: 'Vilnius' };
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
    `&hourly=temperature_2m,precipitation_probability,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max` +
    `&timezone=auto&forecast_days=2`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Orų gauti nepavyko');
  const j = await r.json();
  const nowH = j.current.time.slice(0, 13);
  let i0 = j.hourly.time.findIndex((t) => t.slice(0, 13) === nowH);
  if (i0 < 0) i0 = 0;
  const hours = j.hourly.time.slice(i0, i0 + 24).map((t, k) => {
    const i = i0 + k;
    return { h: t.slice(11, 13), temp: Math.round(j.hourly.temperature_2m[i]), rain: j.hourly.precipitation_probability[i] ?? 0, emoji: (CODES[j.hourly.weather_code[i]] || ['', '🌡️'])[1], newDay: t.slice(11, 13) === '00' };
  });
  const day = (d) => ({
    text: (CODES[j.daily.weather_code[d]] || [''])[0],
    emoji: (CODES[j.daily.weather_code[d]] || ['', '🌡️'])[1],
    min: Math.round(j.daily.temperature_2m_min[d]),
    max: Math.round(j.daily.temperature_2m_max[d]),
    feelsMin: Math.round(j.daily.apparent_temperature_min[d]),
    feelsMax: Math.round(j.daily.apparent_temperature_max[d]),
    sunrise: hhmm(j.daily.sunrise[d]),
    sunset: hhmm(j.daily.sunset[d]),
    uv: j.daily.uv_index_max[d] == null ? null : Math.round(j.daily.uv_index_max[d]),
    uvText: uvText(j.daily.uv_index_max[d]),
    rainMm: Math.round((j.daily.precipitation_sum[d] || 0) * 10) / 10,
    rainP: j.daily.precipitation_probability_max[d] ?? 0,
    wind: Math.round(j.daily.wind_speed_10m_max[d]),
    gusts: Math.round(j.daily.wind_gusts_10m_max[d]),
  });
  const [text, emoji] = CODES[j.current.weather_code] || ['', '🌡️'];
  return {
    place: loc.name || 'Tavo vieta',
    now: { temp: Math.round(j.current.temperature_2m), feels: Math.round(j.current.apparent_temperature), wind: Math.round(j.current.wind_speed_10m), humidity: j.current.relative_humidity_2m, text, emoji },
    hours,
    today: day(0),
    tomorrow: day(1),
  };
}

export function weatherForAI(w) {
  if (!w) return null;
  return `${w.text}, dabar ${w.temp}°C (jaučiasi ${w.feels}°C), dienos ${w.min}…${w.max}°C, lietaus tikimybė ${w.rain}%, vėjas ${w.wind} km/h`;
}
