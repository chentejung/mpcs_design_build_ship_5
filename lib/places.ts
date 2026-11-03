// Markets by place for the landing page's globe (issue #15). The worker gives each Market a list of places (#13):
// ISO 3166-1 alpha-2 country codes ("IR", "US") and region codes ("region:middle-east"); an empty list means Global.
// This groups Markets by place and gives each place a name and a position (its centroid). Pure, so it is
// unit-tested. Country positions are Natural Earth's label points (public domain), matching
// public/geo/countries-110m.json, plus a few small states that file leaves out.
import type { Market } from "./markets";

export type PlacedMarket = Market & { places?: readonly string[] | null };

export type PlaceKind = "country" | "region" | "global";

export const GLOBAL = "global";

/** [display name, latitude, longitude] for every supported country code. */
export const COUNTRIES: Readonly<Record<string, readonly [string, number, number]>> = {
  AE: ["United Arab Emirates", 23.5, 54.5],
  AF: ["Afghanistan", 34.2, 66.5],
  AL: ["Albania", 40.7, 20.1],
  AM: ["Armenia", 40.5, 44.8],
  AO: ["Angola", -12.2, 18.0],
  AQ: ["Antarctica", -79.8, 35.9],
  AR: ["Argentina", -33.5, -64.2],
  AT: ["Austria", 47.5, 14.1],
  AU: ["Australia", -24.1, 134.0],
  AZ: ["Azerbaijan", 40.4, 47.2],
  BA: ["Bosnia and Herzegovina", 44.1, 18.1],
  BD: ["Bangladesh", 24.2, 89.7],
  BE: ["Belgium", 50.8, 4.8],
  BF: ["Burkina Faso", 12.7, -1.4],
  BG: ["Bulgaria", 42.5, 25.2],
  BI: ["Burundi", -3.3, 29.9],
  BJ: ["Benin", 10.3, 2.4],
  BN: ["Brunei", 4.4, 114.6],
  BO: ["Bolivia", -16.7, -64.6],
  BR: ["Brazil", -12.1, -49.6],
  BS: ["Bahamas", 26.4, -77.1],
  BT: ["Bhutan", 27.5, 90.0],
  BW: ["Botswana", -22.1, 24.2],
  BY: ["Belarus", 53.8, 28.4],
  BZ: ["Belize", 17.2, -88.7],
  CA: ["Canada", 60.3, -101.9],
  CD: ["DR Congo", -1.9, 23.5],
  CF: ["Central African Republic", 7.0, 20.9],
  CG: ["Congo", 0.1, 15.9],
  CH: ["Switzerland", 46.7, 7.5],
  CI: ["Côte d'Ivoire", 7.5, -5.6],
  CL: ["Chile", -38.2, -72.3],
  CM: ["Cameroon", 4.6, 12.5],
  CN: ["China", 32.5, 106.3],
  CO: ["Colombia", 3.4, -73.2],
  CR: ["Costa Rica", 10.1, -84.1],
  CU: ["Cuba", 21.3, -78.0],
  CY: ["Cyprus", 34.9, 33.1],
  CZ: ["Czechia", 49.9, 15.4],
  DE: ["Germany", 51.0, 9.7],
  DJ: ["Djibouti", 12.0, 42.5],
  DK: ["Denmark", 56.0, 9.0],
  DO: ["Dominican Republic", 19.1, -70.7],
  DZ: ["Algeria", 27.4, 2.8],
  EC: ["Ecuador", -1.3, -78.2],
  EE: ["Estonia", 58.7, 25.9],
  EG: ["Egypt", 26.2, 29.4],
  EH: ["Western Sahara", 24.0, -12.6],
  ER: ["Eritrea", 15.8, 38.3],
  ES: ["Spain", 40.1, -3.5],
  ET: ["Ethiopia", 8.0, 39.1],
  FI: ["Finland", 63.3, 27.3],
  FJ: ["Fiji", -17.8, 178.0],
  FK: ["Falkland Islands", -51.6, -58.7],
  FR: ["France", 46.7, 2.6],
  GA: ["Gabon", -0.4, 11.8],
  GB: ["United Kingdom", 54.4, -2.1],
  GE: ["Georgia", 41.9, 43.7],
  GH: ["Ghana", 7.7, -1.0],
  GL: ["Greenland", 74.3, -39.3],
  GM: ["Gambia", 13.6, -15.0],
  GN: ["Guinea", 10.6, -10.0],
  GQ: ["Equatorial Guinea", 2.3, 9.0],
  GR: ["Greece", 39.5, 21.7],
  GT: ["Guatemala", 15.0, -90.5],
  GW: ["Guinea-Bissau", 12.2, -14.5],
  GY: ["Guyana", 5.1, -58.9],
  HN: ["Honduras", 14.8, -86.9],
  HR: ["Croatia", 45.8, 16.4],
  HT: ["Haiti", 19.3, -72.2],
  HU: ["Hungary", 47.1, 19.4],
  ID: ["Indonesia", -1.0, 101.9],
  IE: ["Ireland", 53.1, -7.8],
  IL: ["Israel", 30.9, 34.8],
  IN: ["India", 22.7, 79.4],
  IQ: ["Iraq", 33.1, 43.3],
  IR: ["Iran", 32.2, 54.9],
  IS: ["Iceland", 64.8, -18.7],
  IT: ["Italy", 44.7, 11.1],
  JM: ["Jamaica", 18.1, -77.3],
  JO: ["Jordan", 30.8, 36.4],
  JP: ["Japan", 36.1, 138.4],
  KE: ["Kenya", 0.5, 37.9],
  KG: ["Kyrgyzstan", 41.7, 74.5],
  KH: ["Cambodia", 12.6, 104.5],
  KP: ["North Korea", 39.9, 126.4],
  KR: ["South Korea", 36.4, 128.1],
  KW: ["Kuwait", 29.4, 47.3],
  KZ: ["Kazakhstan", 49.1, 68.7],
  LA: ["Laos", 19.4, 102.5],
  LB: ["Lebanon", 34.1, 36.0],
  LK: ["Sri Lanka", 7.6, 80.7],
  LR: ["Liberia", 6.4, -9.5],
  LS: ["Lesotho", -29.5, 28.2],
  LT: ["Lithuania", 55.1, 24.1],
  LU: ["Luxembourg", 49.7, 6.1],
  LV: ["Latvia", 57.1, 25.5],
  LY: ["Libya", 26.6, 18.0],
  MA: ["Morocco", 31.7, -7.2],
  MD: ["Moldova", 47.4, 28.5],
  ME: ["Montenegro", 42.8, 19.1],
  MG: ["Madagascar", -18.6, 46.7],
  MK: ["North Macedonia", 41.6, 21.6],
  ML: ["Mali", 18.7, -2.0],
  MM: ["Myanmar", 21.6, 95.8],
  MN: ["Mongolia", 46.0, 104.2],
  MR: ["Mauritania", 19.6, -9.7],
  MW: ["Malawi", -13.4, 33.6],
  MX: ["Mexico", 23.9, -102.3],
  MY: ["Malaysia", 2.5, 113.8],
  MZ: ["Mozambique", -13.9, 37.8],
  NA: ["Namibia", -20.6, 17.1],
  NC: ["New Caledonia", -21.1, 165.1],
  NE: ["Niger", 17.4, 9.5],
  NG: ["Nigeria", 9.4, 7.5],
  NI: ["Nicaragua", 12.7, -85.1],
  NL: ["Netherlands", 52.4, 5.6],
  NO: ["Norway", 61.4, 9.7],
  NP: ["Nepal", 28.3, 83.6],
  NZ: ["New Zealand", -39.8, 172.8],
  OM: ["Oman", 22.1, 57.3],
  PA: ["Panama", 8.7, -80.4],
  PE: ["Peru", -13.0, -72.9],
  PG: ["Papua New Guinea", -5.7, 143.9],
  PH: ["Philippines", 11.2, 122.5],
  PK: ["Pakistan", 29.3, 68.5],
  PL: ["Poland", 52.0, 19.5],
  PR: ["Puerto Rico", 18.2, -66.5],
  PS: ["Palestine", 32.0, 35.3],
  PT: ["Portugal", 39.6, -8.3],
  PY: ["Paraguay", -21.7, -60.1],
  QA: ["Qatar", 25.2, 51.1],
  RO: ["Romania", 45.7, 25.0],
  RS: ["Serbia", 44.2, 20.8],
  RU: ["Russia", 58.2, 44.7],
  RW: ["Rwanda", -1.9, 30.1],
  SA: ["Saudi Arabia", 23.8, 44.7],
  SB: ["Solomon Islands", -8.0, 159.2],
  SD: ["Sudan", 16.3, 29.3],
  SE: ["Sweden", 65.9, 19.0],
  SI: ["Slovenia", 46.1, 14.9],
  SK: ["Slovakia", 48.7, 19.0],
  SL: ["Sierra Leone", 8.6, -11.8],
  SN: ["Senegal", 15.1, -14.8],
  SO: ["Somalia", 3.6, 45.2],
  SR: ["Suriname", 4.1, -55.9],
  SS: ["South Sudan", 7.2, 30.4],
  SV: ["El Salvador", 13.7, -88.9],
  SY: ["Syria", 35.0, 38.3],
  SZ: ["Eswatini", -26.5, 31.5],
  TD: ["Chad", 15.1, 18.6],
  TF: ["French Southern Lands", -49.3, 69.1],
  TG: ["Togo", 8.8, 1.1],
  TH: ["Thailand", 15.5, 101.1],
  TJ: ["Tajikistan", 38.2, 72.6],
  TL: ["Timor-Leste", -8.8, 125.9],
  TM: ["Turkmenistan", 39.9, 58.7],
  TN: ["Tunisia", 33.7, 9.0],
  TR: ["Turkey", 39.3, 34.5],
  TT: ["Trinidad and Tobago", 11.0, -60.9],
  TW: ["Taiwan", 23.7, 120.9],
  TZ: ["Tanzania", -6.1, 35.0],
  UA: ["Ukraine", 49.7, 32.1],
  UG: ["Uganda", 2.0, 32.9],
  US: ["United States", 39.5, -97.5],
  UY: ["Uruguay", -33.0, -56.0],
  UZ: ["Uzbekistan", 41.7, 64.0],
  VE: ["Venezuela", 7.2, -64.6],
  VN: ["Vietnam", 21.7, 105.4],
  VU: ["Vanuatu", -15.4, 166.9],
  XK: ["Kosovo", 42.6, 20.9],
  YE: ["Yemen", 15.3, 45.9],
  ZA: ["South Africa", -29.7, 23.7],
  ZM: ["Zambia", -14.7, 26.4],
  ZW: ["Zimbabwe", -18.9, 29.9],
  // Too small for the 110m shapes.
  BH: ["Bahrain", 26.0, 50.6],
  HK: ["Hong Kong", 22.3, 114.2],
  MC: ["Monaco", 43.7, 7.4],
  MT: ["Malta", 35.9, 14.4],
  SG: ["Singapore", 1.35, 103.8],
  VA: ["Vatican City", 41.9, 12.45],
};

