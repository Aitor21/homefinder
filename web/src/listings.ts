/**
 * The last mile: from "this town looks right" to "here are the actual homes".
 *
 * Deliberately NOT a scraper. Idealista and Fotocasa both front their listings
 * with bot protection and forbid scraping in their terms; anything built on it
 * breaks within weeks and is a licence problem in the meantime. Pre-filtered
 * deep links reach the same listings, keep working, and take one click.
 *
 * Slugs are constructed from the town and province name, which matches the
 * portals' own convention in the large majority of cases. When one misses, the
 * per-portal fallback search link always works -- the UI offers both.
 */
import type { Town, Filters } from './types';

export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\//g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Spanish sources write "Coruna, A"; the portals write "a-coruna". */
function tidyName(name: string): string {
  const m = name.match(/^(.*),\s*(el|la|los|las|o|a|os|as)$/i);
  return m ? `${m[2]} ${m[1]}` : name;
}

export interface PortalLink {
  portal: string;
  url: string;
  /** True when the link is a search that always resolves; false for a
   *  constructed slug, which is faster but can miss. */
  exact: boolean;
}

/**
 * Which portal actually serves a country, and how to search it.
 *
 * Every town used to link to Idealista and Fotocasa regardless of where it was,
 * which meant a shortlisted town in Hokkaido or Patagonia sent you to a Spanish
 * site with nothing in it. The last mile is the whole point of the tool, so it
 * has to land somewhere real.
 *
 * These are search URLs rather than constructed listing slugs wherever
 * possible: a search always resolves, whereas a guessed slug for a portal you
 * cannot test against is a dead link that looks like a working one. Spain keeps
 * its slug deep-links below because those are in daily use and carry the budget
 * and size filters straight through.
 *
 * Each entry says which form the town name takes in the URL, because the two
 * are not interchangeable: `query` gets it percent-encoded for a parameter,
 * `slug` gets it lowercased and hyphenated for a path segment.
 */
