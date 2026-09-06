export type PriceSource = 'observed' | 'modelled' | 'provincial' | 'country';

/**
 * Whether an EU or EFTA passport holder can actually acquire property here.
 * Every one of those passports gets the same answer, which is why the field
 * generalises across the users of this app without being re-derived.
 * Outside the EU it is the single most decision-relevant field in the dataset:
 * a New Zealand town you cannot buy in is not an option however good it scores.
 */
export type Ownership = 'freehold' | 'restricted' | 'leasehold' | 'prohibited';

/**
 * Whether the passport itself grants the right to live there. Deliberately
 * separate from ownership, because the two genuinely come apart: Japan will
 * sell you a house but not the right to stay in it, and every EU country will
 * let you stay whether or not you can afford one.
 */
export type Residence = 'free' | 'visa';

export const RESIDENCE_LABEL: Record<Residence, string> = {
  free: 'Right to live here',
  visa: 'Needs a visa',
};

export const OWNERSHIP_LABEL: Record<Ownership, string> = {
  freehold: 'Buy freely',
  restricted: 'Conditions apply',
  leasehold: 'Lease / use-rights only',
  prohibited: 'Cannot buy',
};
export type ClimateSource = 'measured' | 'modelled';

export interface Town {
  /** Stable id: "ES-48020" for Spain (INE code), "FR-2988507" elsewhere. */
  id: string;
  name: string;
  /** ISO country code. */
  country: string;
  countryName: string;
  continent: string;
  ownership: Ownership;
  residence: Residence;
  province: string;
  ccaa: string;
  lat: number;
  lon: number;
  pop: number;
  elev: number;

  // climate
  /** Mean daily high of the hottest month, whichever month that is. */
  hottestTmax: number;
  /** Index 0-11 of that month. February in Santiago, July in Madrid. */
  hottestMonth: number;
  hottestTmin: number;
  summerTmax: number;
  peakTmax: number;
  winterTmin: number;
  summerAppTmax: number;
  daysOver30: number;
  daysOver35: number;
  tropicalNights: number;
  appDaysOver32: number;
  annualRain: number;
  summerRain: number;
  humidity: number;
  /** Mean solar radiation, kJ/m2/day. A sunshine proxy; higher is brighter. */
  solarAnnual: number | null;
  solarSummer: number | null;
  monthlyTmax: number[];
  monthlyTmin: number[];
  monthlyPrec: number[];
  source: ClimateSource;

  // access
  airportKm: number;
  airportName: string;
  hubKm: number;
  hubName: string;
  airportScore: number;
  city50kKm: number;
  city100kKm: number;
  city100kName: string;
  city250kKm: number;

  // amenities
  /** Nearest mainline station. */
  trainKm: number | null;
  /**
   * Nearest metro, subway, light rail or tram stop. The four are folded
   * together because they answer one question: can you live here without a
   * car? A tram and a light rail stop are not different to someone deciding.
   */
  metroKm: number | null;
  /** Nearest bus STATION, i.e. a coach terminal. Stops are everywhere and say
   *  nothing; a terminal means intercity services actually call here. */
  busKm: number | null;
  supermarketKm: number | null;
  supermarket5km: number | null;
  pharmacyKm: number | null;
  pharmacy5km: number | null;
  hospitalKm: number | null;
  schoolKm: number | null;
  school5km: number | null;
  mallKm: number | null;
  cyclewayKm: number | null;
  cycleSegments5km: number | null;
  /**
   * False where the shop/health/school layers were never queried (everywhere
   * outside Spain). A null there means "not looked at", never "nothing there",
   * and the scoring model drops the dimension rather than penalising the town.
   */
  amenitiesSurveyed: boolean;
  /** Train, metro and coach terminals were queried in this place's box. */
  transitSurveyed: boolean;

