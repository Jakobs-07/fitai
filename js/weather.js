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

export async function getWeather() {
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

export function weatherForAI(w) {
  if (!w) return null;
  return `${w.text}, dabar ${w.temp}°C (jaučiasi ${w.feels}°C), dienos ${w.min}…${w.max}°C, lietaus tikimybė ${w.rain}%, vėjas ${w.wind} km/h`;
}
