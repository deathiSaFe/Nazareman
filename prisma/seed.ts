import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ProvinceSeed = {
  name: string;
  slug: string;
};

type CitySeed = {
  name: string;
  slug: string;
  provinceSlug: string;
  geonameId: number;
};

type LocationSeed = {
  metadata?: {
    source?: string;
    license?: string;
    generatedAt?: string;
  };
  provinces: ProvinceSeed[];
  cities: CitySeed[];
};

function chunk<T>(input: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let i = 0; i < input.length; i += size) {
    result.push(input.slice(i, i + size));
  }

  return result;
}

async function readSeedData(): Promise<LocationSeed> {
  const seedFilePath = path.join(
    process.cwd(),
    'prisma',
    'seed-data',
    'iran-locations.json'
  );

  try {
    const fileContents = await fs.readFile(seedFilePath, 'utf8');
    return JSON.parse(fileContents) as LocationSeed;
  } catch (error) {
    throw new Error(
      `Failed to read seed data at ${seedFilePath}. ` +
        `Make sure prisma/seed-data/iran-locations.json exists.\n` +
        String(error)
    );
  }
}

function validateSeedData(data: LocationSeed): void {
  if (!Array.isArray(data.provinces)) {
    throw new Error('Seed data is invalid: provinces must be an array.');
  }

  if (!Array.isArray(data.cities)) {
    throw new Error('Seed data is invalid: cities must be an array.');
  }

  if (data.provinces.length !== 31) {
    throw new Error(
      `Seed data is invalid: expected exactly 31 provinces, received ${data.provinces.length}.`
    );
  }

  if (data.cities.length === 0) {
    throw new Error('Seed data is invalid: cities array is empty.');
  }

  const provinceSlugs = new Set<string>();

  for (const province of data.provinces) {
    if (typeof province.name !== 'string' || province.name.trim() === '') {
      throw new Error('Seed data is invalid: province name is missing.');
    }

    if (typeof province.slug !== 'string' || province.slug.trim() === '') {
      throw new Error('Seed data is invalid: province slug is missing.');
    }

    if (provinceSlugs.has(province.slug)) {
      throw new Error(
        `Seed data is invalid: duplicate province slug "${province.slug}".`
      );
    }

    provinceSlugs.add(province.slug);
  }

  const citySlugKeys = new Set<string>();
  const cityNameKeys = new Set<string>();

  for (const city of data.cities) {
    if (typeof city.name !== 'string' || city.name.trim() === '') {
      throw new Error('Seed data is invalid: city name is missing.');
    }

    if (typeof city.slug !== 'string' || city.slug.trim() === '') {
      throw new Error('Seed data is invalid: city slug is missing.');
    }

    if (typeof city.provinceSlug !== 'string' || city.provinceSlug.trim() === '') {
      throw new Error('Seed data is invalid: city provinceSlug is missing.');
    }

    if (!Number.isInteger(city.geonameId)) {
      throw new Error(
        `Seed data is invalid: city "${city.name}" has invalid geonameId.`
      );
    }

    if (!provinceSlugs.has(city.provinceSlug)) {
      throw new Error(
        `Seed data is invalid: city "${city.name}" references missing provinceSlug "${city.provinceSlug}".`
      );
    }

    const slugKey = `${city.provinceSlug}::${city.slug}`;
    const nameKey = `${city.provinceSlug}::${city.name}`;

    if (citySlugKeys.has(slugKey)) {
      throw new Error(
        `Seed data is invalid: duplicate city slug in province: ${slugKey}`
      );
    }

    if (cityNameKeys.has(nameKey)) {
      throw new Error(
        `Seed data is invalid: duplicate city name in province: ${nameKey}`
      );
    }

    citySlugKeys.add(slugKey);
    cityNameKeys.add(nameKey);
  }
}

