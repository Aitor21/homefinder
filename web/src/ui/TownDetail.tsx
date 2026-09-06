import type { CountryRule, Filters, Town } from '../types';
import { OWNERSHIP_LABEL, RESIDENCE_LABEL } from '../types';
import type { Developer } from '../types';
import { developersFor, newBuildSearch } from '../developers';
import { rebaseCost } from '../home';
import type { Ranked } from '../scoring';
import { priceFor, affordableM2, bestMatch, airportDriveMin, hubDriveMin } from '../scoring';
import { formatDrive } from '../travel';
import type { GemModel } from '../gems';
import { discountPct } from '../gems';
import { portalLinks } from '../listings';
import { improvementOver, hotMonths } from '../climate';
import ClimateChart from './ClimateChart';

interface Props {
  ranked: Ranked;
  filters: Filters;
  gemModel: GemModel;
  /** Places the user said they liked. */
  refs: Town[];
  compare: Town | null;
  /** Per-country residence and ownership rules, from the dataset meta. */
  rules?: Record<string, CountryRule>;
  /** The new-build developer registry, from the dataset meta. */
  developers?: Record<string, Developer>;
  /** Cost index of the user's own country, so money reads relative to home. */
  homeIndex?: number | null;
  homeName?: string | null;
  onClose: () => void;
  onToggleFavourite: (t: Town) => void;
  onToggleAvoid: (t: Town) => void;
}

// Seasons are derived per place, so naming the month is what makes a southern
// hemisphere reading legible rather than baffling.
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
               'August', 'September', 'October', 'November', 'December'];

const n0 = (v: number | null | undefined) =>
  v == null ? 'n/a' : Math.round(v).toLocaleString();
const km = (v: number | null | undefined) => (v == null ? 'n/a' : `${v.toFixed(0)} km`);

const OWNERSHIP_NOTE: Record<string, string> = {
  freehold:
    'You can buy here in your own name, on the same footing as a local. Inside the EU/EFTA '
    + 'your passport also gives you the right to live here; outside it, ownership and residence '
    + 'are separate questions and buying a home grants you neither a visa nor tax residency.',
  restricted:
    'Purchase is possible but conditional, typically a minimum price, a cap on the share of a '
    + 'building foreigners may hold, or apartments only with no land. Confirm the current rule '
    + 'for this specific country and property type before committing to anything.',
  leasehold:
    'No freehold for foreigners here. What is available is a long lease or a right-to-use title, '
    + 'which is a materially weaker thing to own than what the price comparison implies.',
  prohibited:
    'A non-resident foreign national cannot acquire residential property here. It is shown only '
    + 'because you asked to see this tier; treat it as a climate reference, not an option.',
};

const LABELS: Record<string, string> = {
  summerFit: 'Right kind of summer',
  affordability: 'Value',
  airport: 'Airports',
  city: 'City access',
  amenities: 'Services',
  mountains: 'Mountains',
  coast: 'Coast',
  winterMild: 'Mild winter',
  drier: 'Dryness',
  sunny: 'Sunshine',
  cleanAir: 'Clean air',
  internet: 'Broadband',
  livingCost: 'Living cost',
  energyBill: 'Energy bill',
};

