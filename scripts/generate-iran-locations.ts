import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import yauzl from 'yauzl';

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, '.geonames');
const OUTPUT_DIR = path.join(ROOT, 'prisma', 'seed-data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'iran-locations.json');
const REPORT_FILE = path.join(OUTPUT_DIR, 'iran-location-report.txt');

const ADMIN1_URL =
  'https://download.geonames.org/export/dump/admin1CodesASCII.txt';

const IR_URL = 'https://download.geonames.org/export/dump/IR.zip';

const ALT_NAMES_URL =
  'https://download.geonames.org/export/dump/alternateNamesV2.zip';

type ProvinceDef = {
  slug: string;
  fa: string;
  enAliases: string[];
  capitalFa: string[];
  capitalEnAliases: string[];
};

type PersianName = {
  value: string;
  preferred: boolean;
};

type CandidateCity = {
  geonameId: number;
  asciiName: string;
  provinceSlug: string;
  population: number;
  isCapital: boolean;
  faNames: PersianName[];
};

type PreCity = {
  name: string;
  asciiName: string;
  provinceSlug: string;
  geonameId: number;
  population: number;
  baseSlug: string;
  isCapital: boolean;
};

type OutputCity = {
  name: string;
  slug: string;
  provinceSlug: string;
  geonameId: number;
};

type InternalCity = OutputCity & {
  asciiName: string;
  isCapital: boolean;
};

type Dataset = {
  metadata: {
    source: string;
    license: string;
    generatedAt: string;
  };
  provinces: Array<{
    name: string;
    slug: string;
  }>;
  cities: OutputCity[];
};

/*
  Official GeoNames dump columns.

  0  geonameid
  1  name
  2  ascii name
  3  alternate names
  4  latitude
  5  longitude
  6  feature class
  7  feature code
  8  country code
  9  cc2
  10 admin1 code
  11 admin2 code
  12 admin3 code
  13 admin4 code
  14 population
  15 elevation
  16 dem
  17 timezone
  18 modification date
*/
const GEO_COL = {
  GEONAMEID: 0,
  NAME: 1,
  ASCII_NAME: 2,
  ALTERNATE_NAMES: 3,
  LATITUDE: 4,
  LONGITUDE: 5,
  FEATURE_CLASS: 6,
  FEATURE_CODE: 7,
  COUNTRY_CODE: 8,
  CC2: 9,
  ADMIN1_CODE: 10,
  ADMIN2_CODE: 11,
  ADMIN3_CODE: 12,
  ADMIN4_CODE: 13,
  POPULATION: 14,
} as const;

function normalizeEn(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bprovince\b/g, '')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeFa(value: string): string {
  return value
    .replace(/\u0640/g, '') // Arabic tatweel
    .replace(/\u0643/g, '\u06A9') // Arabic kaf -> Persian kaf
    .replace(/\u064A/g, '\u06CC') // Arabic yeh -> Persian yeh
    .replace(/\u0649/g, '\u06CC') // Arabic alef maksura -> Persian yeh
    .replace(/\u200B/g, '') // zero-width space
    .replace(/\uFEFF/g, '') // BOM / zero-width no-break space
    .replace(/[\t\r\n\u00A0]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function isPersianName(value: string): boolean {
  const hasPersianLetter =
    /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(value);

  const hasLatinLetter = /[A-Za-z]/.test(value);

  return hasPersianLetter && !hasLatinLetter;
}

function slugifyAscii(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/*
  Permanent province slug mapping.
  Province slugs are manual and permanent.
*/
const PROVINCES: ProvinceDef[] = [
  {
    slug: 'tehran',
    fa: 'تهران',
    enAliases: ['tehran'],
    capitalFa: ['تهران'],
    capitalEnAliases: ['tehran'],
  },
  {
    slug: 'alborz',
    fa: 'البرز',
    enAliases: ['alborz'],
    capitalFa: ['کرج'],
    capitalEnAliases: ['karaj'],
  },
  {
    slug: 'qom',
    fa: 'قم',
    enAliases: ['qom'],
    capitalFa: ['قم'],
    capitalEnAliases: ['qom'],
  },
  {
    slug: 'semnan',
    fa: 'سمنان',
    enAliases: ['semnan'],
    capitalFa: ['سمنان'],
    capitalEnAliases: ['semnan'],
  },
  {
    slug: 'qazvin',
    fa: 'قزوین',
    enAliases: ['qazvin', 'ghazvin'],
    capitalFa: ['قزوین'],
    capitalEnAliases: ['qazvin', 'ghazvin'],
  },
  {
    slug: 'markazi',
    fa: 'مرکزی',
    enAliases: ['markazi'],
    capitalFa: ['اراک'],
    capitalEnAliases: ['arak'],
  },
  {
    slug: 'zanjan',
    fa: 'زنجان',
    enAliases: ['zanjan'],
    capitalFa: ['زنجان'],
    capitalEnAliases: ['zanjan'],
  },
  {
    slug: 'ardabil',
    fa: 'اردبیل',
    enAliases: ['ardabil', 'ardebil'],
    capitalFa: ['اردبیل'],
    capitalEnAliases: ['ardabil', 'ardebil'],
  },
  {
    slug: 'east-azerbaijan',
    fa: 'آذربایجان شرقی',
    enAliases: [
      'east azerbaijan',
      'east azarbaijan',
      'eastern azerbaijan',
      'eastern azarbaijan',
      'azarbaijan sharghi',
    ],
    capitalFa: ['تبریز'],
    capitalEnAliases: ['tabriz'],
  },
  {
    slug: 'west-azerbaijan',
    fa: 'آذربایجان غربی',
    enAliases: [
      'west azerbaijan',
      'west azarbaijan',
      'western azerbaijan',
      'western azarbaijan',
      'azarbaijan gharbi',
    ],
    capitalFa: ['ارومیه'],
    capitalEnAliases: [
      'urmia',
      'orumiyeh',
      'oroumiyeh',
      'orumiye',
      'urumiyeh',
      'urumieh',
      'rezaiyeh',
      'rezaieh',
    ],
  },
  {
    slug: 'kurdistan',
    fa: 'کردستان',
    enAliases: ['kurdistan', 'kordestan'],
    capitalFa: ['سنندج'],
    capitalEnAliases: ['sanandaj'],
  },
  {
    slug: 'kermanshah',
    fa: 'کرمانشاه',
    enAliases: ['kermanshah'],
    capitalFa: ['کرمانشاه'],
    capitalEnAliases: ['kermanshah'],
  },
  {
    slug: 'hamadan',
    fa: 'همدان',
    enAliases: ['hamadan', 'hamedan'],
    capitalFa: ['همدان'],
    capitalEnAliases: ['hamadan', 'hamedan'],
  },
  {
    slug: 'lorestan',
    fa: 'لرستان',
    enAliases: ['lorestan'],
    capitalFa: ['خرم\u200Cآباد', 'خرم آباد'],
    capitalEnAliases: ['khorramabad', 'khorram abad'],
  },
  {
    slug: 'ilam',
    fa: 'ایلام',
    enAliases: ['ilam', 'eylam'],
    capitalFa: ['ایلام'],
    capitalEnAliases: ['ilam', 'eylam'],
  },
  {
    slug: 'khuzestan',
    fa: 'خوزستان',
    enAliases: ['khuzestan'],
    capitalFa: ['اهواز'],
    capitalEnAliases: ['ahvaz', 'ahwaz'],
  },
{
  slug: 'chaharmahal-and-bakhtiari',
  fa: 'چهارمحال و بختیاری',
  enAliases: [
    'chaharmahal and bakhtiari',
    'chaharmahal va bakhtiari',
    'chahar mahal bakhtiari',
  ],
    capitalFa: ['شهرکرد'],
    capitalEnAliases: ['shahrekord', 'shahr e kord', 'shahre kord'],
  },
  {
    slug: 'kohgiluyeh-and-boyer-ahmad',
    fa: 'کهگیلویه و بویراحمد',
    enAliases: [
      'kohgiluyeh and boyer ahmad',
      'kohgiluyeh va boyer ahmad',
      'boyer ahmad and kohgiluyeh',
      'kohgiluyeh and buyer ahmad',
      'kohgiluyeh',
    ],
    capitalFa: ['یاسوج'],
    capitalEnAliases: ['yasuj', 'yasouj'],
  },
  {
    slug: 'fars',
    fa: 'فارس',
    enAliases: ['fars'],
    capitalFa: ['شیراز'],
    capitalEnAliases: ['shiraz'],
  },
  {
    slug: 'bushehr',
    fa: 'بوشهر',
    enAliases: ['bushehr', 'bushire'],
    capitalFa: ['بوشهر'],
    capitalEnAliases: ['bushehr', 'bushire'],
  },
  {
    slug: 'hormozgan',
    fa: 'هرمزگان',
    enAliases: ['hormozgan'],
    capitalFa: ['بندرعباس', 'بندر عباس'],
    capitalEnAliases: ['bandar abbas', 'bandarabbas'],
  },
  {
    slug: 'sistan-and-baluchestan',
    fa: 'سیستان و بلوچستان',
    enAliases: [
      'sistan and baluchestan',
      'sistan va baluchestan',
      'sistan and baluchistan',
      'sistan baluchestan',
    ],
    capitalFa: ['زاهدان'],
    capitalEnAliases: ['zahedan'],
  },
  {
    slug: 'kerman',
    fa: 'کرمان',
    enAliases: ['kerman'],
    capitalFa: ['کرمان'],
    capitalEnAliases: ['kerman'],
  },
  {
    slug: 'yazd',
    fa: 'یزد',
    enAliases: ['yazd'],
    capitalFa: ['یزد'],
    capitalEnAliases: ['yazd'],
  },
  {
    slug: 'isfahan',
    fa: 'اصفهان',
    enAliases: ['isfahan', 'esfahan', 'esfehan'],
    capitalFa: ['اصفهان'],
    capitalEnAliases: ['isfahan', 'esfahan', 'esfehan'],
  },
  {
    slug: 'south-khorasan',
    fa: 'خراسان جنوبی',
    enAliases: [
      'south khorasan',
      'southern khorasan',
      'khorasan e jonubi',
      'khorasan jonubi',
    ],
    capitalFa: ['بیرجند'],
    capitalEnAliases: ['birjand'],
  },
  {
    slug: 'razavi-khorasan',
    fa: 'خراسان رضوی',
    enAliases: [
      'razavi khorasan',
      'khorasan e razavi',
      'khorasan razavi',
    ],
    capitalFa: ['مشهد'],
    capitalEnAliases: ['mashhad'],
  },
  {
    slug: 'north-khorasan',
    fa: 'خراسان شمالی',
    enAliases: [
      'north khorasan',
      'northern khorasan',
      'khorasan e shomali',
      'khorasan shomali',
    ],
    capitalFa: ['بجنورد'],
    capitalEnAliases: ['bojnord', 'bojnurd', 'bojnoord'],
  },
  {
    slug: 'golestan',
    fa: 'گلستان',
    enAliases: ['golestan'],
    capitalFa: ['گرگان'],
    capitalEnAliases: ['gorgan'],
  },
  {
    slug: 'mazandaran',
    fa: 'مازندران',
    enAliases: ['mazandaran'],
    capitalFa: ['ساری'],
    capitalEnAliases: ['sari'],
  },
  {
    slug: 'gilan',
    fa: 'گیلان',
    enAliases: ['gilan', 'geelan'],
    capitalFa: ['رشت'],
    capitalEnAliases: ['rasht'],
  },
];

const EXPECTED_PROVINCE_SLUGS = new Set(PROVINCES.map((p) => p.slug));

const EXCLUDED_FEATURE_CODES = new Set([
  'PPLX', // section of populated place
  'PPLL', // populated locality
  'PPLQ', // abandoned populated place
  'PPLW', // destroyed populated place
  'PPLR', // religious populated place
  'STLMT', // settlement
]);

const aliasToSlug = new Map<string, string>();
const capitalEnAliasesByProvince = new Map<string, Set<string>>();
const capitalFaByProvince = new Map<string, Set<string>>();

for (const province of PROVINCES) {
  const provinceAliases = new Set<string>([
    province.slug.replaceAll('-', ' '),
    ...province.enAliases,
  ]);

  for (const alias of provinceAliases) {
    const key = normalizeEn(alias);
    if (!key) continue;

    if (aliasToSlug.has(key)) {
      throw new Error(
        `Duplicate province alias: "${alias}" for slug "${province.slug}"`
      );
    }

    aliasToSlug.set(key, province.slug);
  }

  capitalEnAliasesByProvince.set(
    province.slug,
    new Set(province.capitalEnAliases.map(normalizeEn))
  );

  capitalFaByProvince.set(
    province.slug,
    new Set(province.capitalFa.map(normalizeFa))
  );
}

function isCapitalByName(
  provinceSlug: string,
  faName: string,
  asciiName: string
): boolean {
  const enAliases = capitalEnAliasesByProvince.get(provinceSlug);

  if (asciiName && enAliases && enAliases.has(normalizeEn(asciiName))) {
    return true;
  }

  const faAliases = capitalFaByProvince.get(provinceSlug);

  if (faName && faAliases && faAliases.has(normalizeFa(faName))) {
    return true;
  }

  return false;
}

function isProvincialCapitalCandidate(
  provinceSlug: string,
  asciiName: string,
  featureCode: string
): boolean {
  if (featureCode === 'PPLA' || featureCode === 'PPLC') {
    return true;
  }

  return isCapitalByName(provinceSlug, '', asciiName);
}

async function downloadFile(
  url: string,
  filePath: string,
  label: string
): Promise<void> {
  if (fs.existsSync(filePath)) {
    console.log(`Using cached ${label}`);
    return;
  }

  console.log(`Downloading ${label}...`);

  const res = await fetch(url);

  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }

  await fsp.mkdir(path.dirname(filePath), { recursive: true });

  const nodeStream = Readable.fromWeb(res.body as unknown as WebReadableStream);
  const fileStream = fs.createWriteStream(filePath);

  await new Promise<void>((resolve, reject) => {
    nodeStream.pipe(fileStream);
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
    nodeStream.on('error', reject);
  });

  console.log(`Finished downloading ${label}`);
}

async function parseAdmin1(filePath: string): Promise<{
  codeToSlug: Map<string, string>;
  warnings: string[];
}> {
  const codeToSlug = new Map<string, string>();
  const slugToCode = new Map<string, string>();
  const matchedSlugs = new Set<string>();
  const unmatched: string[] = [];
  const warnings: string[] = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.startsWith('IR.')) continue;

    const parts = line.split('\t');
    const rawCode = parts[0]?.trim();
    if (!rawCode) continue;

    const code = rawCode.replace(/^IR\./, '');

    const name = parts[1] ?? '';
    const asciiName = parts[2] ?? '';

    const slug =
      aliasToSlug.get(normalizeEn(name)) ??
      aliasToSlug.get(normalizeEn(asciiName));

    if (!slug) {
      unmatched.push(`${code} | ${name} | ${asciiName}`);
      continue;
    }

    const existingSlugForCode = codeToSlug.get(code);
    if (existingSlugForCode && existingSlugForCode !== slug) {
      throw new Error(
        `Conflicting province mapping for code ${code}: ${existingSlugForCode} vs ${slug}`
      );
    }

    const existingCodeForSlug = slugToCode.get(slug);
    if (existingCodeForSlug && existingCodeForSlug !== code) {
      throw new Error(
        `Multiple GeoNames admin codes map to province slug "${slug}": ${existingCodeForSlug} and ${code}`
      );
    }

    codeToSlug.set(code, slug);
    slugToCode.set(slug, code);
    matchedSlugs.add(slug);
  }

  const missing = [...EXPECTED_PROVINCE_SLUGS].filter(
    (slug) => !matchedSlugs.has(slug)
  );

  if (missing.length > 0 || matchedSlugs.size !== 31) {
    throw new Error(
      `Province mapping failed. Expected 31 provinces.\nMissing: ${missing.join(
        ', '
      )}\nUnmatched rows: ${unmatched.join(' | ')}`
    );
  }

  if (unmatched.length > 0) {
    warnings.push(
      `${unmatched.length} unmatched IR admin1 rows were ignored because all 31 provinces matched.`
    );
  }

  return { codeToSlug, warnings };
}

async function forEachLineInZipEntry(
  zipPath: string,
  entryRegex: RegExp,
  onLine: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      let finished = false;

      const fail = (error: Error) => {
        if (!finished) {
          finished = true;
          reject(error);
        }
      };

      const succeed = () => {
        if (!finished) {
          finished = true;
          resolve();
        }
      };

      zipfile.on('entry', (entry) => {
        if (finished) return;

        if (entryRegex.test(entry.fileName)) {
          zipfile.openReadStream(entry, (streamErr, stream) => {
            if (streamErr) return fail(streamErr);
            if (!stream) return fail(new Error('ZIP entry stream was empty'));

            const rl = readline.createInterface({
              input: stream,
              crlfDelay: Infinity,
            });

            rl.on('line', (line) => {
              if (finished) return;

              try {
                onLine(line);
              } catch (error) {
                fail(error as Error);
                rl.close();
              }
            });

            rl.on('error', fail);

            rl.on('close', () => {
              if (!finished) zipfile.readEntry();
            });
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on('end', succeed);
      zipfile.on('error', fail);

      zipfile.readEntry();
    });
  });
}

async function parseCitiesFromIrZip(
  zipPath: string,
  codeToSlug: Map<string, string>
): Promise<Map<number, CandidateCity>> {
  const candidates = new Map<number, CandidateCity>();

  await forEachLineInZipEntry(zipPath, /IR\.txt$/i, (line) => {
    const parts = line.split('\t');

    if (parts[GEO_COL.COUNTRY_CODE] !== 'IR') return;
    if (parts[GEO_COL.FEATURE_CLASS] !== 'P') return;

    const featureCode = parts[GEO_COL.FEATURE_CODE] ?? '';

    if (!featureCode.startsWith('PPL')) return;
    if (EXCLUDED_FEATURE_CODES.has(featureCode)) return;

    const admin1Code = parts[GEO_COL.ADMIN1_CODE] ?? '';
    const provinceSlug = codeToSlug.get(admin1Code);

    if (!provinceSlug) return;

    const geonameId = Number.parseInt(parts[GEO_COL.GEONAMEID] ?? '', 10);
    if (!Number.isInteger(geonameId)) return;

    const asciiName = parts[GEO_COL.ASCII_NAME] ?? '';
    const population =
      Number.parseInt(parts[GEO_COL.POPULATION] ?? '0', 10) || 0;

    const isCapital = isProvincialCapitalCandidate(
      provinceSlug,
      asciiName,
      featureCode
    );

    if (!isCapital && population < 15000) return;

    candidates.set(geonameId, {
      geonameId,
      asciiName,
      provinceSlug,
      population,
      isCapital,
      faNames: [],
    });
  });

  return candidates;
}

async function parsePersianAlternateNames(
  zipPath: string,
  candidates: Map<number, CandidateCity>
): Promise<number> {
  let matchedNames = 0;

  await forEachLineInZipEntry(
    zipPath,
    /alternateNamesV2\.txt$/i,
    (line) => {
      // Fast prefilter before splitting the huge alternate-names file.
      if (!line.includes('\tfa\t')) return;

      const parts = line.split('\t');
      if (parts.length < 4) return;

      const geonameId = Number.parseInt(parts[1] ?? '', 10);
      if (!Number.isInteger(geonameId)) return;

      const candidate = candidates.get(geonameId);
      if (!candidate) return;

      if (parts[2] !== 'fa') return;

      const isHistoric = parts[7] === '1';
      if (isHistoric) return;

      const rawName = parts[3] ?? '';
      const name = normalizeFa(rawName);

      if (!isPersianName(name)) return;

      candidate.faNames.push({
        value: name,
        preferred: parts[4] === '1',
      });

      matchedNames += 1;
    }
  );

  return matchedNames;
}

function chooseBetterRecord(a: PreCity, b: PreCity): PreCity {
  if (a.isCapital !== b.isCapital) {
    return a.isCapital ? a : b;
  }

  if (a.population !== b.population) {
    return a.population > b.population ? a : b;
  }

  return a.geonameId < b.geonameId ? a : b;
}

function buildCityRecords(
  candidates: Map<number, CandidateCity>,
  duplicateNameResolutions: string[]
): {
  preCities: PreCity[];
  noFaSkipped: number;
} {
  const uniqueByName = new Map<string, PreCity>();
  let noFaSkipped = 0;

  for (const candidate of candidates.values()) {
    if (candidate.faNames.length === 0) {
      noFaSkipped += 1;
      continue;
    }

    const preferred =
      candidate.faNames.find((n) => n.preferred) ?? candidate.faNames[0];

    const name = preferred.value;
    const nameKey = `${candidate.provinceSlug}::${name}`;

    const baseSlug =
      slugifyAscii(candidate.asciiName) || `city-${candidate.geonameId}`;

    const isCapital =
      candidate.isCapital ||
      isCapitalByName(candidate.provinceSlug, name, candidate.asciiName);

    const record: PreCity = {
      name,
      asciiName: candidate.asciiName,
      provinceSlug: candidate.provinceSlug,
      geonameId: candidate.geonameId,
      population: candidate.population,
      baseSlug,
      isCapital,
    };

    const existing = uniqueByName.get(nameKey);

    if (!existing) {
      uniqueByName.set(nameKey, record);
      continue;
    }

    const chosen = chooseBetterRecord(existing, record);
    const dropped = chosen === existing ? record : existing;

    duplicateNameResolutions.push(
      `Province "${candidate.provinceSlug}" city "${name}": kept geonameId ${chosen.geonameId}, dropped geonameId ${dropped.geonameId}`
    );

    uniqueByName.set(nameKey, chosen);
  }

  return {
    preCities: [...uniqueByName.values()],
    noFaSkipped,
  };
}

function assignCitySlugs(
  records: PreCity[],
  duplicateSlugResolutions: string[]
): InternalCity[] {
  const groups = new Map<string, PreCity[]>();

  for (const record of records) {
    const key = `${record.provinceSlug}::${record.baseSlug}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key)!.push(record);
  }

  const provinceSeenSlugs = new Map<string, Set<string>>();
  const finalCities: InternalCity[] = [];

  const sortedGroupKeys = [...groups.keys()].sort((a, b) =>
    a.localeCompare(b)
  );

  for (const key of sortedGroupKeys) {
    const list = groups.get(key)!.sort((a, b) => a.geonameId - b.geonameId);
    const provinceSlug = list[0].provinceSlug;

    let seen = provinceSeenSlugs.get(provinceSlug);
    if (!seen) {
      seen = new Set();
      provinceSeenSlugs.set(provinceSlug, seen);
    }

    for (const record of list) {
      let slug = record.baseSlug;
      let suffix = 2;

      while (seen.has(slug)) {
        slug = `${record.baseSlug}-${suffix}`;
        suffix += 1;
      }

      if (slug !== record.baseSlug) {
        duplicateSlugResolutions.push(
          `Province "${provinceSlug}" base slug "${record.baseSlug}" became "${slug}" for geonameId ${record.geonameId}`
        );
      }

      seen.add(slug);

      finalCities.push({
        name: record.name,
        slug,
        provinceSlug: record.provinceSlug,
        geonameId: record.geonameId,
        asciiName: record.asciiName,
        isCapital: record.isCapital,
      });
    }
  }

  finalCities.sort(
    (a, b) =>
      a.provinceSlug.localeCompare(b.provinceSlug) ||
      a.slug.localeCompare(b.slug)
  );

  return finalCities;
}

function findMissingCapitals(internalCities: InternalCity[]): string[] {
  const found = new Set<string>();

  for (const city of internalCities) {
    if (
      city.isCapital ||
      isCapitalByName(city.provinceSlug, city.name, city.asciiName)
    ) {
      found.add(city.provinceSlug);
    }
  }

  return PROVINCES.filter((p) => !found.has(p.slug)).map(
    (p) => `${p.slug} (${p.fa})`
  );
}

function buildReport(args: {
  dataset: Dataset;
  internalCities: InternalCity[];
  missingCapitals: string[];
  duplicateNameResolutions: string[];
  duplicateSlugResolutions: string[];
  warnings: string[];
}): string {
  const {
    dataset,
    internalCities,
    missingCapitals,
    duplicateNameResolutions,
    duplicateSlugResolutions,
    warnings,
  } = args;

  const provinceCityCounts = new Map<string, number>();

  for (const city of internalCities) {
    provinceCityCounts.set(
      city.provinceSlug,
      (provinceCityCounts.get(city.provinceSlug) ?? 0) + 1
    );
  }

  const lines: string[] = [];

  lines.push(`Generated at: ${dataset.metadata.generatedAt}`);
  lines.push(`Source: ${dataset.metadata.source}`);
  lines.push(`License: ${dataset.metadata.license}`);
  lines.push('');
  lines.push(`Provinces: ${dataset.provinces.length}`);
  lines.push(`Cities: ${dataset.cities.length}`);
  lines.push(`Provincial capitals: ${31 - missingCapitals.length}`);
  lines.push('');
  lines.push('Province city counts:');

  for (const province of PROVINCES) {
    const count = provinceCityCounts.get(province.slug) ?? 0;
    lines.push(`${province.slug} | ${province.fa} | cities: ${count}`);
  }

  lines.push('');
  lines.push('Missing capitals:');

  if (missingCapitals.length === 0) {
    lines.push('none');
  } else {
    lines.push(...missingCapitals);
  }

  lines.push('');
  lines.push('Duplicate name resolutions:');

  if (duplicateNameResolutions.length === 0) {
    lines.push('none');
  } else {
    lines.push(...duplicateNameResolutions);
  }

  lines.push('');
  lines.push('Duplicate slug resolutions:');

  if (duplicateSlugResolutions.length === 0) {
    lines.push('none');
  } else {
    lines.push(...duplicateSlugResolutions);
  }

  lines.push('');
  lines.push('Warnings:');

  if (warnings.length === 0) {
    lines.push('none');
  } else {
    lines.push(...warnings);
  }

  return lines.join('\n');
}

function validateDataset(
  dataset: Dataset,
  missingCapitals: string[]
): void {
  const errors: string[] = [];

  if (dataset.provinces.length !== 31) {
    errors.push(`Province count is ${dataset.provinces.length}, expected 31.`);
  }

  const provinceSlugs = new Set<string>();

  for (const province of dataset.provinces) {
    if (!EXPECTED_PROVINCE_SLUGS.has(province.slug)) {
      errors.push(`Unexpected province slug: ${province.slug}`);
    }

    if (provinceSlugs.has(province.slug)) {
      errors.push(`Duplicate province slug: ${province.slug}`);
    }

    if (!isPersianName(province.name)) {
      errors.push(`Province name is not Persian: ${province.name}`);
    }

    provinceSlugs.add(province.slug);
  }

  for (const expected of EXPECTED_PROVINCE_SLUGS) {
    if (!provinceSlugs.has(expected)) {
      errors.push(`Missing expected province slug: ${expected}`);
    }
  }

  if (dataset.cities.length === 0) {
    errors.push('No cities were generated.');
  }

  const citySlugSeen = new Set<string>();
  const cityNameSeen = new Set<string>();

  for (const city of dataset.cities) {
    if (!provinceSlugs.has(city.provinceSlug)) {
      errors.push(
        `City "${city.name}" references missing provinceSlug "${city.provinceSlug}"`
      );
    }

    if (!Number.isInteger(city.geonameId)) {
      errors.push(`City "${city.name}" has invalid geonameId.`);
    }

    if (!isPersianName(city.name)) {
      errors.push(`City name is not Persian: ${city.name}`);
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(city.slug)) {
      errors.push(`City slug is not ASCII-safe: ${city.slug}`);
    }

    const slugKey = `${city.provinceSlug}::${city.slug}`;
    const nameKey = `${city.provinceSlug}::${city.name}`;

    if (citySlugSeen.has(slugKey)) {
      errors.push(`Duplicate city slug: ${slugKey}`);
    }

    if (cityNameSeen.has(nameKey)) {
      errors.push(`Duplicate city name in province: ${nameKey}`);
    }

    citySlugSeen.add(slugKey);
    cityNameSeen.add(nameKey);
  }

  if (missingCapitals.length > 0) {
    errors.push(
      `Missing provincial capitals: ${missingCapitals.join(', ')}`
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Dataset validation failed:\n${errors.slice(0, 30).join('\n')}`
    );
  }
}

async function main(): Promise<void> {
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });

  const admin1Path = path.join(CACHE_DIR, 'admin1CodesASCII.txt');
  const irPath = path.join(CACHE_DIR, 'IR.zip');
  const altNamesPath = path.join(CACHE_DIR, 'alternateNamesV2.zip');

  await downloadFile(ADMIN1_URL, admin1Path, 'admin1CodesASCII.txt');
  await downloadFile(IR_URL, irPath, 'IR.zip');
  await downloadFile(ALT_NAMES_URL, altNamesPath, 'alternateNamesV2.zip');

  const warnings: string[] = [];
  const duplicateNameResolutions: string[] = [];
  const duplicateSlugResolutions: string[] = [];

  console.log('Parsing provinces...');
  const adminResult = await parseAdmin1(admin1Path);
  warnings.push(...adminResult.warnings);

  console.log('Parsing candidate cities from IR.zip...');
  const candidates = await parseCitiesFromIrZip(
    irPath,
    adminResult.codeToSlug
  );

  console.log(`Candidate cities before Persian-name filter: ${candidates.size}`);

  console.log(
    'Reading Persian alternate names from ZIP. This may take a while...'
  );

  const matchedNames = await parsePersianAlternateNames(
    altNamesPath,
    candidates
  );

  console.log(`Matched Persian alternate names: ${matchedNames}`);

  const { preCities, noFaSkipped } = buildCityRecords(
    candidates,
    duplicateNameResolutions
  );

  if (noFaSkipped > 0) {
    warnings.push(
      `${noFaSkipped} candidate cities were skipped because they had no reliable Persian fa alternate name.`
    );
  }

  if (duplicateNameResolutions.length > 0) {
    warnings.push(
      `${duplicateNameResolutions.length} duplicate city-name resolutions were applied.`
    );
  }

  const internalCities = assignCitySlugs(
    preCities,
    duplicateSlugResolutions
  );

  if (duplicateSlugResolutions.length > 0) {
    warnings.push(
      `${duplicateSlugResolutions.length} duplicate city-slug resolutions were applied.`
    );
  }

  const missingCapitals = findMissingCapitals(internalCities);
  const provincialCapitalCount = 31 - missingCapitals.length;

  const outputCities: OutputCity[] = internalCities.map(
    ({ name, slug, provinceSlug, geonameId }) => ({
      name,
      slug,
      provinceSlug,
      geonameId,
    })
  );

  const dataset: Dataset = {
    metadata: {
      source: 'GeoNames',
      license: 'CC BY 4.0',
      generatedAt: new Date().toISOString().slice(0, 10),
    },
    provinces: PROVINCES.map((p) => ({
      name: p.fa,
      slug: p.slug,
    })),
    cities: outputCities,
  };

  const report = buildReport({
    dataset,
    internalCities,
    missingCapitals,
    duplicateNameResolutions,
    duplicateSlugResolutions,
    warnings,
  });

  await fsp.writeFile(REPORT_FILE, report, 'utf8');
  console.log(`Report written: ${REPORT_FILE}`);

  console.log('Validating dataset...');
  validateDataset(dataset, missingCapitals);

  await fsp.writeFile(
    OUTPUT_FILE,
    JSON.stringify(dataset, null, 2),
    'utf8'
  );

  console.log(`Generated: ${OUTPUT_FILE}`);
  console.log('');
  console.log('=== RESULT ===');
  console.log(`Provinces: ${dataset.provinces.length}`);
  console.log(`Cities: ${dataset.cities.length}`);
  console.log(`Provincial capitals: ${provincialCapitalCount}`);

  if (warnings.length > 0) {
    console.warn(`Warnings: ${warnings.join(' | ')}`);
  } else {
    console.log('Warnings: none');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});