type NameForm = 'query' | 'slug';
const PORTALS: Record<string, Array<[string, NameForm, (q: string) => string]>> = {
  // ------------------------------------------------------------- Europe
  PT: [['Idealista', 'slug', (q) => `https://www.idealista.pt/comprar-casas/${q}/`],
       ['Imovirtual', 'slug', (q) => `https://www.imovirtual.com/pt/resultados/comprar/apartamento/${q}`]],
  IT: [['Immobiliare', 'query', (q) => `https://www.immobiliare.it/search-list/?idContratto=1&q=${q}`],
       ['Idealista', 'slug', (q) => `https://www.idealista.it/vendita-case/${q}/`]],
  FR: [['SeLoger', 'query', (q) => `https://www.seloger.com/list.htm?types=1,2&projects=2,5&places=[{"inseeCodes":[]}]&q=${q}`],
       ['Leboncoin', 'query', (q) => `https://www.leboncoin.fr/recherche?category=9&text=${q}`]],
  DE: [['ImmoScout24', 'query', (q) => `https://www.immobilienscout24.de/Suche/de/wohnung-kaufen?q=${q}`],
       ['Immowelt', 'query', (q) => `https://www.immowelt.de/suche/wohnungen/kaufen?query=${q}`]],
  AT: [['Willhaben', 'query', (q) => `https://www.willhaben.at/iad/immobilien/eigentumswohnung/eigentumswohnung-angebote?keyword=${q}`]],
  CH: [['Homegate', 'query', (q) => `https://www.homegate.ch/buy/real-estate/matching-list?tab=list&q=${q}`]],
  NL: [['Funda', 'slug', (q) => `https://www.funda.nl/zoeken/koop?selected_area=%5B%22${q}%22%5D`]],
  BE: [['Immoweb', 'query', (q) => `https://www.immoweb.be/en/search/house-and-apartment/for-sale?countries=BE&q=${q}`]],
  LU: [['atHome', 'query', (q) => `https://www.athome.lu/en/srp/?tr=buy&q=${q}`]],
  IE: [['Daft.ie', 'slug', (q) => `https://www.daft.ie/property-for-sale/${q}`],
       ['MyHome.ie', 'query', (q) => `https://www.myhome.ie/residential/search?address=${q}`]],
  GB: [['Rightmove', 'query', (q) => `https://www.rightmove.co.uk/property-for-sale/search.html?searchLocation=${q}`],
       ['Zoopla', 'slug', (q) => `https://www.zoopla.co.uk/for-sale/property/${q}/`]],
  DK: [['Boligsiden', 'query', (q) => `https://www.boligsiden.dk/tilsalg?q=${q}`]],
  SE: [['Hemnet', 'query', (q) => `https://www.hemnet.se/bostader?q=${q}`]],
  NO: [['Finn.no', 'query', (q) => `https://www.finn.no/realestate/homes/search.html?q=${q}`]],
  FI: [['Etuovi', 'query', (q) => `https://www.etuovi.com/myytavat-asunnot?haku=${q}`]],
  IS: [['Fasteignir', 'query', (q) => `https://www.fasteignir.is/?q=${q}`]],
  EE: [['KV.ee', 'query', (q) => `https://www.kv.ee/search?deal_type=1&search_string=${q}`]],
  LV: [['SS.lv', 'query', (q) => `https://www.ss.lv/lv/real-estate/search/?q=${q}`]],
  LT: [['Aruodas', 'query', (q) => `https://www.aruodas.lt/butai/?search=${q}`]],
  PL: [['Otodom', 'slug', (q) => `https://www.otodom.pl/pl/wyniki/sprzedaz/mieszkanie/${q}`]],
  CZ: [['Sreality', 'query', (q) => `https://www.sreality.cz/hledani/prodej/byty?region=${q}`]],
  SK: [['Nehnutelnosti', 'query', (q) => `https://www.nehnutelnosti.sk/vyhladavanie?text=${q}`]],
  HU: [['Ingatlan.com', 'slug', (q) => `https://ingatlan.com/lista/elado+lakas+${q}`]],
  RO: [['Imobiliare.ro', 'slug', (q) => `https://www.imobiliare.ro/vanzare-apartamente/${q}`]],
  BG: [['Imot.bg', 'query', (q) => `https://www.imot.bg/pcgi/imot.cgi?act=3&slink=&f1=${q}`]],
  GR: [['Spitogatos', 'slug', (q) => `https://www.spitogatos.gr/en/for_sale-homes/${q}`]],
  HR: [['Njuskalo', 'query', (q) => `https://www.njuskalo.hr/prodaja-stanova?q=${q}`]],
  SI: [['Nepremicnine.net', 'query', (q) => `https://www.nepremicnine.net/oglasi-prodaja/?q=${q}`]],
  CY: [['Bazaraki', 'query', (q) => `https://www.bazaraki.com/real-estate-for-sale/?q=${q}`]],
  MT: [['Property Market', 'query', (q) => `https://www.propertymarket.com.mt/search?q=${q}`]],
  RS: [['Nekretnine.rs', 'query', (q) => `https://www.nekretnine.rs/stambeni-objekti/stanovi/lista/po-stranici/10/?keyword=${q}`]],
  ME: [['Nekretnine.me', 'query', (q) => `https://www.nekretnine.me/pretraga?q=${q}`]],
  BA: [['OLX.ba', 'query', (q) => `https://olx.ba/pretraga?trazilica=${q}`]],
  MK: [['Pazar3', 'query', (q) => `https://www.pazar3.mk/en/ads?SearchTerm=${q}`]],
  AL: [['Merrjep', 'query', (q) => `https://www.merrjep.al/njoftime?q=${q}`]],
  MD: [['999.md', 'query', (q) => `https://999.md/ro/search?query=${q}`]],
  AD: [['Immo Andorra', 'query', (q) => `https://www.immoandorra.ad/en/search?q=${q}`]],

  // --------------------------------------------------------------- Asia
  JP: [['SUUMO', 'query', (q) => `https://suumo.jp/jj/common/ichiran/JJ901FC004/?ar=030&kw=${q}`],
       ['HOMES', 'query', (q) => `https://www.homes.co.jp/search/?keyword=${q}`]],
  KR: [['Naver Land', 'query', (q) => `https://land.naver.com/search/?query=${q}`]],
  TW: [['591', 'query', (q) => `https://sale.591.com.tw/?keywords=${q}`]],
  TR: [['Sahibinden', 'query', (q) => `https://www.sahibinden.com/satilik?query_text=${q}`],
       ['Hepsiemlak', 'query', (q) => `https://www.hepsiemlak.com/satilik?search=${q}`]],
  IL: [['Yad2', 'query', (q) => `https://www.yad2.co.il/realestate/forsale?text=${q}`]],
  GE: [['MyHome.ge', 'query', (q) => `https://www.myhome.ge/en/s/?search=${q}`]],
  AM: [['List.am', 'query', (q) => `https://www.list.am/category/56?q=${q}`]],
  AZ: [['Bina.az', 'query', (q) => `https://bina.az/alqi-satqi?q=${q}`]],
  KZ: [['Krisha.kz', 'query', (q) => `https://krisha.kz/prodazha/kvartiry/?search=${q}`]],
  KG: [['House.kg', 'query', (q) => `https://www.house.kg/kupit-kvartiru?q=${q}`]],
  UZ: [['OLX.uz', 'slug', (q) => `https://www.olx.uz/nedvizhimost/q-${q}/`]],
  MY: [['PropertyGuru', 'query', (q) => `https://www.propertyguru.com.my/property-for-sale?freetext=${q}`]],
  TH: [['DDproperty', 'query', (q) => `https://www.ddproperty.com/en/property-for-sale?freetext=${q}`]],
  SG: [['PropertyGuru', 'query', (q) => `https://www.propertyguru.com.sg/property-for-sale?freetext=${q}`]],
  VN: [['Batdongsan', 'query', (q) => `https://batdongsan.com.vn/tim-kiem?q=${q}`]],
  PH: [['Lamudi', 'query', (q) => `https://www.lamudi.com.ph/buy/?q=${q}`]],
  ID: [['Rumah123', 'query', (q) => `https://www.rumah123.com/jual/cari/?q=${q}`]],
  KH: [['Realestate.com.kh', 'query', (q) => `https://www.realestate.com.kh/buy/?search=${q}`]],
  LK: [['LankaPropertyWeb', 'query', (q) => `https://www.lankapropertyweb.com/sale/search.php?q=${q}`]],
  AE: [['Bayut', 'query', (q) => `https://www.bayut.com/for-sale/property/?q=${q}`],
       ['Property Finder', 'query', (q) => `https://www.propertyfinder.ae/en/search?c=1&q=${q}`]],
  MN: [['Unegui.mn', 'query', (q) => `https://www.unegui.mn/l-hdlh/l-hdlh-zarna/?q=${q}`]],
  CN: [['Lianjia', 'slug', (q) => `https://www.lianjia.com/ershoufang/rs${q}/`]],
  IN: [['99acres', 'slug', (q) => `https://www.99acres.com/search/property/buy/${q}`]],

  // ----------------------------------------------------------- Americas
  US: [['Zillow', 'slug', (q) => `https://www.zillow.com/homes/${q}_rb/`],
       ['Realtor.com', 'slug', (q) => `https://www.realtor.com/realestateandhomes-search/${q}`]],
  CA: [['Realtor.ca', 'query', (q) => `https://www.realtor.ca/map#Sort=6-D&GeoName=${q}`],
       ['Zolo', 'query', (q) => `https://www.zolo.ca/search?q=${q}`]],
  MX: [['Inmuebles24', 'slug', (q) => `https://www.inmuebles24.com/casas-en-venta-en-${q}.html`],
       ['Vivanuncios', 'slug', (q) => `https://www.vivanuncios.com.mx/s-venta-inmuebles/${q}/v1c1097l1000p1`]],
  BR: [['ZAP Imoveis', 'query', (q) => `https://www.zapimoveis.com.br/venda/imoveis/?q=${q}`],
       ['VivaReal', 'query', (q) => `https://www.vivareal.com.br/venda/?q=${q}`]],
  AR: [['Zonaprop', 'slug', (q) => `https://www.zonaprop.com.ar/venta-${q}.html`],
       ['Argenprop', 'slug', (q) => `https://www.argenprop.com/venta/${q}`]],
  CL: [['Portal Inmobiliario', 'slug', (q) => `https://www.portalinmobiliario.com/venta/${q}`],
       ['Yapo', 'query', (q) => `https://www.yapo.cl/chile/inmuebles?q=${q}`]],
  UY: [['InfoCasas', 'slug', (q) => `https://www.infocasas.com.uy/venta/${q}`],
       ['Mercado Libre', 'slug', (q) => `https://inmuebles.mercadolibre.com.uy/venta/${q}/`]],
  CO: [['Fincaraiz', 'slug', (q) => `https://www.fincaraiz.com.co/venta/${q}`],
       ['Metrocuadrado', 'slug', (q) => `https://www.metrocuadrado.com/venta/${q}/`]],
  PE: [['Urbania', 'slug', (q) => `https://urbania.pe/buscar/venta-de-propiedades-en-${q}`],
       ['Adondevivir', 'slug', (q) => `https://www.adondevivir.com/venta-${q}.html`]],
  EC: [['Plusvalia', 'slug', (q) => `https://www.plusvalia.com/venta-${q}.html`]],
  BO: [['InfoCasas', 'slug', (q) => `https://www.infocasas.com.bo/venta/${q}`]],
  PY: [['InfoCasas', 'slug', (q) => `https://www.infocasas.com.py/venta/${q}`]],
  VE: [['Mercado Libre', 'slug', (q) => `https://inmuebles.mercadolibre.com.ve/venta/${q}/`]],
  CR: [['Encuentra24', 'query', (q) => `https://www.encuentra24.com/costa-rica-es/bienes-raices-venta?q=${q}`]],
  PA: [['Encuentra24', 'query', (q) => `https://www.encuentra24.com/panama-es/bienes-raices-venta?q=${q}`]],
  GT: [['Encuentra24', 'query', (q) => `https://www.encuentra24.com/guatemala-es/bienes-raices-venta?q=${q}`]],
  DO: [['Supercasas', 'query', (q) => `https://www.supercasas.com/buscar/?q=${q}`]],
  JM: [['PropertyAds Jamaica', 'query', (q) => `https://www.propertyadsjamaica.com/search?q=${q}`]],
  TT: [['Terra Caribbean', 'query', (q) => `https://www.terracaribbean.com/trinidad/search?q=${q}`]],
  BB: [['Terra Caribbean', 'query', (q) => `https://www.terracaribbean.com/barbados/search?q=${q}`]],
  BS: [['Bahamas Realty', 'query', (q) => `https://www.bahamasrealty.bs/search?q=${q}`]],
  BZ: [['Belize Real Estate', 'query', (q) => `https://www.remax-belizerealestate.com/search?q=${q}`]],

  // ------------------------------------------------------------ Oceania
  AU: [['realestate.com.au', 'slug', (q) => `https://www.realestate.com.au/buy/in-${q}/list-1`],
       ['Domain', 'query', (q) => `https://www.domain.com.au/sale/?suburb=${q}`]],
  NZ: [['Trade Me Property', 'query', (q) => `https://www.trademe.co.nz/a/property/residential/sale/search?search_string=${q}`]],

  // ------------------------------------------------------------- Africa
  ZA: [['Property24', 'slug', (q) => `https://www.property24.com/for-sale/${q}`],
       ['Private Property', 'query', (q) => `https://www.privateproperty.co.za/for-sale/search?q=${q}`]],
  MA: [['Mubawab', 'query', (q) => `https://www.mubawab.ma/en/sc/apartments-for-sale?keyword=${q}`],
       ['Avito', 'query', (q) => `https://www.avito.ma/fr/maroc/immobilier-à_vendre?q=${q}`]],
  EG: [['Aqarmap', 'query', (q) => `https://aqarmap.com.eg/en/search?q=${q}`],
       ['Property Finder', 'query', (q) => `https://www.propertyfinder.eg/en/search?c=1&q=${q}`]],
  TN: [['Tayara', 'query', (q) => `https://www.tayara.tn/ads/c/Immobilier/?q=${q}`]],
  KE: [['BuyRentKenya', 'query', (q) => `https://www.buyrentkenya.com/property-for-sale?q=${q}`]],
  TZ: [['Zoom Tanzania', 'query', (q) => `https://www.zoomtanzania.com/property-for-sale?q=${q}`]],
  GH: [['meQasa', 'query', (q) => `https://meqasa.com/properties-for-sale?q=${q}`]],
  RW: [['House.rw', 'query', (q) => `https://www.house.rw/search?q=${q}`]],
  NA: [['Property24 Namibia', 'slug', (q) => `https://www.property24.com.na/for-sale/${q}`]],
  BW: [['Property24 Botswana', 'slug', (q) => `https://www.property24.co.bw/for-sale/${q}`]],
  MU: [['Lexpress Property', 'query', (q) => `https://www.lexpressproperty.com/en/buy-mauritius/?q=${q}`]],
  CV: [['Casa Cabo Verde', 'query', (q) => `https://www.imoveis-caboverde.com/?s=${q}`]],
  ET: [['Ethiopian Properties', 'query', (q) => `https://www.ethiopianproperties.com/?s=${q}`]],
};