  // terrain
  coastKm: number | null;
  beachKm: number | null;
  parkKm: number | null;
  skiKm: number | null;
  maxElev25km: number | null;
  relief25km: number | null;
  /** False where beach/park/ski were never queried (outside Spain). */
  terrainPoisSurveyed: boolean;

  // air quality -- CAMS reanalysis, regional background not street level
  pm25: number | null;
  /**
   * How many of the four sample months backed that figure. Shipped because a
   * partial year is not an annual mean: January alone reads far dirtier than
   * the year does across most of the northern hemisphere.
   */
  pm25Months?: number;
  /** Multiples of the WHO annual guideline of 5 ug/m3. */
  pm25VsWho: number | null;

  // broadband -- Ookla open data, test-count weighted
  netDownMbps: number | null;
  netUpMbps: number | null;
  netTests: number;

  // cost of living
  /**
   * World Bank ICP price level. Stored against Spain = 100 because that is
   * where the price series it is calibrated on lives; the UI rebases it to
   * whichever country the user says they are in, since a number anchored to
   * somewhere you have never lived is not a number you can act on.
   */
  costIndex: number | null;
  /** Heating and cooling degree days from the monthly normals. */
  hdd: number;
  cdd: number;
  energyKwh: number;
  energyEurYear: number | null;
  electricityEurKwh: number | null;
  incomeTaxTop: number | null;
  vat: number | null;

  // price
  eurM2: number;
  priceSource: PriceSource;
  /**
   * How wrong the price could reasonably be, as a fraction either side. Zero
   * for a published municipal figure, 0.45 for a national average bent by a
   * gradient fitted in another country. Rendering a band rather than a number
   * is the difference between an estimate and a claim.
   */
  priceBand: number;
  priceQuarter: string;
  valuations: number | null;
  provincialEurM2: number;
}

export interface CountryRule {
  name: string;
  continent: string;
  residence: Residence;
  ownership: Ownership;
  /** The actual rule in one sentence. "Restricted" alone is not actionable. */
  note: string;
}

/** A company that builds and sells new homes. */
export interface Developer {
  name: string;
  site: string;
  /** Where their promotions are listed. Falls back to the site root where the
   *  listing page could not be confirmed, because a guessed path that 404s is
   *  worse than one extra click. */
  promotions: string;
  /** `regional` companies are shown only in the provinces they build in. */
  scope: 'national' | 'regional' | 'public';
  /** ISO codes where the company actually builds. */
  countries: string[];
  /** INE province codes, empty for national. */
  provinces: string[];
  scale: 'very large' | 'large' | 'medium' | 'small';
  note: string;
}

export interface Dataset {
  meta: {
    built: string;
    count: number;
    priceQuarter: string | null;
    countries?: Record<string, number>;
    priceTiers?: Record<string, number>;
    /** Per-country residence and ownership rules, shipped once not per row. */
    countryRules?: Record<string, CountryRule>;
    /** Who builds new homes, keyed by a short code. */
    developers?: Record<string, Developer>;
    priceModel?: { modelErrorPct: number; observed: number; modelled: number } | null;
    sources: Record<string, string>;
  };
  towns: Town[];
}

