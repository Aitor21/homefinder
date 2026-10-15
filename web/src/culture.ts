/**
 * Culture and events: what there is to DO somewhere, beyond its climate.
 *
 * Two layers, built two different ways because the facts are two different
 * shapes:
 *
 * 1. Venues. Museums, theatres, cinemas, live music and arts centres are
 *    permanent and mapped, so they come from OpenStreetMap through the
 *    `culture` pipeline stage, like shops and stations do. A dataset built
 *    before that stage existed carries none of those fields, and then the score
 *    falls back to an ESTIMATE from city size: how big the place is, and how
 *    close it sits to a city of 250,000. That is a proxy and says so on screen.
 *    It is a reasonable one, because a city of that size has a theatre and a
 *    museum with near certainty, but it cannot tell a lively small town from a
 *    sleepy one. The real counts replace it the moment the stage has run.
 *
 * 2. Events. A festival is not on any map: it is a place AND a month. So these
 *    are a curated registry below, computed in the browser like the time zones
 *    are, which means adding one needs no pipeline run. The list is the large
 *    and well-known recurring events, the ones people would plan a year around
 *    or move a little closer to. It is not exhaustive, and a town with nothing
 *    in it is "none of the big ones nearby", never "nothing happens here".
 *    Months are the usual ones and drift by a few weeks between editions.
 */
import type { Town } from './types';

export type EventKind = 'music' | 'arts' | 'film' | 'tradition';

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  music: 'Music festival',
  arts: 'Theatre, opera & arts',
  film: 'Film festival',
  tradition: 'Fiesta & tradition',
};

export const EVENT_KIND_ICON: Record<EventKind, string> = {
  music: '🎶',
  arts: '🎭',
  film: '🎬',
  tradition: '🎉',
};

export interface CulturalEvent {
  name: string;
  kind: EventKind;
  /** Where it happens: the host town, for display. */
  where: string;
  /** ISO country code. */
  cc: string;
  lat: number;
  lon: number;
  /** Usual months, 0 = January. */
  months: number[];
  /** `major` draws people from abroad; `notable` from across the country. */
  scale: 'major' | 'notable';
  note?: string;
}

type Row = [string, EventKind, string, string, number, number, number[], 'major' | 'notable', string?];