export function portalLinks(t: Town, f: Filters): PortalLink[] {
  const town = slug(tidyName(t.name));
  const prov = slug(tidyName(t.province));
  const budget = Math.round(f.budget);
  const m2 = Math.round(f.minM2);

  if (t.country !== 'ES') {
    const raw = tidyName(t.name);
    const q = encodeURIComponent(raw);
    const local = (PORTALS[t.country] ?? []).map(([portal, form, build]) => ({
      portal,
      url: build(form === 'slug' ? town : q),
      exact: true,
    }));
    return local.length
      ? local
      : [
          {
            portal: `Search for ${raw}`,
            url: `https://duckduckgo.com/?q=${encodeURIComponent(
              `${raw} ${t.countryName} property for sale`,
            )}`,
            exact: true,
          },
        ];
  }

  return [
    {
      portal: 'Idealista',
      url:
        `https://www.idealista.com/venta-viviendas/${town}-${prov}/` +
        `con-precio-hasta_${budget},metros-cuadrados-mas-de_${m2}/`,
      exact: false,
    },
    {
      portal: 'Fotocasa',
      url:
        `https://www.fotocasa.es/es/comprar/viviendas/${town}/todas-las-zonas/l` +
        `?maxPrice=${budget}&minSurface=${m2}`,
      exact: false,
    },
    {
      portal: 'pisos.com',
      url: `https://www.pisos.com/venta/pisos-${town}/?precio_hasta=${budget}&superficie_desde=${m2}`,
      exact: false,
    },
    {
      portal: 'Idealista (search)',
      url: `https://www.idealista.com/buscar/venta-viviendas/?q=${encodeURIComponent(tidyName(t.name) + ' ' + tidyName(t.province))}`,
      exact: true,
    },
  ];
}