export interface Filters {
  budget: number;
  minM2: number;
  maxDaysOver30: number;
  maxTropicalNights: number;
  maxHotTmax: number;
  /**
   * Floors, so wanting a WARM place is expressible. Every summer bound used to
   * be a ceiling, which quietly meant the tool only worked for people escaping
   * heat.
   */
  minHotTmax: number;
  minWinterTmin: number;
  /**
   * The Hottest month, daily high you actually want, in C. Scoring measures distance
   * from this in BOTH directions, so 22 and 34 are each simply a preference.
   * null means no stated preference and the dimension drops out of the score.
   */
  summerTarget: number | null;
  /** Drive time, minutes. Kilometres were never what anyone meant. */
  maxAirportMin: number;
  maxHubMin: number;
  maxCityKm: number;
  maxTrainKm: number | null;
  /**
   * Km to the nearest public transport of any kind: mainline rail, metro, tram
   * or coach terminal. One control rather than three, because "can I get out of
   * here without a car" is one question and it does not matter which mode
   * answers it.
   */
  maxTransitKm: number | null;
  /** Minimum broadband download speed, Mbps. */
  minNetMbps: number;
  /** Maximum annual mean PM2.5, ug/m3. The EU limit value is 25. */
  maxPm25: number;
  /** Maximum cost-of-living index, on the stored Spain = 100 scale. */
  maxCostIndex: number;
  minPop: number;
  maxPop: number;
  regions: string[];
  /**
   * Places whose climate you want more of. Every candidate is matched against
   * the BEST of these, so a list of favourites means "like any one of them",
   * not "like their average" -- averaging Bilbao and Sapporo would describe
   * nowhere.
   */
  favourites: string[];
  /** Places you have ruled out. These set the summer ceilings. */
  avoid: string[];
  /** ISO country codes; empty means every country. */
  countries: string[];
  /** Continents to include; empty means all. */
  continents: string[];
  /** Which ownership tiers to allow. */
  ownership: Ownership[];
  /** Show only places an EU or EFTA passport lets you live in without a visa. */
  freeMovementOnly: boolean;
  requireObservedPrice: boolean;
}

export interface Weights {
  /** Closeness to the summer you asked for, in either direction. */
  summerFit: number;
  affordability: number;
  airport: number;
  city: number;
  amenities: number;
  mountains: number;
  coast: number;
  winterMild: number;
  drier: number;
  sunny: number;
  cleanAir: number;
  internet: number;
  livingCost: number;
  energyBill: number;
  /** Fit to the taste learned from the places you picked. */
  affinity: number;
}

/** The maximum-population slider's top notch: at or above this, no upper limit. */
export const POP_ANY = 5_000_000;

export const DEFAULT_FILTERS: Filters = {
  budget: 400_000,
  minM2: 80,
  // Wide open by default. The questionnaire narrows these from the places you
  // name; starting them tight would be an opinion the app has no business
  // holding before you have said anything.
  maxDaysOver30: 200,
  maxTropicalNights: 200,
  maxHotTmax: 50,
  minHotTmax: 0,
  minWinterTmin: -99,
  summerTarget: null,
  // 60 minutes to a hub is a real constraint: the old 250 km admitted 95% of
  // the dataset, which is not a filter, it is decoration.
  maxAirportMin: 45,
  maxHubMin: 60,
  maxCityKm: 90,
  maxTrainKm: null,
  maxTransitKm: null,
  minNetMbps: 25,
  maxPm25: 25,
  maxCostIndex: 250,
  minPop: 1_500,
  maxPop: 5_000_000,
  regions: [],
  favourites: [],
  avoid: [],
  countries: [],
  continents: [],
  // 'prohibited' is off by default: those are places an EU passport holder
  // cannot buy in at all, so showing them as results would be a lie of omission.
  ownership: ['freehold', 'restricted', 'leasehold'],
  // Off by default: the question asked was where to buy, and a visa is a
  // solvable problem in most of the world. The filter is there for anyone who
  // would rather not solve it.
  freeMovementOnly: false,
  requireObservedPrice: false,
};

// Rain and winter cold sit at zero on purpose: cold and wet are a preference
// here, not a penalty. Both stay adjustable.
export const DEFAULT_WEIGHTS: Weights = {
  summerFit: 10,
  affordability: 7,
  airport: 6,
  city: 5,
  amenities: 4,
  mountains: 3,
  coast: 2,
  winterMild: 0,
  drier: 0,
  sunny: 0,
  // Broadband is weighted like a utility rather than a luxury: for someone
  // working from home a slow line disqualifies a place outright.
  cleanAir: 5,
  internet: 6,
  livingCost: 4,
  energyBill: 2,
  // Weighted heavily once it has something to learn from: a list of places you
  // would actually live in says more than any slider you would set by hand.
  affinity: 8,
};
