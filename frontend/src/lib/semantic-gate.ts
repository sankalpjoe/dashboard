/**
 * Semantic vetting gate - "Bunkum filter" (Task 1).
 *
 * The existing passesRelevance() gate keeps anything that (a) avoids the
 * automotive/lifestyle/markets NOISE list and (b) contains an operational-risk
 * keyword. That still lets through isolated, sensational, single-victim, or
 * viral items that merely *mention* a monitored city - e.g. "Whale washes
 * ashore in Mumbai", "Techie ends life in Bengaluru flat", "Viral video: ...".
 *
 * This module adds a structural-intent layer. Instead of matching keywords, it
 * asks: does the text describe COLLECTIVE public action, MACRO / systemic
 * impact, or a MAJOR event - or is it an isolated viral/local incident?
 *
 *   - Collective / systemic signals  -> keep (they take precedence).
 *   - Otherwise, isolated viral/sensational/single-victim noise -> drop.
 *   - Neutral text -> defer (kept; other gates still apply).
 *
 * Pure module: no imports, no side effects, so it is unit-testable directly
 * with `node --test` (native type stripping) and reusable on any text path.
 */

// -- Isolated viral / sensational / single-victim noise ----------------------
export const BUNKUM_PATTERNS: RegExp[] = [
  // Animal wash-ups, strays, wildlife oddities
  /\bwashe?d?s?\s*ashore\b/i,
  /\b(whale|dolphin|shark|turtle|octopus|crocodile|python|snake|cobra|leopard|tiger|monkey|elephant|cattle|stray dogs?)\b.*\b(washes?\s*(ashore|up)|spotted|rescued|strays?|enters?|roams?|found|caught|trapped)\b/i,

  // Single isolated rescue / individual tragedy / self-harm
  /\b(man|woman|boy|girl|child|toddler|infant|elderly|senior citizen|student|techie|labou?rer|worker|driver|farmer|youth|minor|couple)\b[^.]*\b(rescued|saved|drowns?|drowned|falls?\s+(in|into|from)|dies?|died|killed|found dead|ends? (his |her )?life|commits? suicide|attempts? suicide|electrocuted|crushed)\b/i,
  /\bbid to end life\b|\ballegedly (dies|kills self|ends life)\b/i,

  // Isolated domestic / interpersonal crime (single victim, not communal)
  /\b(husband|wife|son|daughter|lover|boyfriend|girlfriend|neighbou?r|landlord|tenant|friend|relative|in-?laws?)\b[^.]*\b(kills?|murders?|stabs?|assaults?|attacks?|strangles?|hacks?)\b/i,
  /\b(love affair|property dispute|family feud|domestic (dispute|violence|tiff))\b/i,
  // Single-victim street crime (sprees overridden by COLLECTIVE_SIGNALS below)
  /\b(man|woman|boy|girl|elderly|senior citizen|student|techie|tourist|passenger)\b[^.]*\b(robbed|mugged|duped|cheated|conned|harassed|stalked|thrashed|beaten|stabbed|raped|molested|kidnapped|abducted)\b/i,

  // Tabloid / viral / social-media-sourced
  /\b(goes? viral|viral (video|clip|photo|post)|netizens?|internet reacts?|caught on (camera|cam|cctv)|cctv (footage|video)|watch:|video:|viral:|wholesome|heart-?warming|tear-?jerker)\b/i,

  // Celebrity / influencer commentary (no real-world event)
  /\b(actor|actress|star|singer|rapper|influencer|youtuber|streamer|comedian|cricketer)\b[^.]*\b(says?|reacts?|slams?|trolled?|spotted|posts?|shares?|reveals?|opens? up|breaks? silence)\b/i,

  // Clickbait hyperbole over structural fact
  /\b(you won'?t believe|jaw-?dropping|will leave you|here'?s (why|what|how)|this is (why|what)|mind-?blowing|unbelievable|shocking (video|reason|truth)|reason will (shock|surprise)|gone wrong|epic (fail|win))\b/i,
];