// ---------------------------------------------------------------- CSV import

/**
 * How far along a development is, ordered from earliest to latest. This is the
 * field that decides whether a row is something you could buy this month or
 * something to watch for two years, and it is the one most lists record as
 * free text in a dozen spellings.
 */
export type BuildStatus = 'pipeline' | 'waiting' | 'building' | 'ready';

export const BUILD_STATUS_LABEL: Record<BuildStatus, string> = {
  pipeline: 'Announced, not launched',
  waiting: 'Waiting list open',
  building: 'Under construction',
  ready: 'Built or selling now',
};

export const BUILD_STATUS_ORDER: BuildStatus[] = ['pipeline', 'waiting', 'building', 'ready'];

/**
 * Free text to one of four states. Real lists write the same state a dozen
 * ways ("New build", "New build / selling", "New build / reference",
 * "Delivery 2026"), and a filter cannot work across that.
 */
export function normaliseStatus(raw: string): BuildStatus | undefined {
  const v = raw.toLowerCase();
  if (!v.trim()) return undefined;
  if (/waiting|lista de espera|espera|allocation|adjudicaci/.test(v)) return 'waiting';
  if (/under construction|construction started|en construcc|iniciada|obras/.test(v))
    return 'building';
  if (/future|pipeline|pre-?launch|prelanzamiento|coming soon|pr[oó]xima/.test(v))
    return 'pipeline';
  // Tested after the pipeline branch above, so "Pre-launch" cannot reach here
  // and be read as already selling.
  if (/new build|obra nueva|selling|venta|launch|lanzamiento|delivery|entrega|terminad|llave/
    .test(v))
    return 'ready';
  return undefined;
}