export default function TownDetail({
  ranked, filters, gemModel, refs, compare, rules, developers, homeIndex, homeName,
  onClose, onToggleFavourite, onToggleAvoid,
}: Props) {
  const t = ranked.town;
  const rule = rules?.[t.country];
  const builders = developersFor(t, developers);
  const onSale = newBuildSearch(t);
  // Only a published municipal figure is a number. Everything else is a
  // range, and showing it as one is the difference between an estimate and
  // a claim.
  const band =
    t.priceBand > 0
      ? ([t.eurM2 * (1 - t.priceBand), t.eurM2 * (1 + t.priceBand)] as const)
      : null;
  const cmp = improvementOver(t, compare);
  const match = bestMatch(t, refs);
  const isFavourite = refs.some((r) => r.id === t.id);
  const airMin = airportDriveMin(t);
  const hubMin = hubDriveMin(t);
  const disc = discountPct(gemModel, t);
  const fair = gemModel.predicted.get(t.id);
  const links = portalLinks(t, filters);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <h2>{t.name}</h2>
          <div className="where">
            {t.province} {'·'} {t.countryName} {'·'} {n0(t.pop)} people {'·'} {t.elev} m
          </div>
          {match && match.town.id !== t.id && (
            <div className="where">
              Closest of your climates: <b>{match.town.name}</b>, {(match.score * 100).toFixed(0)}% match
            </div>
          )}
        </div>
        <button className="link" onClick={onClose}>
          close
        </button>
      </div>

      {/* Displayed on the positive test, so a dataset built before `residence`
          existed shows nothing rather than telling you Spain needs a visa. The
          filter uses the opposite test on purpose: asked for guaranteed free
          movement, an unknown is excluded rather than assumed. */}
      {(t.ownership !== 'freehold' || t.residence === 'visa') && (
        <div className={`note own-${t.ownership}`}>
          <b>{OWNERSHIP_LABEL[t.ownership]}</b>
          {t.residence === 'visa' && <> {'·'} <b>{RESIDENCE_LABEL[t.residence]}</b></>}.{' '}
          {rule?.note ?? OWNERSHIP_NOTE[t.ownership]}
          {rule && (
            <div className="subtle">
              Checked September 2026 against government and law-firm sources. Property law
              changes and this is not legal advice: confirm with a notary in {t.countryName}
              {' '}before committing to anything.
            </div>
          )}
        </div>
      )}

      <div className="kv">
        <span className="k">Price</span>
        <span className="v">
          {band ? `${n0(band[0])} to ${n0(band[1])}` : n0(t.eurM2)} €/m²{' '}
          <span className={`pill ${t.priceSource}`}>{t.priceSource}</span>
        </span>
        <span className="k">{filters.minM2} m² would cost</span>
        <span className="v">€{n0(priceFor(t, filters.minM2))}</span>
        <span className="k">Budget buys</span>
        <span className="v">{n0(affordableM2(t, filters.budget))} m²</span>
        {fair && (
          <>
            <span className="k">Modelled fair price</span>
            <span className="v">{n0(fair)} €/m²</span>
            <span className="k">Versus that</span>
            <span className="v">
              {disc == null ? (
                'n/a'
              ) : (
                <span className={disc > 0 ? 'discount' : ''}>
                  {disc > 0 ? `${disc.toFixed(0)}% under` : `${(-disc).toFixed(0)}% over`}
                </span>
              )}
            </span>
          </>
        )}
      </div>

      {t.priceSource === 'country' && (
        <div className="note">
          This is a <b>national-average band</b>, not a measurement. Spain is the only country
          publishing a municipal price series as open data, so everywhere else the figure is
          {' '}{t.countryName}'s national average adjusted for size, coast and airport access.
          Read it as "roughly this bracket", never as a valuation, and there is deliberately no
          gem score, since scoring our own estimate against another model would be circular.
          {' '}
          <b>The width is not a guess.</b> Applying this same model to Spain, where 301 real
          municipal prices are known, lands within {'±'}46% of the truth. {t.countryName}
          {' '}is scaled from that by how far apart its places are: the wider the country, the
          less one national number can say about any part of it, which is why this one reads
          {' '}{'±'}{Math.round(t.priceBand * 100)}%.
        </div>
      )}
      {t.priceSource !== 'observed' && t.priceSource !== 'country' && (
        <div className="note">
          This price is <b>{t.priceSource}</b>, not measured. Spain's official municipal series
          only covers towns above 25,000 inhabitants, so anything smaller is estimated from its
          province. Use it to shortlist, then check the real figure through the links below.
        </div>
      )}

      {builders.length > 0 && (
        <>
          <h4>Who builds here</h4>
          <div className="builders">
            {builders.slice(0, 8).map((d) => (
              <div
                key={d.code}
                className={
                  d.scope === 'public' ? 'builder public' : d.local ? 'builder local' : 'builder'
                }
              >
                <a href={d.promotions} target="_blank" rel="noreferrer">
                  {d.name}
                </a>
                <span className="tag">
                  {d.scope === 'public'
                    ? 'public housing, by registry'
                    : d.local
                      ? 'builds in this province'
                      : 'national'}
                </span>
                <div className="subtle">{d.note}</div>
              </div>
            ))}
          </div>
          {onSale && (
            <p className="onsale">
              <a href={onSale.url} target="_blank" rel="noreferrer">
                {onSale.label} {'\u2192'}
              </a>
            </p>
          )}
          <div className="note">
            New homes usually sell off plan, often from the developer's own waiting list
            before they ever reach a portal, so the way in is the promoter rather than the
            listing. Companies marked <b>builds in this province</b> work here specifically;
            the rest operate nationally and may or may not have anything here right now.
            <br />
            Entries marked <b>public housing, by registry</b> are not companies you buy from
            in the ordinary way. They build protected housing and allocate it by public
            ballot, which means joining the registry comes first and the promotion is
            announced second. Income ceilings and resale limits apply, and none of it appears
            on any property portal, which is why people miss it.
            <br />
            Checked September 2026 and every link fetched, but land banks move constantly, so
            read this as who to ask rather than what is on sale.
          </div>
        </>
      )}

      <h4>Summer</h4>
      <div className="kv">
        <span className="k">Days above 30°C</span>
        <span className="v">{t.daysOver30.toFixed(0)}</span>
        <span className="k">Days above 35°C</span>
        <span className="v">{t.daysOver35.toFixed(0)}</span>
        <span className="k">Nights above 20°C</span>
        <span className="v">{t.tropicalNights.toFixed(0)}</span>
        <span className="k">
          Hottest month, high / low
          {t.hottestMonth != null && <span className="subtle"> ({MONTH[t.hottestMonth]})</span>}
        </span>
        <span className="v">
          {t.hottestTmax.toFixed(0)}° / {t.hottestTmin.toFixed(0)}°
        </span>
        <span className="k">Humid-heat days</span>
        <span className="v">{t.appDaysOver32.toFixed(0)}</span>
        <span className="k">Climate data</span>
        <span className="v">
          <span className={`pill ${t.source === 'measured' ? 'measured' : 'modelled'}`}>{t.source}</span>
        </span>
      </div>

      {cmp && compare && (
        <>
          <h4>Against {compare.name}</h4>
          <div className="kv">
            <span className="k">Days above 30 °C</span>
            <span className="v">
              <span className={cmp.daysOver30 > 0 ? 'discount' : ''}>
                {cmp.daysOver30 >= 0 ? '−' : '+'}
                {Math.abs(cmp.daysOver30).toFixed(0)} /yr
              </span>
            </span>
            <span className="k">Nights above 20 °C</span>
            <span className="v">
              <span className={cmp.tropicalNights > 0 ? 'discount' : ''}>
                {cmp.tropicalNights >= 0 ? '−' : '+'}
                {Math.abs(cmp.tropicalNights).toFixed(0)} /yr
              </span>
            </span>
            <span className="k">Hottest month</span>
            <span className="v">
              <span className={cmp.hottestTmax > 0 ? 'discount' : ''}>
                {cmp.hottestTmax >= 0 ? '−' : '+'}
                {Math.abs(cmp.hottestTmax).toFixed(1)} °C
              </span>
            </span>
            <span className="k">Cooling needed</span>
            <span className="v">
              <span className={(cmp.acPct ?? 100) <= 60 ? 'discount' : ''}>
                {cmp.acPct == null ? 'n/a' : `${cmp.acPct.toFixed(0)}% of ${compare.name}`}
              </span>
            </span>
            <span className="k">Months with highs ≥ 26 °C</span>
            <span className="v">
              {hotMonths(t)} vs {hotMonths(compare)}
            </span>
          </div>
        </>
      )}

      <ClimateChart town={t} />

      <h4>Rest of the year</h4>
      <div className="kv">
        <span className="k">Winter nights</span>
        <span className="v">{t.winterTmin.toFixed(1)}°C</span>
        <span className="k">Rain</span>
        <span className="v">{n0(t.annualRain)} mm</span>
        <span className="k">Sun (kJ/m²/day)</span>
        <span className="v">{n0(t.solarAnnual)}</span>
        <span className="k">Highest ground within 25 km</span>
        <span className="v">{n0(t.maxElev25km)} m</span>
        <span className="k">Relief within 25 km</span>
        <span className="v">{n0(t.relief25km)} m</span>
        <span className="k">Coast</span>
        <span className="v">{km(t.coastKm)}</span>
        <span className="k">Ski</span>
        <span className="v">
          {t.terrainPoisSurveyed === false ? (
            <span title="Only surveyed for Spain">not surveyed</span>
          ) : (
            km(t.skiKm)
          )}
        </span>
      </div>

      <h4>Connections</h4>
      <div className="kv">
        <span className="k">Nearest airport</span>
        <span className="v">
          {t.airportName} {formatDrive(airMin)}
        </span>
        <span className="k">Nearest hub (2M+ pax)</span>
        <span className="v">
          {t.hubName} {formatDrive(hubMin)}
        </span>
        <span className="k">City of 100k</span>
        <span className="v">
          {t.city100kName} {km(t.city100kKm)}
        </span>
        <span className="k">Train station</span>
        <span className="v">{km(t.trainKm)}</span>
        <span className="k">Metro, tram or light rail</span>
        <span className="v">
          <span className={t.metroKm != null && t.metroKm <= 2 ? 'discount' : ''}>
            {km(t.metroKm)}
          </span>
        </span>
        <span className="k">Coach terminal</span>
        <span className="v">{km(t.busKm)}</span>
        <span className="k">Supermarket</span>
        <span className="v">
          {km(t.supermarketKm)}
          {t.supermarket5km != null && ` (${t.supermarket5km} in 5 km)`}
        </span>
        <span className="k">Hospital / clinic</span>
        <span className="v">{km(t.hospitalKm)}</span>
        <span className="k">Pharmacy</span>
        <span className="v">{km(t.pharmacyKm)}</span>
        <span className="k">Bike lanes within 5 km</span>
        <span className="v">{t.cycleSegments5km ?? 'n/a'}</span>
      </div>
      {t.amenitiesSurveyed === false && (
        <div className="note">
          The shop, health and school layers were only surveyed for Spain. Europe-wide those
          OpenStreetMap queries do not complete. A dash above means <b>not looked at</b>, not
          "none there", and the score drops those dimensions instead of marking the place down
          for data we never collected.
          {t.transitSurveyed === false
            ? ' Public transport was not surveyed here either.'
            : ' The transport distances above are real: stations, metro, tram and coach'
              + ' terminals are surveyed worldwide.'}
        </div>
      )}

      <h4>Running costs &amp; quality of life</h4>
      <div className="kv">
        <span className="k">Cost of living ({homeName ?? 'Spain'} = 100)</span>
        <span className="v">
          {rebaseCost(t.costIndex, homeIndex ?? null) ?? 'n/a'}
          {homeIndex != null && t.costIndex != null && t.country !== undefined && (
            <span className="subtle">
              {' '}
              {t.costIndex === homeIndex
                ? 'about the same as home'
                : `${Math.abs(Math.round((t.costIndex / homeIndex - 1) * 100))}% ${
                    t.costIndex < homeIndex ? 'cheaper' : 'dearer'
                  } than home`}
            </span>
          )}
        </span>
        <span className="k">Heating + cooling</span>
        <span className="v">
          {t.energyEurYear == null ? 'n/a' : `€${n0(t.energyEurYear)}/yr`}
        </span>
        <span className="k">Degree days (heat / cool)</span>
        <span className="v">
          {n0(t.hdd)} / {n0(t.cdd)}
        </span>
        <span className="k">Electricity</span>
        <span className="v">
          {t.electricityEurKwh == null ? 'n/a' : `€${t.electricityEurKwh.toFixed(2)}/kWh`}
        </span>
        <span className="k">Broadband down / up</span>
        <span className="v">
          {t.netDownMbps == null
            ? 'n/a'
            : `${t.netDownMbps.toFixed(0)} / ${t.netUpMbps?.toFixed(0) ?? 'n/a'} Mbps`}
        </span>
        <span className="k">Speedtest sample</span>
        <span className="v">{n0(t.netTests)} tests</span>
        <span className="k">Air quality PM2.5</span>
        <span className="v">
          {t.pm25 == null ? (
            'n/a'
          ) : (
            <span className={t.pm25 <= 10 ? 'discount' : ''}>
              {t.pm25.toFixed(1)} µg/m³ ({t.pm25VsWho}× WHO)
              {/* A partial year is not an annual mean, so say which it is. */}
              {t.pm25Months != null && t.pm25Months < 4 && (
                <span className="subtle"> · {t.pm25Months} of 4 seasons</span>
              )}
            </span>
          )}
        </span>
        <span className="k">Top income tax / VAT</span>
        <span className="v">
          {t.incomeTaxTop == null ? 'n/a' : `${t.incomeTaxTop}% / ${t.vat}%`}
        </span>
      </div>
      {compare && t.energyEurYear != null && compare.energyEurYear != null && (
        <div className="note">
          Keeping a home comfortable here costs about{' '}
          <b>
            {Math.round((100 * t.energyEurYear) / compare.energyEurYear)}% of what it costs in{' '}
            {compare.name}
          </b>
          . Cool summers usually mean cold winters, and this is where that shows up on the bill, the €{n0(t.energyEurYear)} assumes an 80 m² home of average efficiency, so read the
          ratio rather than the absolute figure.
        </div>
      )}
      <div className="note">
        Tax and VAT are national headline rates and matter only if you actually become tax
        resident. Buying property grants neither residency nor a visa. Air quality is a{' '}
        {'~'}55 km regional background from atmospheric reanalysis, not a street-level reading.
      </div>

      <h4>Why it scored {ranked.score.toFixed(0)}</h4>
      <div className="scorebars">
        {(Object.keys(ranked.breakdown) as Array<keyof typeof ranked.breakdown>).map((k) => {
          const v = ranked.breakdown[k];
          return (
            <div className="r" key={k}>
              <span className="lbl">{LABELS[k] ?? k}</span>
              <span className="bar">
                <i style={{ width: v == null ? 0 : `${Math.max(0, Math.min(100, v * 100))}%` }} />
              </span>
              <span className="num" title={v == null ? 'not surveyed here' : undefined}>
                {v == null ? 'n/a' : (v * 100).toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="links" style={{ marginTop: 8 }}>
        <button className="chipbtn" onClick={() => onToggleFavourite(t)}>
          {isFavourite ? `Remove ${t.name} from climates you want` : `I would live in ${t.name}`}
        </button>
        <button className="chipbtn" onClick={() => onToggleAvoid(t)}>
          {filters.avoid.includes(t.id)
            ? `Un-rule-out ${t.name}`
            : `Rule ${t.name} out`}
        </button>
      </div>

      <h4>See what is for sale</h4>
      {t.country !== 'ES' && (
        <div className="note">
          These links point at Spanish portals and will not help outside Spain. For{' '}
          {t.countryName} try the local market leader. Idealista also runs Portugal and Italy;
          elsewhere SeLoger, ImmoScout24, Funda, Daft or Hemnet depending on the country.
        </div>
      )}
      <div className="links">
        {links.map((l) => (
          <a key={l.portal} href={l.url} target="_blank" rel="noreferrer">
            <span>{l.portal}</span>
            <small>
              {l.exact ? 'search' : `≤€${Math.round(filters.budget / 1000)}k · ≥${filters.minM2} m²`}
            </small>
          </a>
        ))}
      </div>
      <div className="note">
        Portal links are built from the town and province name. That matches their own convention
        almost always, but if one lands on a 404 use the plain search link at the bottom.
      </div>
    </>
  );
}
