/**
 * Tests for the consolidated noise filter.
 * Run: npx tsx --test frontend/src/lib/noise-filter.test.mts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNoise, isJunk } from './noise-filter.ts';

// ── Junk that MUST be dropped (each with expected reason group) ──
const JUNK: [string, string][] = [
  ['Ducati Multistrada V4 Rally Bike Discount Offers in Hyderabad for July 2026', 'retail_promo'],
  ['Royal Enfield Himalayan bookings open at Bengaluru showroom', 'vehicle_model_name'],
  ['Best deals on scooters this monsoon in Chennai', 'retail_promo'],
  ['Mahindra Thar on-road price in Mumbai revealed', 'automotive_catalog'],
  ['Happy Birthday to our beloved CM! Wishing him good health', 'greetings_ceremony'],
  ['Delhi Police pays rich tribute to the departed constable', 'greetings_ceremony'],
  ['CSK vs MI: IPL match tonight at Chepauk', 'entertainment_sports'],
  ['Top 10 cafes in Indiranagar you must visit', 'lifestyle_listicle'],
  ['Constable recruitment 2026: apply online before June 30', 'jobs_exams_results'],
  ['Sensex closes 400 points higher; IT stocks rally', 'markets_finance'],
  ['Luxury 3BHK flats for sale near metro station', 'real_estate_ad'],
  ['Aaj ka rashifal: horoscope for all zodiac signs', 'astrology'],
  ['Exit poll predicts landslide in assembly election result', 'political_fluff'],
  ['New anime crossover event brings playable character to mobile game', 'gaming_anime'],
];

// ── Legit operational news that MUST survive ──
const LEGIT = [
  'Massive rally in Hyderabad against land acquisition, traffic diverted',
  'Farmers rally blocks Outer Ring Road, police deploy barricades',
  'Suzuki showroom gutted in fire at Andheri, no casualties',
  'Truck overturns on Mumbai-Pune Expressway, two killed',
  'Heavy rain warning issued for Chennai, schools closed',
  'Protest march in Delhi: Section 144 imposed near Jantar Mantar',
  'Water tanker rams two-wheeler in Kukatpally, one dead',
  'Power cut scheduled in Whitefield for maintenance work',
  'Dengue outbreak: 40 cases reported in Bengaluru this week',
  'Metro services suspended between Majestic and Yeshwanthpur',
  'Police offers reward for information on hit-and-run driver',
  'Bandh call disrupts bus services across Telangana',
];

for (const [text, expectedReason] of JUNK) {
  test(`junk dropped [${expectedReason}]: ${text.slice(0, 50)}`, () => {
    assert.equal(isJunk(text), true, `should be junk: ${text}`);
    assert.equal(isNoise(text), expectedReason);
  });
}

for (const text of LEGIT) {
  test(`legit kept: ${text.slice(0, 50)}`, () => {
    assert.equal(isJunk(text), false, `wrongly dropped: ${text} (reason: ${isNoise(text)})`);
  });
}