/* eslint-disable max-len */
// name, kind, where, country, lat, lon, months, scale, note
const ROWS: Row[] = [
  // --- Spain ------------------------------------------------------------------
  ['Primavera Sound', 'music', 'Barcelona', 'ES', 41.41, 2.22, [4, 5], 'major'],
  ['Sónar', 'music', 'Barcelona', 'ES', 41.37, 2.15, [5], 'major'],
  ['Grec Festival', 'arts', 'Barcelona', 'ES', 41.37, 2.16, [6], 'notable'],
  ['Cruïlla', 'music', 'Barcelona', 'ES', 41.41, 2.22, [6], 'notable'],
  ['Mad Cool', 'music', 'Madrid', 'ES', 40.42, -3.70, [6], 'major'],
  ['San Isidro', 'tradition', 'Madrid', 'ES', 40.41, -3.71, [4], 'notable'],
  ['BBK Live', 'music', 'Bilbao', 'ES', 43.26, -2.95, [6], 'major'],
  ['Aste Nagusia', 'tradition', 'Bilbao', 'ES', 43.26, -2.93, [7], 'notable'],
  ['San Sebastián Film Festival', 'film', 'San Sebastián', 'ES', 43.32, -1.98, [8], 'major'],
  ['Jazzaldia', 'music', 'San Sebastián', 'ES', 43.32, -1.98, [6], 'notable'],
  ['FIB Benicàssim', 'music', 'Benicàssim', 'ES', 40.06, 0.06, [6], 'major'],
  ['Rototom Sunsplash', 'music', 'Benicàssim', 'ES', 40.06, 0.06, [7], 'notable'],
  ['Arenal Sound', 'music', 'Burriana', 'ES', 39.89, -0.08, [6, 7], 'notable'],
  ['Medusa Festival', 'music', 'Cullera', 'ES', 39.16, -0.25, [7], 'notable'],
  ['Las Fallas', 'tradition', 'Valencia', 'ES', 39.47, -0.38, [2], 'major'],
  ['La Tomatina', 'tradition', 'Buñol', 'ES', 39.42, -0.79, [7], 'notable'],
  ['San Fermín', 'tradition', 'Pamplona', 'ES', 42.81, -1.65, [6], 'major'],
  ['Feria de Abril', 'tradition', 'Seville', 'ES', 37.38, -6.00, [3], 'major'],
  ['Semana Santa', 'tradition', 'Seville', 'ES', 37.39, -5.99, [2, 3], 'major'],
  ['Bienal de Flamenco', 'arts', 'Seville', 'ES', 37.39, -5.99, [8], 'notable', 'every other year'],
  ['Festival de Jerez', 'arts', 'Jerez de la Frontera', 'ES', 36.69, -6.13, [1, 2], 'notable'],
  ['Carnaval de Cádiz', 'tradition', 'Cádiz', 'ES', 36.53, -6.29, [1], 'notable'],
  ['Feria de Málaga', 'tradition', 'Málaga', 'ES', 36.72, -4.42, [7], 'notable'],
  ['Málaga Film Festival', 'film', 'Málaga', 'ES', 36.72, -4.42, [2], 'notable'],
  ['Starlite', 'music', 'Marbella', 'ES', 36.51, -4.88, [6, 7], 'notable'],
  ['Festival de Granada', 'arts', 'Granada', 'ES', 37.18, -3.59, [5, 6], 'notable'],
  ['Mérida Classical Theatre Festival', 'arts', 'Mérida', 'ES', 38.92, -6.34, [6, 7], 'major'],
  ['Almagro Classical Theatre Festival', 'arts', 'Almagro', 'ES', 38.89, -3.71, [6], 'notable'],
  ['Carnival of Santa Cruz', 'tradition', 'Santa Cruz de Tenerife', 'ES', 28.47, -16.25, [1], 'major'],
  ['Resurrection Fest', 'music', 'Viveiro', 'ES', 43.66, -7.59, [5, 6], 'notable'],
  ['Festival de Ortigueira', 'music', 'Ortigueira', 'ES', 43.69, -7.85, [6], 'notable'],
  ['Fiestas del Apóstol', 'tradition', 'Santiago de Compostela', 'ES', 42.88, -8.54, [6], 'notable'],
  ['Sonorama Ribera', 'music', 'Aranda de Duero', 'ES', 41.67, -3.69, [7], 'notable'],
  ['Low Festival', 'music', 'Benidorm', 'ES', 38.54, -0.13, [6], 'notable'],
  ['Festival Internacional de Santander', 'arts', 'Santander', 'ES', 43.46, -3.81, [7], 'notable'],
  ['Fiestas del Pilar', 'tradition', 'Zaragoza', 'ES', 41.65, -0.88, [9], 'notable'],
  ['Moros y Cristianos', 'tradition', 'Alcoy', 'ES', 38.70, -0.47, [3], 'notable'],
  ['Fira Tàrrega', 'arts', 'Tàrrega', 'ES', 41.65, 1.14, [8], 'notable'],
  ['Sitges Film Festival', 'film', 'Sitges', 'ES', 41.24, 1.81, [9], 'notable'],
  // --- Portugal ---------------------------------------------------------------
  ['NOS Alive', 'music', 'Oeiras', 'PT', 38.70, -9.23, [6], 'major'],
  ['Festas de Lisboa', 'tradition', 'Lisbon', 'PT', 38.71, -9.13, [5], 'notable'],
  ['Primavera Sound Porto', 'music', 'Porto', 'PT', 41.17, -8.68, [5], 'notable'],
  ['São João', 'tradition', 'Porto', 'PT', 41.15, -8.61, [5], 'notable'],
  ['MEO Sudoeste', 'music', 'Zambujeira do Mar', 'PT', 37.53, -8.79, [7], 'notable'],
  ['Paredes de Coura', 'music', 'Paredes de Coura', 'PT', 41.91, -8.56, [7], 'notable'],
  // --- France -----------------------------------------------------------------
  ['Festival d’Avignon', 'arts', 'Avignon', 'FR', 43.95, 4.81, [6], 'major'],
  ['Cannes Film Festival', 'film', 'Cannes', 'FR', 43.55, 7.02, [4], 'major'],
  ['Festival d’Aix-en-Provence', 'arts', 'Aix-en-Provence', 'FR', 43.53, 5.45, [6], 'major'],
  ['Chorégies d’Orange', 'arts', 'Orange', 'FR', 44.14, 4.81, [5, 6, 7], 'notable'],
  ['Nice Carnival', 'tradition', 'Nice', 'FR', 43.70, 7.27, [1], 'major'],
  ['Jazz à Juan', 'music', 'Antibes', 'FR', 43.57, 7.11, [6], 'notable'],
  ['Fête des Lumières', 'tradition', 'Lyon', 'FR', 45.76, 4.83, [11], 'major'],
  ['Les Nuits de Fourvière', 'arts', 'Lyon', 'FR', 45.76, 4.82, [5, 6], 'notable'],
  ['Nuit Blanche', 'arts', 'Paris', 'FR', 48.86, 2.35, [9], 'notable'],
  ['Rock en Seine', 'music', 'Saint-Cloud', 'FR', 48.84, 2.22, [7], 'notable'],
  ['Hellfest', 'music', 'Clisson', 'FR', 47.09, -1.28, [5], 'major'],
  ['Les Vieilles Charrues', 'music', 'Carhaix-Plouguer', 'FR', 48.28, -3.57, [6], 'major'],
  ['Festival Interceltique', 'music', 'Lorient', 'FR', 47.75, -3.37, [7], 'major'],
  ['Les Francofolies', 'music', 'La Rochelle', 'FR', 46.16, -1.15, [6], 'notable'],
  ['Jazz in Marciac', 'music', 'Marciac', 'FR', 43.53, 0.16, [6, 7], 'notable'],
  ['Les Eurockéennes', 'music', 'Belfort', 'FR', 47.67, 6.83, [6], 'notable'],
  ['Fêtes de Bayonne', 'tradition', 'Bayonne', 'FR', 43.49, -1.47, [6, 7], 'notable'],
  ['Angoulême Comics Festival', 'arts', 'Angoulême', 'FR', 45.65, 0.16, [0], 'notable'],
  ['Annecy Animation Festival', 'film', 'Annecy', 'FR', 45.90, 6.13, [5], 'notable'],
  ['Christmas market', 'tradition', 'Strasbourg', 'FR', 48.58, 7.75, [10, 11], 'notable'],
  // --- United Kingdom and Ireland --------------------------------------------
  ['Glastonbury', 'music', 'Pilton', 'GB', 51.16, -2.59, [5], 'major', 'takes a fallow year every few years'],
  ['Edinburgh Festival Fringe', 'arts', 'Edinburgh', 'GB', 55.95, -3.19, [7], 'major'],
  ['Edinburgh’s Hogmanay', 'tradition', 'Edinburgh', 'GB', 55.95, -3.19, [11], 'notable'],
  ['BBC Proms', 'arts', 'London', 'GB', 51.50, -0.18, [6, 7, 8], 'major'],
  ['Notting Hill Carnival', 'tradition', 'London', 'GB', 51.51, -0.20, [7], 'major'],
  ['Reading Festival', 'music', 'Reading', 'GB', 51.46, -0.99, [7], 'major'],
  ['Leeds Festival', 'music', 'Bramham', 'GB', 53.87, -1.38, [7], 'notable'],
  ['Download Festival', 'music', 'Castle Donington', 'GB', 52.83, -1.38, [5], 'notable'],
  ['Isle of Wight Festival', 'music', 'Newport', 'GB', 50.70, -1.29, [5], 'notable'],
  ['Boomtown', 'music', 'Winchester', 'GB', 51.10, -1.25, [7], 'notable'],
  ['TRNSMT', 'music', 'Glasgow', 'GB', 55.85, -4.24, [6], 'notable'],
  ['Glyndebourne', 'arts', 'Lewes', 'GB', 50.88, 0.06, [4, 5, 6, 7], 'notable'],
  ['Hay Festival', 'arts', 'Hay-on-Wye', 'GB', 52.07, -3.13, [4, 5], 'notable'],
  ['Electric Picnic', 'music', 'Stradbally', 'IE', 53.01, -7.15, [7, 8], 'major'],
  ['St Patrick’s Festival', 'tradition', 'Dublin', 'IE', 53.35, -6.26, [2], 'major'],
  ['Galway International Arts Festival', 'arts', 'Galway', 'IE', 53.27, -9.06, [6], 'notable'],
  ['Cork Jazz Festival', 'music', 'Cork', 'IE', 51.90, -8.47, [9], 'notable'],
  ['Wexford Festival Opera', 'arts', 'Wexford', 'IE', 52.34, -6.46, [9, 10], 'notable'],
  // --- Benelux ----------------------------------------------------------------
  ['Tomorrowland', 'music', 'Boom', 'BE', 51.09, 4.38, [6], 'major'],
  ['Rock Werchter', 'music', 'Werchter', 'BE', 50.97, 4.70, [6], 'major'],
  ['Pukkelpop', 'music', 'Hasselt', 'BE', 50.96, 5.36, [7], 'notable'],
  ['Graspop Metal Meeting', 'music', 'Dessel', 'BE', 51.24, 5.11, [5], 'notable'],
  ['Gentse Feesten', 'tradition', 'Ghent', 'BE', 51.05, 3.72, [6], 'major'],
  ['Lowlands', 'music', 'Biddinghuizen', 'NL', 52.44, 5.71, [7], 'major'],
  ['Pinkpop', 'music', 'Landgraaf', 'NL', 50.90, 6.03, [5], 'notable'],
  ['North Sea Jazz', 'music', 'Rotterdam', 'NL', 51.88, 4.49, [6], 'notable'],
  ['Amsterdam Dance Event', 'music', 'Amsterdam', 'NL', 52.37, 4.90, [9], 'major'],
  ['King’s Day', 'tradition', 'Amsterdam', 'NL', 52.37, 4.90, [3], 'notable'],
  ['Holland Festival', 'arts', 'Amsterdam', 'NL', 52.37, 4.90, [5], 'notable'],
  ['Carnival', 'tradition', 'Maastricht', 'NL', 50.85, 5.69, [1, 2], 'notable'],
  // --- Germany ----------------------------------------------------------------
  ['Oktoberfest', 'tradition', 'Munich', 'DE', 48.13, 11.55, [8, 9], 'major'],
  ['Berlinale', 'film', 'Berlin', 'DE', 52.51, 13.37, [1], 'major'],
  ['Lollapalooza Berlin', 'music', 'Berlin', 'DE', 52.51, 13.24, [8], 'notable'],
  ['Wacken Open Air', 'music', 'Wacken', 'DE', 54.02, 9.37, [7], 'major'],
  ['Rock am Ring', 'music', 'Nürburg', 'DE', 50.34, 6.95, [5], 'major'],
  ['Rock im Park', 'music', 'Nuremberg', 'DE', 49.43, 11.12, [5], 'notable'],
  ['Christkindlesmarkt', 'tradition', 'Nuremberg', 'DE', 49.45, 11.08, [10, 11], 'notable'],
  ['Hurricane Festival', 'music', 'Scheeßel', 'DE', 53.17, 9.48, [5], 'notable'],
  ['Southside Festival', 'music', 'Neuhausen ob Eck', 'DE', 47.97, 8.92, [5], 'notable'],
  ['Fusion Festival', 'music', 'Lärz', 'DE', 53.30, 12.75, [5, 6], 'notable'],
  ['Parookaville', 'music', 'Weeze', 'DE', 51.60, 6.15, [6], 'notable'],
  ['Bayreuth Festival', 'arts', 'Bayreuth', 'DE', 49.96, 11.58, [6, 7], 'major'],
  ['Cologne Carnival', 'tradition', 'Cologne', 'DE', 50.94, 6.96, [1, 2], 'major'],
  ['Cannstatter Volksfest', 'tradition', 'Stuttgart', 'DE', 48.80, 9.22, [8, 9], 'notable'],
  ['Kiel Week', 'tradition', 'Kiel', 'DE', 54.32, 10.13, [5], 'notable'],
  ['Frankfurt Book Fair', 'arts', 'Frankfurt', 'DE', 50.11, 8.65, [9], 'notable'],
  ['Beethovenfest', 'arts', 'Bonn', 'DE', 50.73, 7.10, [8], 'notable'],
  ['Bachfest', 'arts', 'Leipzig', 'DE', 51.34, 12.37, [5], 'notable'],
  // --- Alps -------------------------------------------------------------------
  ['Salzburg Festival', 'arts', 'Salzburg', 'AT', 47.80, 13.04, [6, 7], 'major'],
  ['Bregenz Festival', 'arts', 'Bregenz', 'AT', 47.50, 9.74, [6, 7], 'major'],
  ['Donauinselfest', 'music', 'Vienna', 'AT', 48.23, 16.41, [5], 'major'],
  ['Wiener Festwochen', 'arts', 'Vienna', 'AT', 48.21, 16.37, [4, 5], 'notable'],
  ['Nova Rock', 'music', 'Nickelsdorf', 'AT', 47.94, 17.07, [5], 'notable'],
  ['FM4 Frequency', 'music', 'St. Pölten', 'AT', 48.20, 15.63, [7], 'notable'],
  ['Montreux Jazz Festival', 'music', 'Montreux', 'CH', 46.43, 6.91, [6], 'major'],
  ['Paléo Festival', 'music', 'Nyon', 'CH', 46.39, 6.22, [6], 'major'],
  ['Locarno Film Festival', 'film', 'Locarno', 'CH', 46.17, 8.80, [7], 'major'],
  ['Lucerne Festival', 'arts', 'Lucerne', 'CH', 47.05, 8.31, [7, 8], 'major'],
  ['Basel Fasnacht', 'tradition', 'Basel', 'CH', 47.56, 7.59, [1, 2], 'major'],
  ['Art Basel', 'arts', 'Basel', 'CH', 47.56, 7.60, [5], 'major'],
  ['Street Parade', 'music', 'Zurich', 'CH', 47.36, 8.54, [7], 'major'],
  ['Verbier Festival', 'arts', 'Verbier', 'CH', 46.10, 7.23, [6], 'notable'],
  ['Gurtenfestival', 'music', 'Bern', 'CH', 46.92, 7.44, [6], 'notable'],
  ['OpenAir St. Gallen', 'music', 'St. Gallen', 'CH', 47.43, 9.40, [5], 'notable'],
  // --- Italy ------------------------------------------------------------------
  ['Venice Film Festival', 'film', 'Venice', 'IT', 45.41, 12.37, [7, 8], 'major'],
  ['Venice Biennale', 'arts', 'Venice', 'IT', 45.43, 12.36, [4, 5, 6, 7, 8, 9, 10], 'major', 'art and architecture in alternate years'],
  ['Venice Carnival', 'tradition', 'Venice', 'IT', 45.44, 12.34, [1], 'major'],
  ['Arena di Verona Opera Festival', 'arts', 'Verona', 'IT', 45.44, 10.99, [5, 6, 7, 8], 'major'],
  ['Sanremo Music Festival', 'music', 'Sanremo', 'IT', 43.82, 7.78, [1], 'major'],
  ['Umbria Jazz', 'music', 'Perugia', 'IT', 43.11, 12.39, [6], 'major'],
  ['Palio di Siena', 'tradition', 'Siena', 'IT', 43.32, 11.33, [6, 7], 'major'],
  ['Festival dei Due Mondi', 'arts', 'Spoleto', 'IT', 42.73, 12.74, [5, 6], 'notable'],
  ['Ravenna Festival', 'arts', 'Ravenna', 'IT', 44.42, 12.20, [5, 6], 'notable'],
  ['Rossini Opera Festival', 'arts', 'Pesaro', 'IT', 43.91, 12.91, [7], 'notable'],
  ['Taormina Arte', 'arts', 'Taormina', 'IT', 37.85, 15.29, [5, 6, 7], 'notable'],
  ['Lucca Comics & Games', 'arts', 'Lucca', 'IT', 43.84, 10.50, [9, 10], 'major'],
  ['Lucca Summer Festival', 'music', 'Lucca', 'IT', 43.84, 10.50, [6], 'notable'],
  ['Viareggio Carnival', 'tradition', 'Viareggio', 'IT', 43.87, 10.25, [1], 'notable'],
  ['Battle of the Oranges', 'tradition', 'Ivrea', 'IT', 45.47, 7.88, [1], 'notable'],
  ['Milan Design Week', 'arts', 'Milan', 'IT', 45.46, 9.19, [3], 'major'],
  ['Rome Film Fest', 'film', 'Rome', 'IT', 41.93, 12.47, [9], 'notable'],
  ['Salone del Libro', 'arts', 'Turin', 'IT', 45.03, 7.66, [4], 'notable'],
  ['Kappa FuturFestival', 'music', 'Turin', 'IT', 45.03, 7.65, [6], 'notable'],
  ['Maggio Musicale Fiorentino', 'arts', 'Florence', 'IT', 43.77, 11.25, [4, 5], 'notable'],
  ['La Notte della Taranta', 'music', 'Melpignano', 'IT', 40.16, 18.29, [7], 'notable'],
  ['Festa di Sant’Agata', 'tradition', 'Catania', 'IT', 37.50, 15.09, [1], 'notable'],
  // --- Nordics and the Baltics -----------------------------------------------
  ['Roskilde Festival', 'music', 'Roskilde', 'DK', 55.62, 12.08, [5, 6], 'major'],
  ['Copenhagen Jazz Festival', 'music', 'Copenhagen', 'DK', 55.68, 12.57, [6], 'notable'],
  ['Smukfest', 'music', 'Skanderborg', 'DK', 56.03, 9.93, [7], 'notable'],
  ['Aarhus Festuge', 'arts', 'Aarhus', 'DK', 56.16, 10.20, [7, 8], 'notable'],
  ['Øya', 'music', 'Oslo', 'NO', 59.91, 10.76, [7], 'notable'],
  ['Bergen International Festival', 'arts', 'Bergen', 'NO', 60.39, 5.32, [4, 5], 'notable'],
  ['Tromsø International Film Festival', 'film', 'Tromsø', 'NO', 69.65, 18.96, [0], 'notable'],
  ['Way Out West', 'music', 'Gothenburg', 'SE', 57.69, 11.95, [7], 'notable'],
  ['Göteborg Film Festival', 'film', 'Gothenburg', 'SE', 57.71, 11.97, [0, 1], 'notable'],
  ['Sweden Rock Festival', 'music', 'Sölvesborg', 'SE', 56.05, 14.58, [5], 'notable'],
  ['Flow Festival', 'music', 'Helsinki', 'FI', 60.19, 24.98, [7], 'notable'],
  ['Ruisrock', 'music', 'Turku', 'FI', 60.43, 22.17, [6], 'notable'],
  ['Pori Jazz', 'music', 'Pori', 'FI', 61.49, 21.79, [6], 'notable'],
  ['Savonlinna Opera Festival', 'arts', 'Savonlinna', 'FI', 61.86, 28.90, [6], 'major'],
  ['Kaustinen Folk Music Festival', 'music', 'Kaustinen', 'FI', 63.55, 23.69, [6], 'notable'],
  ['Iceland Airwaves', 'music', 'Reykjavik', 'IS', 64.15, -21.94, [10], 'notable'],
  ['Black Nights Film Festival', 'film', 'Tallinn', 'EE', 59.44, 24.75, [10], 'notable'],
  // --- Central and eastern Europe --------------------------------------------
  ['Sziget', 'music', 'Budapest', 'HU', 47.55, 19.05, [7], 'major'],
  ['EXIT', 'music', 'Novi Sad', 'RS', 45.25, 19.86, [6], 'major'],
  ['Open’er', 'music', 'Gdynia', 'PL', 54.53, 18.48, [6], 'major'],
  ['Unsound', 'music', 'Kraków', 'PL', 50.06, 19.94, [9], 'notable'],
  ['Colours of Ostrava', 'music', 'Ostrava', 'CZ', 49.82, 18.29, [6], 'major'],
  ['Karlovy Vary Film Festival', 'film', 'Karlovy Vary', 'CZ', 50.23, 12.87, [6], 'major'],
  ['Prague Spring', 'arts', 'Prague', 'CZ', 50.09, 14.41, [4, 5], 'notable'],
  ['Pohoda', 'music', 'Trenčín', 'SK', 48.88, 18.03, [6], 'notable'],
  ['UNTOLD', 'music', 'Cluj-Napoca', 'RO', 46.77, 23.57, [7], 'major'],
  ['Electric Castle', 'music', 'Bonțida', 'RO', 46.91, 23.81, [6], 'notable'],
  ['Neversea', 'music', 'Constanța', 'RO', 44.21, 28.65, [6], 'notable'],
  ['Ljubljana Festival', 'arts', 'Ljubljana', 'SI', 46.05, 14.51, [5, 6, 7], 'notable'],
  ['INmusic', 'music', 'Zagreb', 'HR', 45.78, 15.93, [5], 'notable'],
  ['Dubrovnik Summer Festival', 'arts', 'Dubrovnik', 'HR', 42.64, 18.11, [6, 7], 'notable'],
  ['Ultra Europe', 'music', 'Split', 'HR', 43.52, 16.45, [6], 'notable'],
  ['Pula Film Festival', 'film', 'Pula', 'HR', 44.87, 13.85, [6], 'notable'],
  ['Athens Epidaurus Festival', 'arts', 'Athens', 'GR', 37.97, 23.72, [5, 6, 7], 'major'],
  ['Thessaloniki Film Festival', 'film', 'Thessaloniki', 'GR', 40.63, 22.94, [10], 'notable'],
  ['Istanbul Music Festival', 'arts', 'Istanbul', 'TR', 41.04, 28.99, [5], 'notable'],
  ['Istanbul Film Festival', 'film', 'Istanbul', 'TR', 41.04, 28.99, [3], 'notable'],
  ['Tbilisoba', 'tradition', 'Tbilisi', 'GE', 41.69, 44.80, [9], 'notable'],
  // --- Asia -------------------------------------------------------------------
  ['Fuji Rock Festival', 'music', 'Yuzawa', 'JP', 36.79, 138.78, [6], 'major'],
  ['Summer Sonic', 'music', 'Chiba', 'JP', 35.65, 140.04, [7], 'major'],
  ['Summer Sonic Osaka', 'music', 'Osaka', 'JP', 34.66, 135.43, [7], 'notable'],
  ['Tenjin Matsuri', 'tradition', 'Osaka', 'JP', 34.69, 135.51, [6], 'notable'],
  ['Gion Matsuri', 'tradition', 'Kyoto', 'JP', 35.00, 135.76, [6], 'major'],
  ['Sapporo Snow Festival', 'tradition', 'Sapporo', 'JP', 43.06, 141.35, [1], 'major'],
  ['Rising Sun Rock Festival', 'music', 'Ishikari', 'JP', 43.17, 141.32, [7], 'notable'],
  ['Nebuta Matsuri', 'tradition', 'Aomori', 'JP', 40.82, 140.74, [7], 'notable'],
  ['Awa Odori', 'tradition', 'Tokushima', 'JP', 34.07, 134.55, [7], 'notable'],
  ['Takayama Festival', 'tradition', 'Takayama', 'JP', 36.15, 137.25, [3, 9], 'notable'],
  ['Sanja Matsuri', 'tradition', 'Tokyo', 'JP', 35.71, 139.80, [4], 'notable'],
  ['Tokyo International Film Festival', 'film', 'Tokyo', 'JP', 35.66, 139.73, [9, 10], 'notable'],
  ['Busan International Film Festival', 'film', 'Busan', 'KR', 35.17, 129.13, [9], 'major'],
  ['Boryeong Mud Festival', 'tradition', 'Boryeong', 'KR', 36.31, 126.51, [6], 'notable'],
  ['Jinju Lantern Festival', 'tradition', 'Jinju', 'KR', 35.19, 128.08, [9], 'notable'],
  ['Taipei Lantern Festival', 'tradition', 'Taipei', 'TW', 25.04, 121.56, [1], 'notable'],
  ['Songkran', 'tradition', 'Chiang Mai', 'TH', 18.79, 98.99, [3], 'major'],
  ['Yi Peng', 'tradition', 'Chiang Mai', 'TH', 18.79, 98.99, [10], 'major'],
  ['Art Basel Hong Kong', 'arts', 'Hong Kong', 'HK', 22.28, 114.17, [2], 'major'],
  ['Harbin Ice and Snow Festival', 'tradition', 'Harbin', 'CN', 45.78, 126.58, [0, 1], 'major'],
  ['Shanghai International Film Festival', 'film', 'Shanghai', 'CN', 31.23, 121.47, [5], 'notable'],
  ['Jaipur Literature Festival', 'arts', 'Jaipur', 'IN', 26.91, 75.79, [0], 'major'],
  ['Durga Puja', 'tradition', 'Kolkata', 'IN', 22.57, 88.36, [9], 'major'],
  ['Pushkar Camel Fair', 'tradition', 'Pushkar', 'IN', 26.49, 74.55, [10], 'notable'],
  ['Sunburn', 'music', 'Goa', 'IN', 15.50, 73.83, [11], 'notable'],
  ['Bali Arts Festival', 'arts', 'Denpasar', 'ID', -8.66, 115.22, [5, 6], 'notable'],
  ['Ubud Writers & Readers Festival', 'arts', 'Ubud', 'ID', -8.51, 115.26, [9], 'notable'],
  ['Java Jazz', 'music', 'Jakarta', 'ID', -6.15, 106.85, [1, 2], 'notable'],
  ['Sinulog', 'tradition', 'Cebu', 'PH', 10.31, 123.89, [0], 'major'],
  ['Ati-Atihan', 'tradition', 'Kalibo', 'PH', 11.71, 122.36, [0], 'notable'],
  ['MassKara', 'tradition', 'Bacolod', 'PH', 10.68, 122.95, [9], 'notable'],
  ['Rainforest World Music Festival', 'music', 'Kuching', 'MY', 1.55, 110.35, [5, 6], 'notable'],
  ['George Town Festival', 'arts', 'George Town', 'MY', 5.41, 100.33, [6], 'notable'],
  // --- North America ----------------------------------------------------------
  ['Coachella', 'music', 'Indio', 'US', 33.68, -116.24, [3], 'major'],
  ['Stagecoach', 'music', 'Indio', 'US', 33.68, -116.24, [3], 'notable'],
  ['Lollapalooza', 'music', 'Chicago', 'US', 41.87, -87.62, [7], 'major'],
  ['Summerfest', 'music', 'Milwaukee', 'US', 43.03, -87.90, [5, 6], 'major'],
  ['SXSW', 'music', 'Austin', 'US', 30.26, -97.74, [2], 'major'],
  ['Austin City Limits', 'music', 'Austin', 'US', 30.27, -97.77, [9], 'major'],
  ['New Orleans Jazz & Heritage Festival', 'music', 'New Orleans', 'US', 29.99, -90.08, [3, 4], 'major'],
  ['Mardi Gras', 'tradition', 'New Orleans', 'US', 29.95, -90.07, [1, 2], 'major'],
  ['Bonnaroo', 'music', 'Manchester, Tennessee', 'US', 35.48, -86.09, [5], 'major'],
  ['Electric Daisy Carnival', 'music', 'Las Vegas', 'US', 36.27, -115.01, [4], 'major'],
  ['Ultra Music Festival', 'music', 'Miami', 'US', 25.78, -80.19, [2], 'major'],
  ['Art Basel Miami Beach', 'arts', 'Miami Beach', 'US', 25.79, -80.13, [11], 'major'],
  ['Outside Lands', 'music', 'San Francisco', 'US', 37.77, -122.49, [7], 'notable'],
  ['Bumbershoot', 'music', 'Seattle', 'US', 47.62, -122.35, [8], 'notable'],
  ['Portland Rose Festival', 'tradition', 'Portland', 'US', 45.52, -122.68, [5], 'notable'],
  ['Oregon Shakespeare Festival', 'arts', 'Ashland', 'US', 42.19, -122.71, [2, 3, 4, 5, 6, 7, 8, 9], 'notable'],
  ['Burning Man', 'arts', 'Black Rock City', 'US', 40.79, -119.21, [7, 8], 'major'],
  ['Sundance Film Festival', 'film', 'Boulder', 'US', 40.02, -105.27, [0], 'major', 'in Boulder from 2027, after four decades in Park City'],
  ['Telluride Film Festival', 'film', 'Telluride', 'US', 37.94, -107.81, [8], 'notable'],
  ['Santa Fe Opera', 'arts', 'Santa Fe', 'US', 35.76, -105.95, [6, 7], 'notable'],
  ['Albuquerque Balloon Fiesta', 'tradition', 'Albuquerque', 'US', 35.20, -106.60, [9], 'major'],
  ['Tanglewood', 'arts', 'Lenox', 'US', 42.35, -73.31, [6, 7], 'major'],
  ['Newport Folk & Jazz Festivals', 'music', 'Newport', 'US', 41.48, -71.34, [6, 7], 'notable'],
  ['Tribeca Festival', 'film', 'New York', 'US', 40.72, -74.01, [5], 'notable'],
  ['Governors Ball', 'music', 'New York', 'US', 40.74, -73.84, [5], 'notable'],
  ['Merrie Monarch Festival', 'tradition', 'Hilo', 'US', 19.72, -155.08, [3], 'notable'],
  ['Montreal International Jazz Festival', 'music', 'Montreal', 'CA', 45.51, -73.57, [5, 6], 'major'],
  ['Osheaga', 'music', 'Montreal', 'CA', 45.51, -73.53, [7], 'major'],
  ['Just for Laughs', 'arts', 'Montreal', 'CA', 45.51, -73.57, [6], 'notable'],
  ['Toronto International Film Festival', 'film', 'Toronto', 'CA', 43.65, -79.39, [8], 'major'],
  ['Calgary Stampede', 'tradition', 'Calgary', 'CA', 51.04, -114.05, [6], 'major'],
  ['Quebec Winter Carnival', 'tradition', 'Quebec City', 'CA', 46.81, -71.21, [1], 'major'],
  ['Festival d’été de Québec', 'music', 'Quebec City', 'CA', 46.81, -71.22, [6], 'major'],
  ['Stratford Festival', 'arts', 'Stratford', 'CA', 43.37, -80.98, [3, 4, 5, 6, 7, 8, 9], 'major'],
  ['Shaw Festival', 'arts', 'Niagara-on-the-Lake', 'CA', 43.26, -79.07, [3, 4, 5, 6, 7, 8, 9], 'notable'],
  ['Vancouver Folk Music Festival', 'music', 'Vancouver', 'CA', 49.27, -123.26, [6], 'notable'],
  // --- Mexico, Central America and the Caribbean -----------------------------
  ['Día de Muertos', 'tradition', 'Oaxaca', 'MX', 17.06, -96.73, [9, 10], 'major'],
  ['Guelaguetza', 'tradition', 'Oaxaca', 'MX', 17.07, -96.73, [6], 'major'],
  ['Festival Internacional Cervantino', 'arts', 'Guanajuato', 'MX', 21.02, -101.26, [9], 'major'],
  ['Vive Latino', 'music', 'Mexico City', 'MX', 19.41, -99.09, [2], 'major'],
  ['Guadalajara International Book Fair', 'arts', 'Guadalajara', 'MX', 20.65, -103.39, [10, 11], 'major'],
  ['Guadalajara International Film Festival', 'film', 'Guadalajara', 'MX', 20.67, -103.35, [5], 'notable'],
  ['Carnaval de Veracruz', 'tradition', 'Veracruz', 'MX', 19.17, -96.13, [1], 'notable'],
  ['Carnaval de Mazatlán', 'tradition', 'Mazatlán', 'MX', 23.22, -106.42, [1], 'notable'],
  ['Carnaval de Las Tablas', 'tradition', 'Las Tablas', 'PA', 7.76, -80.27, [1], 'notable'],
  ['Trinidad Carnival', 'tradition', 'Port of Spain', 'TT', 10.66, -61.51, [1], 'major'],
  ['Crop Over', 'tradition', 'Bridgetown', 'BB', 13.10, -59.61, [6, 7], 'notable'],
  ['Reggae Sumfest', 'music', 'Montego Bay', 'JM', 18.47, -77.92, [6], 'notable'],
  // --- South America ----------------------------------------------------------
  ['Carnaval de Barranquilla', 'tradition', 'Barranquilla', 'CO', 10.98, -74.80, [1, 2], 'major'],
  ['Feria de las Flores', 'tradition', 'Medellín', 'CO', 6.25, -75.57, [7], 'major'],
  ['Feria de Cali', 'tradition', 'Cali', 'CO', 3.45, -76.53, [11], 'notable'],
  ['Hay Festival Cartagena', 'arts', 'Cartagena', 'CO', 10.42, -75.55, [0], 'notable'],
  ['Festival Estéreo Picnic', 'music', 'Bogotá', 'CO', 4.71, -74.07, [2, 3], 'notable'],
  ['Fiestas de Quito', 'tradition', 'Quito', 'EC', -0.18, -78.47, [11], 'notable'],
  ['Inti Raymi', 'tradition', 'Cusco', 'PE', -13.53, -71.97, [5], 'major'],
  ['Carnaval de Oruro', 'tradition', 'Oruro', 'BO', -17.97, -67.11, [1], 'major'],
  ['Rio Carnival', 'tradition', 'Rio de Janeiro', 'BR', -22.91, -43.20, [1, 2], 'major'],
  ['Salvador Carnival', 'tradition', 'Salvador', 'BR', -12.98, -38.51, [1, 2], 'major'],
  ['Carnival of Recife and Olinda', 'tradition', 'Olinda', 'BR', -8.01, -34.85, [1, 2], 'notable'],
  ['Parintins Folklore Festival', 'tradition', 'Parintins', 'BR', -2.63, -56.74, [5], 'notable'],
  ['São João de Campina Grande', 'tradition', 'Campina Grande', 'BR', -7.23, -35.88, [5], 'notable'],
  ['Virada Cultural', 'arts', 'São Paulo', 'BR', -23.55, -46.63, [4], 'notable'],
  ['Lollapalooza Brasil', 'music', 'São Paulo', 'BR', -23.70, -46.70, [2], 'notable'],
  ['Festival de Curitiba', 'arts', 'Curitiba', 'BR', -25.43, -49.27, [2, 3], 'notable'],
  ['Gramado Film Festival', 'film', 'Gramado', 'BR', -29.38, -50.87, [7], 'notable'],
  ['FLIP', 'arts', 'Paraty', 'BR', -23.22, -44.71, [6], 'notable'],
  ['Oktoberfest Blumenau', 'tradition', 'Blumenau', 'BR', -26.92, -49.07, [9], 'notable'],
  ['Vendimia', 'tradition', 'Mendoza', 'AR', -32.89, -68.85, [1, 2], 'major'],
  ['Buenos Aires Tango Festival', 'music', 'Buenos Aires', 'AR', -34.60, -58.38, [7], 'major'],
  ['Lollapalooza Argentina', 'music', 'Buenos Aires', 'AR', -34.47, -58.53, [2], 'notable'],
  ['Cosquín Folk Festival', 'music', 'Cosquín', 'AR', -31.25, -64.47, [0], 'notable'],
  ['Fiesta Nacional de la Nieve', 'tradition', 'San Carlos de Bariloche', 'AR', -41.13, -71.31, [7], 'notable'],
  ['Viña del Mar International Song Festival', 'music', 'Viña del Mar', 'CL', -33.02, -71.55, [1], 'major'],
  ['Santiago a Mil', 'arts', 'Santiago', 'CL', -33.45, -70.66, [0], 'major'],
  ['Lollapalooza Chile', 'music', 'Santiago', 'CL', -33.46, -70.66, [2], 'notable'],
  ['Montevideo Carnival', 'tradition', 'Montevideo', 'UY', -34.90, -56.16, [0, 1], 'major', 'the longest carnival in the world, about forty days'],
  // --- Africa -----------------------------------------------------------------
  ['Gnaoua World Music Festival', 'music', 'Essaouira', 'MA', 31.51, -9.77, [5], 'major'],
  ['Mawazine', 'music', 'Rabat', 'MA', 34.02, -6.84, [5], 'major'],
  ['Fes Festival of World Sacred Music', 'arts', 'Fes', 'MA', 34.03, -5.00, [4, 5], 'notable'],
  ['Marrakech International Film Festival', 'film', 'Marrakesh', 'MA', 31.63, -8.01, [10, 11], 'notable'],
  ['Carthage International Festival', 'arts', 'Carthage', 'TN', 36.85, 10.33, [6, 7], 'notable'],
  ['El Gouna Film Festival', 'film', 'El Gouna', 'EG', 27.39, 33.68, [9], 'notable'],
  ['Timkat', 'tradition', 'Gondar', 'ET', 12.60, 37.47, [0], 'major'],
  ['Meskel', 'tradition', 'Addis Ababa', 'ET', 9.01, 38.76, [8], 'major'],
  ['Lamu Cultural Festival', 'tradition', 'Lamu', 'KE', -2.27, 40.90, [10], 'notable'],
  ['Sauti za Busara', 'music', 'Zanzibar City', 'TZ', -6.16, 39.19, [1], 'notable'],
  ['Chale Wote Street Art Festival', 'arts', 'Accra', 'GH', 5.53, -0.21, [7], 'notable'],
  ['National Arts Festival', 'arts', 'Makhanda', 'ZA', -33.31, 26.53, [5, 6], 'major'],
  ['Cape Town Minstrel Carnival', 'tradition', 'Cape Town', 'ZA', -33.92, 18.42, [0], 'notable'],
  ['Hermanus Whale Festival', 'tradition', 'Hermanus', 'ZA', -34.42, 19.24, [8], 'notable'],
  // --- Oceania ----------------------------------------------------------------
  ['Sydney Festival', 'arts', 'Sydney', 'AU', -33.87, 151.21, [0], 'major'],
  ['Vivid Sydney', 'arts', 'Sydney', 'AU', -33.86, 151.21, [4, 5], 'major'],
  ['Sydney Gay and Lesbian Mardi Gras', 'tradition', 'Sydney', 'AU', -33.88, 151.22, [1, 2], 'major'],
  ['Melbourne International Comedy Festival', 'arts', 'Melbourne', 'AU', -37.81, 144.97, [2, 3], 'major'],
  ['Melbourne International Film Festival', 'film', 'Melbourne', 'AU', -37.81, 144.96, [7], 'notable'],
  ['Moomba', 'tradition', 'Melbourne', 'AU', -37.82, 144.97, [2], 'notable'],
  ['Adelaide Festival and Fringe', 'arts', 'Adelaide', 'AU', -34.92, 138.60, [1, 2], 'major'],
  ['WOMADelaide', 'music', 'Adelaide', 'AU', -34.92, 138.59, [2], 'notable'],
  ['Bluesfest', 'music', 'Byron Bay', 'AU', -28.62, 153.53, [3], 'major'],
  ['Splendour in the Grass', 'music', 'Yelgun', 'AU', -28.48, 153.55, [6], 'major'],
  ['Brisbane Festival', 'arts', 'Brisbane', 'AU', -27.47, 153.02, [8], 'notable'],
  ['Woodford Folk Festival', 'music', 'Woodford', 'AU', -26.95, 152.78, [11, 0], 'notable'],
  ['Tamworth Country Music Festival', 'music', 'Tamworth', 'AU', -31.09, 150.93, [0], 'notable'],
  ['Perth Festival', 'arts', 'Perth', 'AU', -31.95, 115.86, [1, 2], 'notable'],
  ['Dark Mofo', 'arts', 'Hobart', 'AU', -42.88, 147.33, [5], 'major'],
  ['Mona Foma', 'music', 'Launceston', 'AU', -41.43, 147.14, [0], 'notable'],
  ['Rhythm and Vines', 'music', 'Gisborne', 'NZ', -38.66, 178.02, [11], 'notable'],
  ['WOMAD New Zealand', 'music', 'New Plymouth', 'NZ', -39.06, 174.08, [2], 'notable'],
  ['Auckland Arts Festival', 'arts', 'Auckland', 'NZ', -36.85, 174.76, [2], 'notable'],
  ['World of WearableArt', 'arts', 'Wellington', 'NZ', -41.29, 174.78, [8, 9], 'notable'],
  ['Queenstown Winter Festival', 'tradition', 'Queenstown', 'NZ', -45.03, 168.66, [5], 'notable'],
];
/* eslint-enable max-len */

