// src/utils/geo.js
const R = 3958.8;
const toR = d => d * Math.PI / 180;

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1))*Math.cos(toR(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function driveLabel(miles) {
  if (miles < 10)  return "< 15 min";
  if (miles < 50)  return `~${Math.round(miles/0.75)} min`;
  if (miles < 500) return `~${(miles/60).toFixed(1)} hr`;
  return `${Math.round(miles).toLocaleString()} mi`;
}

export function sortByDistance(sites, lat, lng) {
  return sites.map(s => ({
    ...s,
    distanceMiles: s.lat && s.lng ? haversineDistance(lat, lng, s.lat, s.lng) : Infinity,
  })).sort((a,b) => a.distanceMiles - b.distanceMiles);
}

export async function geocodeZip(zip) {
  const z = zip.trim().replace(/\D/g, "").slice(0,5);
  if (z.length < 5) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${z}&country=US&format=json&limit=1`,
      { headers: { "User-Agent": "RareTrials/1.0 (thexiulab.org)" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { return null; }
}