export interface Listing {
  title: string;
  url: string;
  /** Optional: a development announced but not launched has no price yet. */
  price?: number;
  m2?: number;
  /** Matched place id, when the row could be tied to a known town. */
  id?: string;
  townName?: string;
  rooms?: number;
  /** eur/m2 of this specific listing, when price and area are both known. */
  eurM2?: number;
  /** How this listing compares with its town's typical price, as a percentage. */
  vsTownPct?: number;

  // --- new-build fields -----------------------------------------------------
  status?: BuildStatus;
  /** As written: "Q3 2027", "2026", "June 2026". Left alone rather than parsed
   *  into a false precision nobody supplied. */
  completion?: string;
  developer?: string;
  /**
   * Protected housing (VPO/VPT in Spain). Worth its own field because it is not
   * a discount, it is a different thing to own: income ceilings to qualify,
   * capped resale price, and a minimum holding period.
   */
  official?: boolean;
  /** Whatever the list used to rank rows, normalised to 1..5. */
  priority?: number;
  notes?: string;
  /** Row number in the source file, so an error can point at it. */
  row: number;
}

/**
 * Localities that are not municipalities.
 *
 * Property lists name the place people say they live in, which is often a
 * village inside a larger municipality: nobody says "I am buying in Ribamontán
 * al Mar", they say Somo. The town table only holds municipalities, so these
 * would silently fail to match and lose all of their climate and price context.
 *
 * Deliberately NOT resolved by nearest centroid: Somo's nearest municipal
 * centroid is Marina de Cudeyo, and Somo is in Ribamontán al Mar. Guessing by
 * distance would have got two of these five wrong.
 */