async function printCounts(): Promise<void> {
  const provinceCount = await prisma.province.count();
  const cityCount = await prisma.city.count();
  const suggestionCount = await prisma.topicTypeSuggestion.count();

  console.log(`Province count: ${provinceCount}`);
  console.log(`City count: ${cityCount}`);
  console.log(`Topic type suggestion count: ${suggestionCount}`);
}

/**
 * Canonical pool of topic-type labels. Users pick from these (via the
 * autocomplete); brand-new labels they enter are stored as PENDING_REVIEW
 * suggestions for admin review instead of joining this pool directly.
 */
const TOPIC_TYPE_SUGGESTIONS: string[] = [
  // خودرو و موتور
  'مکانیکی خودرو',
  'مکانیکی موتور',
  'مکانیکی سنگین',
  'تعمیرگاه خودرو',
  'باطری‌سازی',
  'فروش باتری خودرو',
  'جلوبندی',
  'صافکاری',
  'نقاشی خودرو',
  'برق خودرو',
  'تعویض روغن',
  'لاستیک و رینگ',
  'کارواش',
  'روکش صندلی خودرو',
  'شیشه خودرو',
  'دزدگیر خودرو',
  'کولر خودرو',
  'اگزوزسازی',
  'لوازم یدکی خودرو',
  'فروش خودرو',
  'فروش موتورسیکلت',
  'تعمیر موتورسیکلت',
  'آپاراتی',
  'اتوگلاس',
  'تزئینات خودرو',

  // غذا و نوشیدنی
  'رستوران',
  'فست‌فود',
  'کافی‌شاپ',
  'قنادی',
  'شیرینی‌پزی',
  'کبابی',
  'جوجه‌کبابی',
  'پیتزا',
  'ساندویچی',
  'فلافلی',
  'بستنی‌فروشی',
  'نانوایی',
  'قصابی',
  'سوپرمارکت',
  'هایپرمارکت',
  'میوه‌فروشی',
  'سبزی‌فروشی',
  'ماهی‌فروشی',
  'بقالی',
  'اغذیه‌فروشی',
  'آبمیوه و بستنی',
  'لبنیات',
  'قهوه‌خانه سنتی',
  'چایخانه',

  // زیبایی و آرایش
  'آرایشگاه مردانه',
  'آرایشگاه زنانه',
  'سالن زیبایی',
  'پیرایشگاه',
  'ناخن‌کار',
  'میکاپ',
  'آرایشگر عروس',
  'لیزر موهای زائد',
  'تاتو',
  'پاکسازی پوست',
  'گریم',

  // آموزش
  'مدرسه',
  'دبستان',
  'دبیرستان',
  'پیش‌دبستانی',
  'مهدکودک',
  'آموزشگاه زبان',
  'آموزشگاه کنکور',
  'آموزشگاه موسیقی',
  'آموزشگاه هنری',
  'آموزشگاه رانندگی',
  'آموزشگاه فنی‌وحرفه‌ای',
  'آموزشگاه کامپیوتر',
  'دانشگاه',
  'دانشکده',
  'معلم خصوصی',
  'استاد دانشگاه',
  'استاد زبان',
  'استاد ریاضی',
  'استاد فیزیک',
  'استاد شیمی',
  'معلم',
  'مشاور تحصیلی',
  'کلاس تقویتی',

  // پزشکی و سلامت
  'پزشک',
  'پزشک عمومی',
  'دکتر',
  'متخصص داخلی',
  'متخصص قلب',
  'متخصص مغز و اعصاب',
  'متخصص پوست و مو',
  'متخصص چشم',
  'متخصص گوش و حلق و بینی',
  'متخصص اطفال',
  'متخصص ارتوپدی',
  'متخصص کلیه و مجاری ادرار',
  'متخصص زنان و زایمان',
  'متخصص گوارش',
  'روانپزشک',
  'دندانپزشک',
  'متخصص ارتودنسی',
  'جراح',
  'چشم‌پزشک',
  'داروخانه',
  'درمانگاه',
  'بیمارستان',
  'آزمایشگاه',
  'رادیولوژی',
  'سونوگرافی',
  'فیزیوتراپی',
  'پرستار',
  'ماما',
  'بینایی‌سنج',
  'شنوایی‌شناس',
  'روانشناس',
  'مشاوره خانواده',
  'کاردرمانی',
  'گفتاردرمانی',

  // دامپزشکی
  'دامپزشک',
  'بیمارستان دامپزشکی',

  // خانه و ساختمان
  'لوله‌کش',
  'برقکار ساختمان',
  'نقاش ساختمان',
  'کاشی و سرامیک',
  'گچ‌کار',
  'کولرساز',
  'تعمیر کولر گازی',
  'تعمیر لوازم خانگی',
  'تعمیرات موبایل',
  'تعمیرات کامپیوتر',
  'تعمیرات لباسشویی',
  'تعمیرات یخچال',
  'نجاری',
  'آهنگری',
  'جوشکاری',
  'درب و پنجره',
  'شیشه‌بری',
  'کابینت‌ساز',
  'آسانسور',
  'تاسیسات',
  'خدمات نظافت',
  'شرکت نظافتی',
  'مبلمان',

  // حقوقی و مالی
  'وکیل',
  'وکیل دادگستری',
  'دفتر اسناد رسمی',
  'دفتر خدمات قضایی',
  'دفتر پیشخوان دولت',
  'دفتر خدمات',
  'حسابدار',
  'حسابرسی',
  'موسسه حسابداری',
  'مشاور املاک',
  'بیمه',
  'نمایندگی بیمه',
  'صرافی',
  'بانک',

  // تجارت و فروش
  'پوشاک',
  'کیف و کفش',
  'طلافروشی',
  'جواهرفروشی',
  'عینک‌فروشی',
  'عکاسی',
  'آتلیه عکاسی',
  'لوازم آرایشی و بهداشتی',
  'لوازم تحریر',
  'کتاب‌فروشی',
  'اسباب‌بازی‌فروشی',
  'فرش‌فروشی',
  'مبلمان فروشی',
  'لوازم خانگی',
  'موبایل فروشی',
  'کامپیوتر و لپ‌تاپ',
  'لوازم جانبی موبایل',
  'فروشگاه آنلاین',
  'لوازم ورزشی',
  'فروشگاه ابزار',
  'مصالح ساختمانی',
  'لوازم برقی',

  // خدمات و سازمان
  'خشکشویی',
  'قالیشویی',
  'گل‌فروشی',
  'آژانس مسافرتی',
  'تورگردان',
  'هتل',
  'اقامتگاه',
  'سوئیت مبله',
  'تالار پذیرایی',
  'پارکینگ',
  'موسسه خیریه',
  'سازمان غیردولتی',
  'شرکت پیمانکاری',
  'شرکت مهندسی',
  'شرکت تبلیغاتی',
  'چاپ و تکثیر',
  'چاپخانه',
  'بسته‌بندی',
  'باربری',
  'اجاره خودرو',
  'شرکت ساختمانی',
  'دفتر مهندسی',

  // ورزش و سرگرمی
  'باشگاه ورزشی',
  'باشگاه بدنسازی',
  'باشگاه پیلاتس',
  'باشگاه یوگا',
  'استخر',
  'زمین فوتبال',
  'مربی خصوصی',
  'سینما',
  'تئاتر',
  'نگارخانه',
  'موزه',
  'پارک',
  'شهربازی',

  // کشاورزی و صنعت
  'باغبانی',
  'گلخانه',
  'کشاورزی',
  'دامداری',
  'مرغداری',
  'زنبورداری',
  'تولیدی پوشاک',
  'تولیدی صنایع غذایی',
  'کارخانه',
  'کارگاه تولیدی',
  'سنگبری',

  // فرهنگ و رسانه
  'ناشر',
  'انتشارات',
  'کتابخانه',
  'سایت خبری',
  'پادکست',

  // حمل و نقل
  'تاکسی اینترنتی',
  'راننده',
  'اتوبوس گردشگری',

  // سایر خدمات
  'خدمات اینترنت',
  'شرکت اینترنتی',
  'طراحی سایت',
  'طراحی گرافیک',
  'مونتاژ کامپیوتر',
  'خدمات اداری',
  'ترجمه',
  'تایپ و تکثیر',
];

