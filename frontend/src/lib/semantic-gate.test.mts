/**
 * Tests for the semantic vetting gate (Task 1 — "bunkum" filter).
 * Run: npx tsx --test frontend/src/lib/semantic-gate.test.mts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passesSemanticVet, isBunkum, isCollectiveOrSystemic } from './semantic-gate.ts';

// ── Isolated viral / sensational / single-victim items must be DROPPED ──
const BUNKUM = [
  'Whale washes ashore in Mumbai, crowd gathers to click selfies',
  'Leopard spotted near Bengaluru apartment, residents on edge',
  'Techie ends life in Hyderabad flat over work stress',
  'Man drowns while taking bath in Yamuna in Delhi',
  'Husband kills wife over property dispute in Chennai',
  'Woman robbed at knifepoint near Indiranagar, Bengaluru',
  'Viral video: Mumbai auto driver returns lost wallet',
  'Watch: CCTV footage of bike theft in Delhi goes viral',
  'Actor reacts to potholes in Bengaluru, netizens slam BBMP',
  "You won't believe what this Hyderabad vendor did next",
];

for (const h of BUNKUM) {
  test(`drops isolated/viral: ${h.slice(0, 48)}`, () => {
    assert.equal(passesSemanticVet(h), false, 'should be dropped');
    assert.equal(isBunkum(h), true);
  });
}

// ── Collective action / macro-policy / systemic items must be KEPT ──
const KEEP = [
  'Section 144 imposed in Hyderabad ahead of protest rally',
  'Auto unions call bandh in Bengaluru, commuters stranded',
  'Thousands evacuated as floods hit Mumbai suburbs',
  'Citywide power outage hits Delhi after grid failure',
  'BMTC bus strike disrupts traffic across Bengaluru',
  'Curfew in parts of Hyderabad after communal clashes',
  'Dengue outbreak: civic body issues advisory in Chennai',
];

for (const h of KEEP) {
  test(`keeps collective/systemic: ${h.slice(0, 48)}`, () => {
    assert.equal(isCollectiveOrSystemic(h), true);
    assert.equal(passesSemanticVet(h), true, 'should be kept');
  });
}

// ── Precedence: collective signal overrides an isolated-tragedy phrasing ──
test('collective precedence over single-victim phrasing', () => {
  const h = 'Hundreds protest in Delhi after man dies in police custody';
  assert.equal(isBunkum(h), true, 'matches single-victim phrasing');
  assert.equal(isCollectiveOrSystemic(h), true, 'but also collective');
  assert.equal(passesSemanticVet(h), true, 'collective wins → kept');
});

// ── A street-crime spree is systemic, a single mugging is not ──
test('spree kept, single mugging dropped', () => {
  assert.equal(passesSemanticVet('Gang robs five commuters in Bengaluru in an hour'), true);
  assert.equal(passesSemanticVet('Student mugged near Whitefield, Bengaluru'), false);
});

// ── Neutral structural news is deferred (kept) ──
test('neutral structural news is kept', () => {
  const h = 'Crack on Bengaluru flyover forces lane closure';
  assert.equal(isBunkum(h), false);
  assert.equal(passesSemanticVet(h), true);
});

// ── Empty input is dropped ──
test('empty input dropped', () => {
  assert.equal(passesSemanticVet(''), false);
});

// ── riskWeight (heuristic relevance ranking) ──
import { riskWeight } from './semantic-gate.ts';

test('riskWeight ranks strong operational risk highest', () => {
  assert.ok(riskWeight('Section 144 imposed as protest turns violent') >= 6);
  assert.ok(riskWeight('Power cut across Indiranagar for 4 hours') >= 3);
  assert.ok(riskWeight('Light rain expected in the evening') <= 2);
  assert.equal(riskWeight('BESCOM wishes everyone a happy Diwali'), 0);
});

test('riskWeight: strong > medium > weak', () => {
  const strong = riskWeight('Curfew imposed after communal clashes');
  const med = riskWeight('Traffic diversion near metro station');
  const weak = riskWeight('Minor delay on service');
  assert.ok(strong > med && med > weak);
});