const LOCALITY_TO_MUNICIPALITY: Record<string, string> = {
  somo: 'Ribamontán al Mar',
  pedrena: 'Marina de Cudeyo',
  sancibrian: 'Santa Cruz de Bezana',
  'san juan de la arena': 'Soto del Barco',
  arcade: 'Soutomaior',
};

/** Strip accents and case so "Gijon" and "Gijón" are the same key. */
const fold = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // A column headed "m2" is the same column as one headed with a superscript
    // two, and everybody writes the second one. Missing it meant every floor
    // area came back empty and nothing could be priced per metre.
    .replace(/\u00b2/g, '2')
    .toLowerCase()
    .trim();

/**
 * Every spelling a town might be written under, so a list written by a human
 * meets a table written by GeoNames. Bilingual names are the main problem:
 * GeoNames writes "Gijón/Xixón" and "Vitoria-Gasteiz", people write one half.
 */
function nameKeys(name: string): string[] {
  const out = new Set<string>();
  const base = tidyName(name);
  out.add(fold(base));
  for (const part of base.split(/[/-]/)) {
    const k = fold(part);
    if (k) out.add(k);
  }
  return [...out];
}

export function parseListingsCsv(
  text: string,
  towns: Town[],
): { listings: Listing[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  if (!lines.length) return { listings: [], errors: ['file is empty'] };

  const header = splitCsvLine(lines[0]).map((h) => fold(h));
  // Substring match, not equality: real headers carry units and slashes
  // ("Price (EUR)", "Development / Property", "m2"), and demanding an exact
  // token means a list has to be rewritten before it can be read.
  const find = (...names: string[]) =>
    header.findIndex((h) => names.some((nm) => h === nm || h.includes(nm)));

  const iTitle = find('development', 'promocion', 'title', 'nombre', 'titulo', 'name');
  const iUrl = find('url', 'link', 'enlace');
  const iPrice = find('price', 'precio');
  const iM2 = find('m2', 'superficie', 'surface', 'metros', 'size');
  const iTown = find('municipality', 'municipio', 'town', 'localidad', 'ciudad');
  const iIne = find('ine');
  const iRooms = find('bedroom', 'rooms', 'habitaciones', 'dormitorios', 'beds');
  const iStatus = find('construction status', 'status', 'estado');
  const iDone = find('completion', 'entrega', 'delivery');
  const iDev = find('developer', 'promoter', 'promotora', 'constructora');
  const iVpo = find('vpo', 'protegida', 'official');
  const iPrio = find('priority', 'prioridad');
  const iNotes = find('notes', 'notas', 'comentarios');

  if (iTown < 0 && iIne < 0) {
    return {
      listings: [],
      errors: ['needs a municipality column (or an INE code) so rows can be placed'],
    };
  }

  const byId = new Map(towns.map((t) => [t.id, t]));
  const byName = new Map<string, Town>();
  for (const t of towns) {
    if (t.country !== 'ES') continue;
    for (const k of nameKeys(t.name)) {
      // Larger town wins a collision: two villages can share a name, and the
      // one someone means in a property list is almost always the bigger.
      const prev = byName.get(k);
      if (!prev || prev.pop < t.pop) byName.set(k, t);
    }
  }

  const listings: Listing[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const cell = (ix: number) => (ix >= 0 ? (cells[ix] ?? '').trim() : '');

    const price = NUM(cell(iPrice)) || undefined;
    const m2 = NUM(cell(iM2)) || undefined;

    let town: Town | undefined;
    if (iIne >= 0 && cell(iIne)) {
      const raw = cell(iIne);
      town = byId.get(raw) ?? byId.get(`ES-${raw.padStart(5, '0')}`);
    }
    const rawTown = cell(iTown);
    if (!town && rawTown) {
      // "Arcade / Soutomaior" and "Gijón (Asturias)" both appear in real lists.
      const cleaned = rawTown.replace(/\(.*?\)/g, '').trim();
      const candidates = [cleaned, ...cleaned.split('/').map((x) => x.trim())];
      for (const cand of candidates) {
        const k = fold(cand);
        town = byName.get(k) ?? byName.get(fold(LOCALITY_TO_MUNICIPALITY[k] ?? ''));
        if (town) break;
      }
    }
    if (!town && (rawTown || cell(iIne))) {
      errors.push(`row ${i + 1}: "${rawTown}" did not match a municipality`);
    }

    const eurM2 = price && m2 ? price / m2 : undefined;
    // A star rating, a number, or a word. Counting characters handles the
    // common case of a stars column without demanding anyone change it.
    const prioRaw = cell(iPrio);
    const stars = (prioRaw.match(/[\u2b50\u2605\u2606*]/gu) ?? []).length;
    const priority = stars || NUM(prioRaw) || undefined;

    listings.push({
      title: cell(iTitle) || `Row ${i + 1}`,
      url: cell(iUrl),
      price,
      m2,
      rooms: NUM(cell(iRooms)) || undefined,
      id: town?.id,
      townName: town?.name ?? rawTown ?? undefined,
      eurM2,
      vsTownPct: town && eurM2 ? (eurM2 / town.eurM2 - 1) * 100 : undefined,
      status: normaliseStatus(cell(iStatus)),
      completion: cell(iDone) || undefined,
      developer: cell(iDev) || undefined,
      official: /^(y|yes|si|s[ií]|vpo|vpt|true|1)/i.test(cell(iVpo)) || undefined,
      priority: priority && priority <= 5 ? priority : undefined,
      notes: cell(iNotes) || undefined,
      row: i + 1,
    });
  }
  return { listings, errors };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * A number as a human wrote it, in either convention.
 *
 * "329,000" is three hundred thousand to an English writer and three hundred
 * and twenty-nine to a Spanish one; "88.24" is the reverse. This assumed the
 * Spanish reading, which turned a EUR 329,000 flat into a EUR 329 one. That
 * then presented itself as a spectacular bargain against the town average,
 * which is the worst way for a bug like this to fail.
 *
 * The rule: when both separators appear, the later one is the decimal point.
 * When only one appears and exactly three digits follow it, it is a thousands
 * separator. Floor areas are never written to three decimals, so the remaining
 * ambiguity does not bite here.
 */
const NUM = (s: string) => {
  const raw = String(s).replace(/[^0-9.,-]/g, '');
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let cleaned: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    const thou = dec === ',' ? '.' : ',';
    cleaned = raw.split(thou).join('').replace(dec, '.');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const digitsAfter = raw.length - raw.lastIndexOf(sep) - 1;
    cleaned =
      digitsAfter === 3 && raw.indexOf(sep) > 0
        ? raw.split(sep).join('')
        : raw.replace(sep, '.');
  } else {
    cleaned = raw;
  }
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : 0;
};

/**
 * Parse a CSV of listings you have collected yourself.
 * Recognised headers (case-insensitive, any order):
 *   title/nombre, url/link, price/precio, m2/superficie/surface,
 *   town/municipio, ine, rooms/habitaciones
 */

// ------------------------------------------------------- Idealista API adapter

/**
 * Dormant by design. Idealista grants API keys on application
 * (developers.idealista.com/access-request); the free tier is small. Until a key
 * exists this returns null and the UI stays on deep links.
 *
 * The token endpoint requires a server-side call -- browsers cannot hold the
 * secret and the API sends no CORS headers -- so wire this through a small local
 * proxy if you get access.
 */
export interface IdealistaCreds { apiKey: string; secret: string; proxyUrl?: string; }

export async function searchIdealista(
  _town: Town,
  _f: Filters,
  creds: IdealistaCreds | null,
): Promise<Listing[] | null> {
  if (!creds?.proxyUrl) return null;
  try {
    const r = await fetch(creds.proxyUrl, { method: 'POST' });
    if (!r.ok) return null;
    return (await r.json()) as Listing[];
  } catch {
    return null;
  }
}