async function seedTopicTypeSuggestions(): Promise<void> {
  console.log(
    `Seeding ${TOPIC_TYPE_SUGGESTIONS.length} approved topic type suggestions...`
  );

  const operations = TOPIC_TYPE_SUGGESTIONS.map((label) =>
    prisma.topicTypeSuggestion.upsert({
      where: { label },
      update: { status: 'APPROVED' },
      create: { label, status: 'APPROVED' },
    })
  );

  const operationChunks = chunk(operations, 25);

  for (let chunkIndex = 0; chunkIndex < operationChunks.length; chunkIndex += 1) {
    const operationChunk = operationChunks[chunkIndex];

    console.log(
      `Seeding topic type suggestion chunk ${chunkIndex + 1}/${operationChunks.length}...`
    );

    await prisma.$transaction(operationChunk);
  }
}

async function seedProvinces(provinces: ProvinceSeed[]): Promise<Map<string, string>> {
  console.log(`Seeding ${provinces.length} provinces...`);

  const provinceRecords = await prisma.$transaction(
    provinces.map((province) =>
      prisma.province.upsert({
        where: { slug: province.slug },
        update: { name: province.name },
        create: {
          name: province.name,
          slug: province.slug,
        },
        select: {
          id: true,
          slug: true,
        },
      })
    )
  );

  const provinceSlugToId = new Map<string, string>();

  for (const province of provinceRecords) {
    provinceSlugToId.set(province.slug, province.id);
  }

  return provinceSlugToId;
}

