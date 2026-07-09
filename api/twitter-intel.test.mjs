/**
 * Regression tests for twitter-intel relevance filters.
 * Targets the leak where greetings/ads survived via incidental
 * advisory-keyword matches ("health", "route", "mileage", "signal").
 *
 * Run: node --test api/twitter-intel.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isJunkTweet, isAdvisory, isUselessTweet, isRelevantCivic } from './twitter-intel.js';

// ── Junk that previously leaked ──

test('birthday wish mentioning health is dropped', () => {
  const t = 'Happy Birthday to our beloved CM! Wishing him good health and a long life. #HBD';
  assert.equal(isJunkTweet(t), true);
  assert.equal(isRelevantCivic(t), false);
});

test('car sale ad mentioning route/mileage is dropped', () => {
  const t = 'Buy your dream SUV today! Best mileage on any route. EMI starts at Rs 9,999. Book now!';
  assert.equal(isJunkTweet(t), true);
  assert.equal(isRelevantCivic(t), false);
});

test('festival greetings dropped', () => {
  assert.equal(isJunkTweet('Happy Diwali to all citizens! May the festival of lights bring joy.'), true);
  assert.equal(isJunkTweet('Warm wishes on Republic Day from Delhi Police family'), true);
});

test('condolence / tribute posts dropped', () => {
  assert.equal(isJunkTweet('The department pays rich tribute to the departed soul. Condolences to the family.'), true);
});

test('retail promos and giveaways dropped', () => {
  assert.equal(isJunkTweet('Flat 50% off this weekend! Use promo code SAVE50. Shop now!'), true);
  assert.equal(isJunkTweet('Contest alert! Lucky draw winners get a free gift. Download our app.'), true);
});

test('recruitment / exam notices dropped', () => {
  assert.equal(isJunkTweet('Constable recruitment 2026: apply online before June 30. Admit card released.'), true);
});

test('real estate ads dropped', () => {
  assert.equal(isJunkTweet('Luxury 3BHK flats for sale near the metro station. Book your flat today!'), true);
});

// ── Real advisories must SURVIVE ──

test('traffic diversion advisory kept', () => {
  const t = 'Traffic diversion on MG Road due to metro work. Commuters are advised to avoid the stretch till 6 PM.';
  assert.equal(isJunkTweet(t), false);
  assert.equal(isRelevantCivic(t), true);
});

test('power outage advisory kept', () => {
  const t = 'Scheduled power shutdown in Indiranagar and Domlur on Friday 10am-4pm for maintenance work.';
  assert.equal(isRelevantCivic(t), true);
});

test('protest/bandh advisory kept', () => {
  const t = 'Section 144 imposed near Town Hall ahead of planned rally. Police barricades in place, avoid the area.';
  assert.equal(isRelevantCivic(t), true);
});

test('waterlogging alert kept', () => {
  const t = 'Heavy rain: waterlogging reported at Silk Board junction, traffic moving slowly. Take alternate routes.';
  assert.equal(isRelevantCivic(t), true);
});

test('accident report kept (not blocked by car-ad patterns)', () => {
  const t = 'Accident on NICE Road involving a truck and two cars. One lane closed, expect delays.';
  assert.equal(isJunkTweet(t), false);
  assert.equal(isRelevantCivic(t), true);
});

// ── Useless content ──

test('link-only and bridge-error tweets dropped', () => {
  assert.equal(isUselessTweet('https://t.co/abc123'), true);
  assert.equal(isUselessTweet('Bridge returned error 429'), true);
  assert.equal(isUselessTweet(''), true);
});

test('non-advisory chatter fails the advisory gate', () => {
  assert.equal(isAdvisory('Lovely weather for a picnic today folks!'), true); // "weather" matches — known broad term
  assert.equal(isRelevantCivic('Our team visited the new office space yesterday.'), false);
});
