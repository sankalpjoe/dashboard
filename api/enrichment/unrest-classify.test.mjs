/**
 * Eval-backed tests for the unrest classifier's deterministic layers:
 * prescreen (stage 1) and normalizeResult (stage 3).
 *
 * Run: node --test api/enrichment/unrest-classify.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prescreen, normalizeResult, negativeResult } from './unrest-classify.js';

// ── Eval set inputs: prescreen must pass real events through to the LLM ──

test('refine_001 trucker blockade reaches LLM (implicit signals)', () => {
  assert.equal(
    prescreen(
      'Hundreds of truckers have parked their rigs across Highway 10 this morning, refusing to move until the new fuel tariffs are reviewed. Long tailbacks reported.',
    ),
    true,
  );
});

test('refine_004 Berlin teachers reaches LLM (no explicit keywords)', () => {
  assert.equal(
    prescreen(
      "Update from Berlin: Teachers didn't show up to classrooms today. Gathering in Alexanderplatz right now with banners over funding.",
    ),
    true,
  );
});

test('refine_006 nurses walkout reaches LLM', () => {
  assert.equal(
    prescreen(
      "Nurses at St. Mary's walked off shift at 6am and are now picketing the main entrance over staffing ratios.",
    ),
    true,
  );
});

test('signal-free chatter is auto-dropped before LLM', () => {
  assert.equal(prescreen('Top 10 smartphone deals this weekend, unmissable prices!'), false);
  assert.equal(prescreen('Beautiful sunset over the marina tonight'), false);
});

// ── Normalization: enforce schema rules the LLM might violate ──

test('threshold rule: positive below 0.75 is downgraded to None', () => {
  const out = normalizeResult({
    is_civil_unrest: true,
    event_type: 'Protest',
    confidence_score: 0.4,
    extraction: { location: 'Downtown', trigger: 'rumor', impact: 'unknown' },
    filtering_justification: 'Unconfirmed rumor.',
  });
  assert.equal(out.is_civil_unrest, false);
  assert.equal(out.event_type, 'None');
  assert.equal(out.extraction, null);
});

test('null rule: negatives always get extraction=null even if LLM emitted object', () => {
  const out = normalizeResult({
    is_civil_unrest: false,
    event_type: 'None',
    confidence_score: 0.1,
    extraction: { location: 'Unknown', trigger: 'Unknown', impact: 'Unknown' },
    filtering_justification: 'Digital-only consumer complaint.',
  });
  assert.equal(out.extraction, null);
});

test('invalid event_type coerced to None and event dropped', () => {
  const out = normalizeResult({
    is_civil_unrest: true,
    event_type: 'Riot', // not in enum — riots must map to Protest at LLM layer
    confidence_score: 0.9,
    extraction: { location: 'Quito', trigger: 'subsidy cuts', impact: 'clashes' },
  });
  assert.equal(out.event_type, 'None');
  assert.equal(out.is_civil_unrest, false);
});

test('confidence clamped to [0,1]; non-numeric becomes 0', () => {
  assert.equal(normalizeResult({ is_civil_unrest: false, event_type: 'None', confidence_score: 7 }).confidence_score, 1);
  assert.equal(normalizeResult({ is_civil_unrest: false, event_type: 'None', confidence_score: 'high' }).confidence_score, 0);
});

test('valid positive passes through intact (refine_001 expected shape)', () => {
  const out = normalizeResult({
    is_civil_unrest: true,
    event_type: 'Blockade',
    confidence_score: 0.95,
    extraction: { location: 'Highway 10', trigger: 'new fuel tariffs', impact: 'Long tailbacks / road blocked' },
    filtering_justification: 'Physical blockade of a highway.',
  });
  assert.equal(out.is_civil_unrest, true);
  assert.equal(out.event_type, 'Blockade');
  assert.deepEqual(out.extraction, {
    location: 'Highway 10',
    trigger: 'new fuel tariffs',
    impact: 'Long tailbacks / road blocked',
  });
});

test('missing extraction fields default to Unknown on positives', () => {
  const out = normalizeResult({
    is_civil_unrest: true,
    event_type: 'Strike',
    confidence_score: 0.9,
    extraction: { trigger: 'funding' },
  });
  assert.deepEqual(out.extraction, { location: 'Unknown', trigger: 'funding', impact: 'Unknown' });
});

test('malformed/garbage output fails closed', () => {
  assert.equal(normalizeResult(null).is_civil_unrest, false);
  assert.equal(normalizeResult('junk').is_civil_unrest, false);
  assert.equal(negativeResult('x').extraction, null);
});