// -- Collective action / macro-policy / systemic scale - overrides bunkum ----
// e.g. "Hundreds rescued as floods hit" is systemic, not an isolated rescue.
export const COLLECTIVE_SIGNALS: RegExp[] = [
  // Organized collective action
  /\b(protests?|strikes?|bandh|hartal|dharna|gherao|rally|rallies|march|morcha|agitation|sit-?in|stir|boycott|walkout|picket|blockade|road\s*roko|rail\s*roko|human chain)\b/i,
  // Public-order / state response at scale
  /\b(section\s*144|curfew|lockdown|prohibitory orders?|riots?|communal|clash(es)?|stampede|lathi\s*charge|tear\s*gas|cordon|evacuat|crackdown|detain(ed|s)? \d+)\b/i,
  // Quantified collective magnitude. Deliberately excludes ambient bystander
  // nouns such as crowd, residents or locals: phrases like "crowd gathers" or
  // "residents on edge" describe spectators of an isolated incident.
  /\b(thousands?|hundreds?|dozens?|scores of|mob|masses|gang|spate|series of|spree|wave of|multiple (people|incidents|cases)|several (people|incidents|cases))\b/i,
  // Macro-policy / systemic infrastructure & public health
  /\b(city-?wide|across the city|shut\s*down|shutdown|outage|power cut|load\s*shedding|water (cut|supply|shortage)|metro|airport|highway|outbreak|epidemic|pandemic|red alert|orange alert|government|govt|civic body|corporation|municipal|policy|ordinance|imposed|banned?)\b/i,
];

export function isCollectiveOrSystemic(text: string): boolean {
  return COLLECTIVE_SIGNALS.some((re) => re.test(text));
}

export function isBunkum(text: string): boolean {
  return BUNKUM_PATTERNS.some((re) => re.test(text));
}

/**
 * Structural-intent verdict.
 *   true  -> keep  (collective/systemic, or neutral)
 *   false -> drop  (isolated viral/sensational/single-victim incident)
 *
 * Collective/systemic precedence is deliberate: a real protest or citywide
 * disruption must survive even if the same headline also contains an
 * individual-tragedy phrasing.
 */
export function passesSemanticVet(text: string): boolean {
  const t = text || '';
  if (!t) return false;
  if (isCollectiveOrSystemic(t)) return true; // precedence: keep systemic
  if (isBunkum(t)) return false; // drop isolated viral/local noise
  return true; // neutral -> defer to the other relevance gates
}

// ── Heuristic risk weight (0–7) for relevance ranking when the LLM enrichment
// is unavailable (Groq 429 / no key). Higher = more operationally relevant.
const STRONG_RISK =
  /\b(protests?|strikes?|bandh|hartal|dharna|curfew|section\s*144|riots?|communal|clash(es)?|stampede|blockade|blasts?|explosions?|bomb|terror|encounter|evacuat|lockdown|floods?|waterlog|cloudburst|cyclone|landslide|earthquake|outbreak|gas leak|firing|lathi\s*charge)\b/i;
const MED_RISK =
  /\b(power\s*(cut|outage)|water\s*(cut|supply|shortage)|load\s*shedding|road\s*(closure|closed|block|diversion)|diversion|metro|gridlock|traffic jam|accident|derail|collapse|red alert|orange alert|heatwave|smog|\baqi\b|dengue|advisory|shutdown)\b/i;
const WEAK_RISK = /\b(rain|delay|warning|disruption|repair|maintenance|\balert\b)\b/i;

export function riskWeight(text: string): number {
  const s = text || '';
  let w = 0;
  if (STRONG_RISK.test(s)) w += 5;
  else if (MED_RISK.test(s)) w += 3;
  else if (WEAK_RISK.test(s)) w += 1;
  if (isCollectiveOrSystemic(s)) w += 2;
  return Math.min(7, w);
}