/** The region codes the worker uses, each with a name and a rough centre. */
export const REGIONS: Readonly<Record<string, readonly [string, number, number]>> = {
  "region:middle-east": ["Middle East", 29, 45],
  "region:europe": ["Europe", 50, 15],
  "region:asia": ["Asia", 34, 100],
  "region:africa": ["Africa", 2, 20],
  "region:latin-america": ["Latin America", -15, -60],
  "region:north-america": ["North America", 45, -100],
  "region:oceania": ["Oceania", -25, 140],
};

export type PlaceInfo = { code: string; name: string; kind: Exclude<PlaceKind, "global">; lat: number; lng: number };

/** A place code's name and position, or null for a code this table doesn't know. */
export function placeInfo(code: string): PlaceInfo | null {
  const region = REGIONS[code];
  if (region) return { code, name: region[0], kind: "region", lat: region[1], lng: region[2] };
  const country = COUNTRIES[code];
  if (country) return { code, name: country[0], kind: "country", lat: country[1], lng: country[2] };
  return null;
}

export type PlaceGroup = {
  code: string;
  name: string;
  kind: PlaceKind;
  /** Centroid; null for Global, which isn't on the globe. */
  lat: number | null;
  lng: number | null;
  /** By 24-hour volume, busiest first. */
  markets: PlacedMarket[];
  count: number;
  volume24h: number;
};

