// US address -> lat/lng via the free, keyless US Census geocoder.
// USA-only, which matches the app's scope.

export interface GeoResult {
  lat: number;
  lng: number;
  matched: string;
}

export async function geocodeUS(address: string): Promise<GeoResult | null> {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");
  let data: {
    result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number } }[] };
  };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "pokemon.drew.cx restock tracker" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    return null; // Geocoder down or slow: caller falls back to dropping a pin.
  }
  const m = data.result?.addressMatches?.[0];
  return m ? { lat: m.coordinates.y, lng: m.coordinates.x, matched: m.matchedAddress } : null;
}
