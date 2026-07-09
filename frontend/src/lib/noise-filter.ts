/**
 * noise-filter.ts — SINGLE SOURCE OF TRUTH for junk detection.
 *
 * Consolidates the three filter systems that previously drifted apart
 * (news-service NEGATIVE_KEYWORDS, intel-service NOISE_PATTERNS, and the
 * frontend copy of twitter-intel JUNK_PATTERNS). Every feed should call
 * `isNoise()` here; feed-specific extras stay in their own service.
 *
 * Design rules learned the hard way:
 *  - Match MODEL names, not bare brand names ("Multistrada V4 Rally" is a
 *    catalog item; "Suzuki showroom gutted in fire" is operational news).
 *  - Promo terms need vehicle/retail context nearby ("offers" alone is too
 *    broad — "police offers reward" is legit).
 *  - Every pattern group is named so a dropped item can say WHY it dropped.
 */

export type NoiseReason =
  | 'entertainment_sports'
  | 'gaming_anime'
  | 'greetings_ceremony'
  | 'retail_promo'
  | 'automotive_catalog'
  | 'vehicle_model_name'
  | 'lifestyle_listicle'
  | 'jobs_exams_results'
  | 'epaper_gallery'
  | 'markets_finance'
  | 'real_estate_ad'
  | 'astrology'
  | 'political_fluff';

const GROUPS: Record<NoiseReason, RegExp> = {
  entertainment_sports:
    /\b(cricket|ipl|t20|odi|test match|wickets?|batting|bowling|innings|world cup|tournament|bollywood|film|movie|celebrity|box office|bigg boss|red carpet|album release|concert tour|reality (tv|show)|daily soap|episode|written update|premier league|champions league|la liga|nba|nfl|wimbledon|french open|formula 1|f1 grand prix)\b/i,

  gaming_anime:
    /\b(anime|manga|gacha|esports|video game|mobile game|game (launch|release|update|event)|dlc|patch notes|season pass|battle pass|playable character|crossover event|in-game)\b/i,

  greetings_ceremony:
    /\b(happy (birthday|anniversary|new year|diwali|holi|eid|dussehra|navratri|pongal|onam|christmas|republic day|independence day)|birthday (wishes|greetings)|warm (wishes|greetings)|best wishes|heartiest|wishing (you|him|her|them)|many many happy returns|condolences?|heartfelt tribute|pays? (rich )?tribute|deepest sympathy|rest in peace|jayanti|punyatithi|good morning|thought (of|for) the day|motivational quote|congratulat|felicitat|inaugurat|award ceremony|receives award|honoured|foundation stone|takes? oath|nomination papers|cabinet portfolio)\b/i,

  retail_promo:
    /\b(discounts?|offers?|deals?|savings?)\b[^.]{0,40}\b(bikes?|cars?|scooters?|suvs?|sedans?|ev|vehicles?|showroom|dealership|smartphones?|laptops?)\b|\b(bikes?|cars?|scooters?|suvs?|sedans?|vehicles?|smartphones?)\b[^.]{0,40}\b(discounts?|offers?|deals?|bookings?)\b|% off|\bcashback\b|coupon|promo code|limited (time|period) offer|giveaway|contest alert|lucky draw|free gift|sale (is )?live|shop now|order now|book now|festive offer|exchange (offer|bonus)|download (the|our) app/i,

  automotive_catalog:
    /\bprice in\b|on-?road (cost|price)|ex-?showroom|\bemi\b|down payment|\bmileage\b|\bspecs?\b|\bvariants?\b|\bcolou?rs\b|test drive|driving impressions|pre-?owned|used cars?|unboxing|review:|\blaunch(ed|es)?\b[^.]{0,30}\b(bike|car|scooter|suv|ev)\b/i,

  // Model names that collide with risk words ("Rally", "Defender").
  // Bare brand names are deliberately NOT here.
  vehicle_model_name:
    /\b(multistrada|himalayan (\d|rally)|ninja \d|defender \d{2,3}|mahindra thar|royal enfield (himalayan|classic|bullet|meteor|hunter)|ktm duke|bajaj pulsar)\b/i,

  lifestyle_listicle:
    /\b(tips for|how to|top \d+|best (places|recommendations|brands)|things to do|hidden gems|weekend (guide|getaway)|where to (eat|shop)|pop-?up|caf[eé]s? in|restaurants? in|food walk|street food guide)\b/i,

  jobs_exams_results:
    /\b(recruitment|vacanc(y|ies)|job mela|jobs in|govt jobs|apply (now|online|before)|admit card|hall ticket|results? (declared|announced|out)|exam date|notification (out|released)|cet result|first rank|admissions? open|free bus pass|scheme for students)\b/i,

  epaper_gallery:
    /\b(epaper|e-paper|district edition|video galler|photo galler|news video|(business|entertainment|world|national|sports|top|latest) news)\b/i,

  markets_finance:
    /\b(sensex|nifty|ipo (opens|subscribed)|\breit\b|oversubscribed|quarterly earnings|share price|stock (market|exchange)|market cap|profit rises|revenue grows|annual report|dow jones|nasdaq|s&p 500|federal reserve|wall street)\b/i,

  real_estate_ad:
    /\b(\d+\s?bhk|flats? for sale|plots? for sale|property (for sale|expo)|real estate (offer|investment)|book your (flat|plot|home))\b/i,

  astrology:
    /\b(horoscope|rashifal|zodiac|numerology|vastu|astrology)\b/i,

  political_fluff:
    /\b(opinion poll|exit poll|party manifesto|vote bank|campaign speech|mla wins|mp wins|(lok sabha|assembly election|by-election) result|cabinet reshuffle|seasoned politician|meets? cm\b)\b/i,
};

/**
 * Returns the reason a headline is noise, or null if it looks legitimate.
 * Use the reason in logs so filter regressions are diagnosable.
 */
export function isNoise(text: string): NoiseReason | null {
  if (!text) return null;
  for (const [reason, re] of Object.entries(GROUPS) as [NoiseReason, RegExp][]) {
    if (re.test(text)) return reason;
  }
  return null;
}

/** Convenience boolean wrapper. */
export function isJunk(text: string): boolean {
  return isNoise(text) !== null;
}

/** Expose groups for services that only want a subset. */
export const NOISE_GROUPS = GROUPS;