export type PlaceGroups = {
  /** Countries and regions with Markets, busiest (summed 24-hour volume) first, ties by code. */
  places: PlaceGroup[];
  /** Markets with no known place. */
  global: PlaceGroup;
};

const vol = (m: Market) => m.volume_24h ?? 0;
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Groups Markets by place. A Market with several places appears under each; one with none (or only codes this
 * table doesn't know) is Global.
 */
export function groupByPlace(markets: readonly PlacedMarket[]): PlaceGroups {
  const groups = new Map<string, PlaceGroup>();
  const global: PlaceGroup = { code: GLOBAL, name: "Global", kind: "global", lat: null, lng: null, markets: [], count: 0, volume24h: 0 };
  for (const m of markets) {
    const known = [...new Set(m.places ?? [])].map(placeInfo).filter((p): p is PlaceInfo => p !== null);
    if (known.length === 0) {
      global.markets.push(m);
      continue;
    }
    for (const p of known) {
      let g = groups.get(p.code);
      if (!g) {
        g = { ...p, markets: [], count: 0, volume24h: 0 };
        groups.set(p.code, g);
      }
      g.markets.push(m);
    }
  }
  const finish = (g: PlaceGroup): PlaceGroup => {
    const sorted = [...g.markets].sort((a, b) => vol(b) - vol(a) || byCode(a.id, b.id));
    return { ...g, markets: sorted, count: sorted.length, volume24h: sorted.reduce((s, m) => s + vol(m), 0) };
  };
  return {
    places: [...groups.values()].map(finish).sort((a, b) => b.volume24h - a.volume24h || byCode(a.code, b.code)),
    global: finish(global),
  };
}

/** Two places that share Markets, for an arc on the globe; `from` sorts before `to`. */
export type SharedArc = { from: string; to: string; volume: number; count: number };

export const MAX_ARCS = 15;

/**
 * The pairs of places that Markets share (a Market about the US and Iran links US↔IR), each pair once whatever
 * order its codes come in, with the Markets' summed 24-hour volume and count. Busiest first, at most `max`.
 * Global, single-place and unknown codes give none.
 */
export function sharedArcs(markets: readonly PlacedMarket[], max = MAX_ARCS): SharedArc[] {
  const arcs = new Map<string, SharedArc>();
  for (const m of markets) {
    const codes = [...new Set(m.places ?? [])].filter((c) => placeInfo(c) !== null).sort(byCode);
    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        const key = `${codes[i]}|${codes[j]}`;
        const arc = arcs.get(key) ?? { from: codes[i], to: codes[j], volume: 0, count: 0 };
        arc.volume += vol(m);
        arc.count += 1;
        arcs.set(key, arc);
      }
    }
  }
  return [...arcs.values()]
    .sort((a, b) => b.volume - a.volume || byCode(a.from, b.from) || byCode(a.to, b.to))
    .slice(0, max);
}
