import type { CountryRule, Filters, Town } from '../types';
import { OWNERSHIP_LABEL, PET_REGIME_LABEL, RESIDENCE_LABEL } from '../types';
import type { Developer } from '../types';
import { developersFor, newBuildSearch } from '../developers';
import { rebaseCost } from '../home';
import type { FilterEnv, HeldBack, Ranked } from '../scoring';
import {
  priceFor, affordableM2, bestMatch, airportDriveMin, hubDriveMin, THIN_MAPPING,
} from '../scoring';
import { formatDrive } from '../travel';
import type { GemModel } from '../gems';
import { discountPct } from '../gems';
import { portalLinks } from '../listings';
import { improvementOver, hotMonths } from '../climate';
import {
  flightHours, formatHours, formatTzGap, greatCircleKm, longestDay, shortestDay, tzGap,
} from '../clock';
import { forgivable, relaxFor, severity } from '../nearmiss';
import { DIM_LABEL, heldLabel } from './labels';
import ClimateChart from './ClimateChart';

interface Props {
  ranked: Ranked;
  /** For a near miss: where its forgiven score would land in your list. */
  wouldRank: number | null;
  /** Where it would land if simply let through the filters, score unchanged. */
  rankNow: number | null;
  filters: Filters;
  env: FilterEnv;
  gemModel: GemModel;
  /** Places the user said they liked. */
  refs: Town[];
  compare: Town | null;
  /** Per-country residence, ownership and pet rules, from the dataset meta. */
  rules?: Record<string, CountryRule>;
  /** The new-build developer registry, from the dataset meta. */
  developers?: Record<string, Developer>;
  /** Cost index of the user's own country, so money reads relative to home. */
  homeIndex?: number | null;
  homeName?: string | null;
  /** The place home distances are measured from. */
  anchor?: Town | null;
  /** The clock the user works to. */
  workTz?: string | null;
  onClose: () => void;
  /** Apply a change to the filters, from a "let it in" button. */
  onRelax: (patch: Partial<Filters>) => void;
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

/** One line of the near-miss banner, with its "let it in" button. */
function HeldRow({
  h, t, filters, env, onRelax,
}: { h: HeldBack; t: Town; filters: Filters; env: FilterEnv; onRelax: Props['onRelax'] }) {
  const patch = h.failure ? relaxFor(h.failure, t, filters, env) : null;
  const tag = h.failure
    ? (h.failure.relaxable ? (severity(h.failure) === 'close' ? 'just over' : 'not even close') : 'where you live')
    : 'far below the rest';
  return (
    <li>
      <span className={`chip ${h.failure ? (h.failure.relaxable ? severity(h.failure) : 'kind') : 'far'}`}>
        {tag}
      </span>{' '}
      {h.failure ? (
        <>
          <b>{h.failure.reason}</b>
          {h.failure.value && <>: {heldLabel(h)}</>}
        </>
      ) : (
        <>
          <b>{DIM_LABEL[h.dim!]}</b> scores {Math.round((h.value ?? 0) * 100)}/100, which a
          weight you set counts against it
        </>
      )}
      {patch && (
        <>
          {' '}
          <button className="link" onClick={() => onRelax(patch)}>
            let it in
          </button>
        </>
      )}
    </li>
  );
}

export default function TownDetail({
  ranked, wouldRank, rankNow, filters, env, gemModel, refs, compare, rules, developers, homeIndex,
  homeName, anchor, workTz, onClose, onRelax, onToggleFavourite, onToggleAvoid,
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
  const gap = tzGap(t.tz, workTz ?? null);
  const winterDay = shortestDay(t.lat);
  const homeKm =
    anchor && anchor.id !== t.id ? greatCircleKm(anchor.lat, anchor.lon, t.lat, t.lon) : null;
  const held = ranked.held ?? [];
  const thin = t.servicesMapped != null && t.servicesMapped < THIN_MAPPING;
  const vetsThin = t.vetsMapped != null && t.vetsMapped < THIN_MAPPING;

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

      {/* Why a place is not in the main list, and what it would take. */}
      {ranked.forgiven != null && held.length > 0 && (
        <div className="note nearmiss">
          <b>Near miss.</b> If what is below did not count at all, it would score{' '}
          <b>{Math.round(ranked.forgiven)}</b>
          {wouldRank != null && <>, <b>#{wouldRank}</b> in your results</>}. As things stand
          it scores {Math.round(ranked.score)}
          {rankNow != null && <>, which would put it at #{rankNow} once let through</>}.
          <ul className="heldlist">
            {held.map((h, i) => (
              <HeldRow key={i} h={h} t={t} filters={filters} env={env} onRelax={onRelax} />
            ))}
          </ul>
          <div className="subtle">
            {(() => {
              const dims = Array.from(new Set(held.map((h) => h.dim ?? h.failure?.dim)
                .filter((d): d is NonNullable<typeof d> => !!d && d !== 'summerFit')));
              return (
                <>
                  <b>Let it in</b> moves a filter just far enough for this place to pass; it does
                  not change how the place scores.
                  {dims.length > 0 && (
                    <>
                      {' '}The gap between the two scores is the weight on{' '}
                      {dims.map((d, i) => (
                        <span key={d}>
                          {i > 0 && (i === dims.length - 1 ? ' and ' : ', ')}
                          <b>{DIM_LABEL[d]}</b>
                        </span>
                      ))}
                      : lower {dims.length > 1 ? 'them' : 'it'} if that really does not matter to you, and
                      the place climbs on its own.
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
      {ranked.excluded && held.length > 0 && (
        <div className="note excluded">
          <b>Your filters leave this place out.</b>
          {rankNow != null && <> Let through, it would score {Math.round(ranked.score)}, #{rankNow} in your results.</>}
          <ul className="heldlist">
            {held.map((h, i) => (
              <HeldRow key={i} h={h} t={t} filters={filters} env={env} onRelax={onRelax} />
            ))}
          </ul>
          {held.some((h) => h.failure && !forgivable(h.failure)) && (
            <div className="subtle">
              Where you are willing to live (countries, regions, what you can buy) is never
              treated as a near miss; change those in the filter panel if you mean to.
            </div>
          )}
        </div>
      )}

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
                {onSale.label} {'→'}
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
        <span className="k">Daylight, shortest day</span>
        <span className="v">
          <span className={winterDay < 7 ? 'warnval' : ''}>{formatHours(winterDay)}</span>
        </span>
        <span className="k">Daylight, longest day</span>
        <span className="v">{formatHours(longestDay(t.lat))}</span>
        <span className="k">Rain</span>
        <span className="v">{n0(t.annualRain)} mm</span>
        <span className="k">Sun (kJ/m²/day)</span>
        <span className="v">{n0(t.solarAnnual)}</span>
      </div>

      <h4>Nature and outdoors</h4>
      <div className="kv">
        <span className="k">Protected nature</span>
        <span className="v" title="Distance to the edge of the nearest national park, protected area or nature reserve">
          {t.parkKm == null ? 'not surveyed' : t.parkKm < 1 ? 'on the doorstep' : km(t.parkKm)}
        </span>
        <span className="k">Highest ground within 25 km</span>
        <span className="v">{n0(t.maxElev25km)} m</span>
        <span className="k">Relief within 25 km</span>
        <span className="v">{n0(t.relief25km)} m</span>
        <span className="k">Sea</span>
        <span className="v">{km(t.coastKm)}</span>
        <span className="k">Nearest beach</span>
        <span className="v" title="Any mapped beach: sea, lake or river">
          {t.beachKm == null ? 'not surveyed' : `${km(t.beachKm)} (sea, lake or river)`}
        </span>
        <span className="k">Ski area</span>
        <span className="v">{t.skiKm == null ? 'not surveyed' : km(t.skiKm)}</span>
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
        <span className="k">Local time</span>
        <span className="v" title={t.tz ?? undefined}>
          <span className={gap && gap.worst <= 2 ? 'discount' : gap && gap.worst >= 6 ? 'warnval' : ''}>
            {formatTzGap(gap)}
          </span>
        </span>
        {homeKm != null && anchor && (
          <>
            <span className="k">From {anchor.name}</span>
            <span className="v">
              {n0(homeKm)} km
              {homeKm >= 400 && <>, about {formatHours(flightHours(homeKm))} flying direct</>}
            </span>
          </>
        )}
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
        {t.cycleSegments5km != null && (
          <>
            <span className="k">Bike lanes within 5 km</span>
            <span className="v">{t.cycleSegments5km}</span>
          </>
        )}
      </div>
      {t.amenitiesSurveyed === false && (
        <div className="note">
          Shops and health were not surveyed here, because the map download for this area
          failed or the place sits outside every surveyed region. <b>n/a</b> means not looked
          at, never "none there", and the score leaves those dimensions out rather than marking
          the place down for data nobody collected.
        </div>
      )}
      {thin && (
        <div className="note">
          OpenStreetMap is thinly mapped in {t.countryName}: its own large towns show far fewer
          shops than the typical country's. Long distances to a shop, pharmacy or vet here may
          mean <b>unmapped</b> rather than absent, so they are left out of the score.
        </div>
      )}

      <h4>Living with a dog</h4>
      <div className="kv">
        <span className="k">Nearest vet</span>
        <span className="v">
          {t.petsSurveyed === false || t.vetKm == null ? 'not surveyed' : km(t.vetKm)}
          {t.vet10km != null && t.vet10km > 0 && ` (${t.vet10km} within 10 km)`}
        </span>
        <span className="k">Off-lead dog park</span>
        <span className="v" title="Mapping of dog parks is patchy outside northern Europe and North America">
          {t.petsSurveyed === false || t.dogParkKm == null ? 'not surveyed' : km(t.dogParkKm)}
        </span>
        <span className="k">Days too hot to walk at midday</span>
        <span className="v" title="Days above 30 °C: dogs overheat far sooner than people do">
          <span className={t.daysOver30 > 60 ? 'warnval' : ''}>{t.daysOver30.toFixed(0)}</span>
        </span>
        <span className="k">Bringing a pet in</span>
        <span className="v">
          {rule?.pets ? (
            <span className={`pill pet-${rule.pets}`}>{PET_REGIME_LABEL[rule.pets]}</span>
          ) : (
            'not checked, ask the embassy'
          )}
        </span>
      </div>
      {vetsThin && (
        <div className="note">
          Vets are barely on the map in {t.countryName}: the distance above is to the nearest
          one that has been mapped, not necessarily the nearest that exists, so it is left out
          of the dog score here rather than counted against the place.
        </div>
      )}
      {rule?.petsNote && (
        <div className={rule.pets === 'quarantine' ? 'note own-restricted' : 'note'}>
          {rule.petsNote}
          <div className="subtle">
            For a dog or cat travelling from the EU; rules depend on where the animal comes
            from. Several countries also restrict particular breeds, the bull and mastiff types
            above all, so check before booking if yours is one of them.
          </div>
        </div>
      )}

      <h4>Running costs &amp; quality of life</h4>
      <div className="kv">
        <span className="k">Cost of living ({homeName ?? 'Spain'} = 100)</span>
        <span className="v">
          {rebaseCost(t.costIndex, homeIndex ?? null) ?? 'n/a'}
          {homeIndex != null && t.costIndex != null && (
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
              {/* A partial year is not an annual mean: say which months were
                  measured and which were estimated from neighbours. */}
              {t.pm25Months != null && t.pm25Months < 4 && (
                <span className="subtle"> · {t.pm25Months} of 4 seasons measured</span>
              )}
            </span>
          )}
        </span>
        <span className="k">Homicides per 100,000</span>
        <span className="v">
          {t.homicideRate == null ? (
            'n/a'
          ) : (
            <span className={t.homicideRate <= 1.5 ? 'discount' : t.homicideRate >= 10 ? 'warnval' : ''}>
              {t.homicideRate.toFixed(1)}
              <span className="subtle"> national, {t.homicideYear}</span>
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
          . Cool summers usually mean cold winters, and this is where that shows up on the bill:
          the €{n0(t.energyEurYear)} assumes an 80 m² home of average efficiency, so read the
          ratio rather than the absolute figure.
        </div>
      )}
      <div className="note">
        Tax and VAT are national headline rates and matter only if you actually become tax
        resident. Buying property grants neither residency nor a visa. Air quality is a{' '}
        {'~'}55 km regional background from atmospheric reanalysis, not a street-level reading.
        The homicide rate is national: it tells countries apart, not one town from the next.
      </div>

      <h4>Why it scored {ranked.score.toFixed(0)}</h4>
      <div className="scorebars">
        {(Object.keys(ranked.breakdown) as Array<keyof typeof ranked.breakdown>).map((k) => {
          const v = ranked.breakdown[k];
          const weak = held.some((h) => h.dim === k);
          return (
            <div className={weak ? 'r weak' : 'r'} key={k}>
              <span className="lbl">{DIM_LABEL[k] ?? k}</span>
              <span className="bar">
                <i style={{ width: v == null ? 0 : `${Math.max(0, Math.min(100, v * 100))}%` }} />
              </span>
              <span className="num" title={v == null ? 'not measured here' : undefined}>
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
        {t.country === 'ES'
          ? 'The first three links carry your budget and size straight through. They are built from the town and province name, which matches the portals’ own convention almost always; if one lands on a 404, use the plain search link.'
          : `These open the main property portals for ${t.countryName} with this town’s name as the search. Your budget and size do not carry through outside Spain, so set them again there.`}
      </div>
    </>
  );
}