export const EVENTS: CulturalEvent[] = ROWS.map(
  ([name, kind, where, cc, lat, lon, months, scale, note]) => ({
    name, kind, where, cc, lat, lon, months, scale, ...(note ? { note } : {}),
  }),
);

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Jun–Jul", "Feb", "Dec–Jan", or "Apr, Oct" for an event held twice a year. */
export function formatMonths(months: number[]): string {
  if (!months.length) return '';
  if (months.length === 1) return MONTH_SHORT[months[0]];
  const contiguous = months.every((m, i) => i === 0 || m === (months[i - 1] + 1) % 12);
  return contiguous
    ? `${MONTH_SHORT[months[0]]}–${MONTH_SHORT[months[months.length - 1]]}`
    : months.map((m) => MONTH_SHORT[m]).join(', ');
}

/**
 * How far counts as "within reach" for an event: an evening there and back.
 * Straight-line, so a little over an hour by road on most terrain.
 */
export const EVENT_RADIUS_KM = 100;

/** Full credit inside this distance: the festival is in town or next door. */
const EVENT_NEAR_KM = 15;

/** How much one event counts. A major one is worth almost two notable ones. */
const SCALE_WEIGHT = { major: 1, notable: 0.55 };

export interface NearbyEvent {
  event: CulturalEvent;
  km: number;
}