async function seedCities(
  cities: CitySeed[],
  provinceSlugToId: Map<string, string>
): Promise<void> {
  console.log(`Seeding ${cities.length} cities...`);

  const cityOperations = cities.map((city) => {
    const provinceId = provinceSlugToId.get(city.provinceSlug);

    if (!provinceId) {
      throw new Error(
        `City "${city.name}" references missing provinceSlug "${city.provinceSlug}".`
      );
    }

    return prisma.city.upsert({
      where: {
        provinceId_slug: {
          provinceId,
          slug: city.slug,
        },
      },
      update: {
        name: city.name,
      },
      create: {
        name: city.name,
        slug: city.slug,
        provinceId,
      },
      select: {
        id: true,
      },
    });
  });

  const cityOperationChunks = chunk(cityOperations, 100);

  for (
    let chunkIndex = 0;
    chunkIndex < cityOperationChunks.length;
    chunkIndex += 1
  ) {
    const cityOperationChunk = cityOperationChunks[chunkIndex];

    console.log(
      `Seeding city chunk ${chunkIndex + 1}/${cityOperationChunks.length}...`
    );

    await prisma.$transaction(cityOperationChunk);
  }
}

async function main(): Promise<void> {
  const countOnly = process.argv.includes('--count-only');
  const suggestionsOnly = process.argv.includes('--suggestions-only');

  if (countOnly) {
    await printCounts();
    return;
  }

  if (suggestionsOnly) {
    await seedTopicTypeSuggestions();

    console.log('Seed completed.');
    await printCounts();
    return;
  }

  const seedData = await readSeedData();

  validateSeedData(seedData);

  const provinceSlugToId = await seedProvinces(seedData.provinces);

  await seedCities(seedData.cities, provinceSlugToId);

  await seedTopicTypeSuggestions();

  console.log('Seed completed.');
  await printCounts();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });