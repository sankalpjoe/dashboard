/**
 * Quick-access directory of source websites for MANUAL checking. National
 * dailies are expanded into per-city section pages (e.g. Times of India →
 * Bengaluru / Mumbai / Delhi / Hyderabad / Chennai / Kolkata), so selecting a
 * city in the News Feeds tab surfaces that city's edition of each paper.
 */
export type SourceCity = 'NATIONAL' | 'BANGALORE' | 'MUMBAI' | 'HYDERABAD' | 'DELHI' | 'CHENNAI' | 'KOLKATA' | 'OFFICIAL';

export interface NewsSource {
  name: string;
  url: string;
  lang: string;
  city: SourceCity;
}

const CITY_LABEL: Record<Exclude<SourceCity, 'NATIONAL' | 'OFFICIAL'>, string> = {
  BANGALORE: 'Bengaluru', MUMBAI: 'Mumbai', DELHI: 'Delhi',
  HYDERABAD: 'Hyderabad', CHENNAI: 'Chennai', KOLKATA: 'Kolkata',
};

// National dailies with per-city section URLs (only cities each paper covers).
const NATIONAL_CITY_SOURCES: { name: string; lang: string; urls: Partial<Record<keyof typeof CITY_LABEL, string>> }[] = [
  {
    name: 'Times of India', lang: 'English',
    urls: {
      BANGALORE: 'https://timesofindia.indiatimes.com/topic/Bengaluru',
      MUMBAI:    'https://timesofindia.indiatimes.com/topic/Mumbai',
      DELHI:     'https://timesofindia.indiatimes.com/topic/Delhi',
      HYDERABAD: 'https://timesofindia.indiatimes.com/topic/Hyderabad',
      CHENNAI:   'https://timesofindia.indiatimes.com/topic/Chennai',
      KOLKATA:   'https://timesofindia.indiatimes.com/topic/Kolkata',
    },
  },
  {
    name: 'The Hindu', lang: 'English',
    urls: {
      BANGALORE: 'https://www.thehindu.com/news/cities/bangalore/',
      MUMBAI:    'https://www.thehindu.com/news/cities/mumbai/',
      DELHI:     'https://www.thehindu.com/news/cities/Delhi/',
      HYDERABAD: 'https://www.thehindu.com/news/cities/Hyderabad/',
      CHENNAI:   'https://www.thehindu.com/news/cities/chennai/',
    },
  },
  {
    name: 'Hindustan Times', lang: 'English',
    urls: {
      BANGALORE: 'https://www.hindustantimes.com/cities/bengaluru-news',
      MUMBAI:    'https://www.hindustantimes.com/cities/mumbai-news',
      DELHI:     'https://www.hindustantimes.com/cities/delhi-news',
      KOLKATA:   'https://www.hindustantimes.com/cities/kolkata-news',
    },
  },
  {
    name: 'Indian Express', lang: 'English',
    urls: {
      BANGALORE: 'https://indianexpress.com/section/cities/bangalore/',
      MUMBAI:    'https://indianexpress.com/section/cities/mumbai/',
      DELHI:     'https://indianexpress.com/section/cities/delhi/',
      HYDERABAD: 'https://indianexpress.com/section/cities/hyderabad/',
      CHENNAI:   'https://indianexpress.com/section/cities/chennai/',
      KOLKATA:   'https://indianexpress.com/section/cities/kolkata/',
    },
  },
  {
    name: 'Economic Times', lang: 'English',
    urls: {
      BANGALORE: 'https://economictimes.indiatimes.com/topic/bengaluru',
      MUMBAI:    'https://economictimes.indiatimes.com/topic/mumbai',
      DELHI:     'https://economictimes.indiatimes.com/topic/delhi',
      HYDERABAD: 'https://economictimes.indiatimes.com/topic/hyderabad',
      CHENNAI:   'https://economictimes.indiatimes.com/topic/chennai',
      KOLKATA:   'https://economictimes.indiatimes.com/topic/kolkata',
    },
  },
];

const nationalCityEntries: NewsSource[] = NATIONAL_CITY_SOURCES.flatMap(s =>
  (Object.entries(s.urls) as [keyof typeof CITY_LABEL, string][]).map(([city, url]) => ({
    name: `${s.name} — ${CITY_LABEL[city]}`,
    url,
    lang: s.lang,
    city: city as SourceCity,
  })),
);

export const NEWS_SOURCES: NewsSource[] = [
  // ── National dailies, per-city section pages ──
  ...nationalCityEntries,

  // ── National homepages ──
  { name: 'Times of India',   url: 'https://timesofindia.indiatimes.com',  lang: 'English', city: 'NATIONAL' },
  { name: 'The Hindu',        url: 'https://www.thehindu.com',             lang: 'English', city: 'NATIONAL' },
  { name: 'Hindustan Times',  url: 'https://www.hindustantimes.com',       lang: 'English', city: 'NATIONAL' },
  { name: 'Indian Express',   url: 'https://indianexpress.com',            lang: 'English', city: 'NATIONAL' },
  { name: 'Economic Times',   url: 'https://economictimes.indiatimes.com', lang: 'English', city: 'NATIONAL' },
  { name: 'E-Pao',            url: 'https://www.e-pao.net',                lang: 'English', city: 'NATIONAL' },

  // ── Bangalore / Karnataka (Kannada) ──
  { name: 'Vijayavani',       url: 'https://www.vijayavani.net',           lang: 'Kannada', city: 'BANGALORE' },
  { name: 'Vijaya Karnataka', url: 'https://vijaykarnataka.com',           lang: 'Kannada', city: 'BANGALORE' },
  { name: 'Prajavani',        url: 'https://www.prajavani.net',            lang: 'Kannada', city: 'BANGALORE' },
  { name: 'Udayavani',        url: 'https://www.udayavani.com',            lang: 'Kannada', city: 'BANGALORE' },
  { name: 'Kannada Prabha',   url: 'https://www.kannadaprabha.com',        lang: 'Kannada', city: 'BANGALORE' },

  // ── Mumbai / Maharashtra (Marathi) ──
  { name: 'Lokmat',           url: 'https://www.lokmat.com',               lang: 'Marathi', city: 'MUMBAI' },
  { name: 'Sakal',            url: 'https://www.esakal.com',               lang: 'Marathi', city: 'MUMBAI' },
  { name: 'Maharashtra Times',url: 'https://maharashtratimes.com',         lang: 'Marathi', city: 'MUMBAI' },
  { name: 'Pudhari',          url: 'https://www.pudhari.news',             lang: 'Marathi', city: 'MUMBAI' },
  { name: 'Loksatta',         url: 'https://www.loksatta.com',             lang: 'Marathi', city: 'MUMBAI' },

  // ── Hyderabad / Telangana (Telugu + Urdu) ──
  { name: 'Eenadu',           url: 'https://www.eenadu.net',               lang: 'Telugu',  city: 'HYDERABAD' },
  { name: 'Sakshi',           url: 'https://www.sakshi.com',               lang: 'Telugu',  city: 'HYDERABAD' },
  { name: 'Andhra Jyothi',    url: 'https://www.andhrajyothy.com',         lang: 'Telugu',  city: 'HYDERABAD' },
  { name: 'Namasthe Telangana', url: 'https://www.ntnews.com',            lang: 'Telugu',  city: 'HYDERABAD' },
  { name: 'V6 Velugu',        url: 'https://velugu.v6velugu.com',          lang: 'Telugu',  city: 'HYDERABAD' },
  { name: 'The Siasat Daily', url: 'https://www.siasat.com',              lang: 'Urdu',    city: 'HYDERABAD' },
  { name: 'The Munsif Daily', url: 'https://munsifdaily.com',             lang: 'Urdu',    city: 'HYDERABAD' },
  { name: 'Etemaad Urdu',     url: 'https://www.etemaaddaily.com',        lang: 'Urdu',    city: 'HYDERABAD' },
  { name: 'Rehnuma-e-Deccan', url: 'https://therahnuma.com',              lang: 'Urdu',    city: 'HYDERABAD' },

  // ── Delhi / North India (Hindi) ──
  { name: 'Dainik Bhaskar',   url: 'https://www.bhaskar.com',              lang: 'Hindi',   city: 'DELHI' },
  { name: 'Dainik Jagran',    url: 'https://www.jagran.com',               lang: 'Hindi',   city: 'DELHI' },
  { name: 'Hindustan',        url: 'https://www.livehindustan.com',        lang: 'Hindi',   city: 'DELHI' },
  { name: 'Amar Ujala',       url: 'https://www.amarujala.com',            lang: 'Hindi',   city: 'DELHI' },
  { name: 'Rajasthan Patrika',url: 'https://www.patrika.com',              lang: 'Hindi',   city: 'DELHI' },
  { name: 'Navbharat Times',  url: 'https://navbharattimes.indiatimes.com',lang: 'Hindi',   city: 'DELHI' },
  { name: 'Punjab Kesari',    url: 'https://www.punjabkesari.in',          lang: 'Hindi',   city: 'DELHI' },

  // ── Chennai / Tamil Nadu (Tamil) ──
  { name: 'Daily Thanthi',    url: 'https://www.dailythanthi.com',         lang: 'Tamil',   city: 'CHENNAI' },
  { name: 'Dinamalar',        url: 'https://www.dinamalar.com',            lang: 'Tamil',   city: 'CHENNAI' },
  { name: 'Dinamani',         url: 'https://www.dinamani.com',             lang: 'Tamil',   city: 'CHENNAI' },

  // ── Kolkata / West Bengal (Bengali) ──
  { name: 'Anandabazar Patrika', url: 'https://www.anandabazar.com',       lang: 'Bengali', city: 'KOLKATA' },
  { name: 'Bartaman',         url: 'https://bartamanpatrika.com',          lang: 'Bengali', city: 'KOLKATA' },
  { name: 'The Telegraph',    url: 'https://www.telegraphindia.com',       lang: 'English', city: 'KOLKATA' },

  // ── Official / civic ──
  { name: 'IMD Mausam',       url: 'https://mausam.imd.gov.in',            lang: 'Official', city: 'OFFICIAL' },
  { name: 'CPCB (AQI)',       url: 'https://airquality.cpcb.gov.in',       lang: 'Official', city: 'OFFICIAL' },
  { name: 'NDMA',             url: 'https://ndma.gov.in',                  lang: 'Official', city: 'OFFICIAL' },
  { name: 'PIB',              url: 'https://pib.gov.in',                   lang: 'Official', city: 'OFFICIAL' },
  { name: 'Citizen Matters',  url: 'https://citizenmatters.in',            lang: 'Civic',   city: 'OFFICIAL' },
];