const R = 6371;
const rad = Math.PI / 180;

function kmBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Sorted by latitude once, so each lookup only scans a narrow band of it. */
const BY_LAT = [...EVENTS].sort((a, b) => a.lat - b.lat);

function firstAtOrAbove(lat: number): number {
  let lo = 0;
  let hi = BY_LAT.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (BY_LAT[mid].lat < lat) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Cached per town object. The scoring, the table, the taste model and the
 * detail panel all ask about the same 31,000 places, and a town never moves.
 */
const cache = new WeakMap<Town, NearbyEvent[]>();

/** Events within reach of a place, nearest first. */
export function eventsNear(t: Pick<Town, 'lat' | 'lon'> & object, radiusKm = EVENT_RADIUS_KM): NearbyEvent[] {
  const useCache = radiusKm === EVENT_RADIUS_KM;
  if (useCache) {
    const hit = cache.get(t as Town);
    if (hit) return hit;
  }
  const out: NearbyEvent[] = [];
  // A degree of latitude is 111 km everywhere, so the band is exact.
  const band = radiusKm / 111 + 0.05;
  for (let i = firstAtOrAbove(t.lat - band); i < BY_LAT.length; i++) {
    const e = BY_LAT[i];
    if (e.lat > t.lat + band) break;
    const km = kmBetween(t.lat, t.lon, e.lat, e.lon);
    if (km <= radiusKm) out.push({ event: e, km });
  }
  out.sort((a, b) => a.km - b.km);
  if (useCache) cache.set(t as Town, out);
  return out;
}

/**
 * Festivals and big events within reach, 0..1.
 *
 * Each event contributes by its scale and by how close it is, full credit
 * inside 15 km fading to nothing at 100, and the sum saturates: a city with
 * six major festivals is not six times better than one with one, it is simply
 * a place where something is always on. One major festival next door scores
 * about 0.63, three about 0.95.
 *
 * Never null: the registry covers the world. A zero means none of the large
 * recurring events listed here are within reach, which is a real if partial
 * fact, and the town panel says the list is the big ones only.
 */
export function eventsScore(t: Town, months: readonly number[] = []): number {
  let sum = 0;
  for (const { event, km } of eventsNear(t)) {
    const near = km <= EVENT_NEAR_KM ? 1 : Math.max(0, 1 - (km - EVENT_NEAR_KM) / (EVENT_RADIUS_KM - EVENT_NEAR_KM));
    // On a visit, a festival held while you are there is the point; one held
    // in another season still says something about the place, but little.
    const timing = months.length ? (onDuring(event, months) ? 1 : 0.15) : 1;
    sum += SCALE_WEIGHT[event.scale] * near * timing;
  }
  return 1 - Math.exp(-sum);
}

/** Whether an event runs in any of these months. */
export function onDuring(e: CulturalEvent, months: readonly number[]): boolean {
  return e.months.some((m) => months.includes(m));
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const norm = (v: number, lo: number, hi: number) => clamp01((v - lo) / (hi - lo));
const inv = (v: number, lo: number, hi: number) => 1 - norm(v, lo, hi);
const logNorm = (count: number, full: number) => norm(Math.log1p(count), 0, Math.log1p(full));

/**
 * Below this, a country's big towns show under a third of the venues the
 * typical country's do: the map is thin, not the culture. The same bar as
 * THIN_MAPPING in scoring.ts, kept separate so the two modules do not import
 * each other.
 */
const THIN_CULTURE = 0.35;

/** True when the OpenStreetMap culture layers are there to be read for this place. */
export function venuesSurveyed(t: Town): boolean {
  return t.cultureSurveyed === true
    && !(t.cultureMapped != null && t.cultureMapped < THIN_CULTURE)
    && t.museum15km != null && t.theatre15km != null;
}

/**
 * Venues actually counted: museums, theatres, cinemas, live music and arts
 * within 15 km. Counts are on a log scale, because the difference between no
 * theatre and one is a different life and the difference between forty and
 * forty-one is nothing.
 */
export function venueScore(t: Town): number | null {
  if (!venuesSurveyed(t)) return null;
  const parts: Array<[number, number]> = [
    [0.3, logNorm(t.museum15km ?? 0, 25)],
    [0.3, logNorm(t.theatre15km ?? 0, 12)],
    [0.25, logNorm((t.music15km ?? 0) + (t.arts15km ?? 0), 25)],
  ];
  if (t.cinemaKm != null) parts.push([0.15, inv(t.cinemaKm, 1, 25)]);
  const wsum = parts.reduce((a, [w]) => a + w, 0);
  return parts.reduce((a, [w, v]) => a + w * v, 0) / wsum;
}

/**
 * Cultural life within reach, ESTIMATED from size, for a dataset that has not
 * had the culture stage run. The best of: being a sizeable city yourself, being
 * close to a city of 250,000, or, worth less, close to one of 100,000. A
 * maximum rather than a blend, because living in a city and living twenty
 * minutes outside one both put the theatre within an evening's reach.
 */
export function cultureEstimate(t: Town): number {
  const own = norm(Math.log10(Math.max(t.pop, 1)), Math.log10(20_000), Math.log10(1_000_000));
  const big = 0.85 * inv(t.city250kKm, 5, 70);
  const mid = 0.6 * inv(t.city100kKm, 0, 35);
  return Math.max(own, big, mid);
}

/** Museums, theatres and live music within reach, 0..1: measured where it can be. */
export function cultureScore(t: Town): number {
  return venueScore(t) ?? cultureEstimate(t);
}
