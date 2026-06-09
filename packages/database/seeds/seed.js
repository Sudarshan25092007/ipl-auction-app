const { Client } = require('pg');
const path = require('path');
const dotenv = require('dotenv');
const XLSX = require('xlsx');

dotenv.config({ path: path.join(__dirname, '../../../.env') });

function parsePrice(val) {
  if (!val) return 20; // Default min base price (20L)
  const str = val.toString().toLowerCase().replace(/\s+/g, '');
  if (str.endsWith('cr')) {
    return parseFloat(str) * 100; // 2cr -> 200 Lakhs
  }
  if (str.endsWith('l') || str.endsWith('lakh')) {
    return parseFloat(str);
  }
  const num = parseFloat(str);
  if (!isNaN(num)) {
    return num < 10 ? num * 100 : num;
  }
  return 20;
}

async function seed() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ Error: DATABASE_URL environment variable is missing.');
    console.error('Please configure DATABASE_URL in the root .env file.');
    process.exit(1);
  }

  const excelPath = path.resolve(__dirname, '../../../IPL MOCK UPDATED AUCTION.xlsx');
  console.info(`[Seed] Loading Excel sheet from: ${excelPath}`);

  let workbook;
  try {
    workbook = XLSX.readFile(excelPath);
  } catch (err) {
    console.error(`❌ Failed to read Excel file at ${excelPath}:`, err.message);
    process.exit(1);
  }

  const sheet = workbook.Sheets['Sheet1'];
  if (!sheet) {
    console.error('❌ Error: Sheet named "Sheet1" not found in the Excel workbook.');
    process.exit(1);
  }

  const data = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.info(`[Seed] Excel loaded. Parsing ${data.length} raw rows...`);

  const colPairs = [
    { nameKey: '__EMPTY', priceKey: '__EMPTY_1' },
    { nameKey: '__EMPTY_3', priceKey: '__EMPTY_4' },
    { nameKey: '__EMPTY_6', priceKey: '__EMPTY_7' },
    { nameKey: '__EMPTY_9', priceKey: '__EMPTY_10' },
    { nameKey: '__EMPTY_12', priceKey: '__EMPTY_13' },
    { nameKey: '__EMPTY_15', priceKey: '__EMPTY_16' },
    { nameKey: '__EMPTY_18', priceKey: '__EMPTY_19' },
  ];

  const playersToSeed = [];

  colPairs.forEach((pair) => {
    let currentCategory = '';

    for (let r = 0; r < data.length; r++) {
      const row = data[r];
      const nameVal = row[pair.nameKey];
      const priceVal = row[pair.priceKey];

      if (!nameVal) continue;

      const nameStr = nameVal.toString().trim();
      const priceStr = priceVal ? priceVal.toString().trim() : '';

      const isHeader =
        priceStr.toLowerCase().includes('base price') ||
        nameStr.toLowerCase().includes('batters') ||
        nameStr.toLowerCase().includes('pacers') ||
        nameStr.toLowerCase().includes('spinners') ||
        nameStr.toLowerCase().includes('allrounders') ||
        nameStr.toLowerCase().includes('all rounders') ||
        nameStr.toLowerCase().includes('wicket') ||
        nameStr.toLowerCase().includes('retired');

      if (isHeader) {
        currentCategory = nameStr;
        continue;
      }

      if (!currentCategory) continue;

      const basePriceLakhs = parsePrice(priceStr);

      const catLower = currentCategory.toLowerCase();
      const isMarquee = catLower.includes('premium') || catLower.includes('marquee');
      const nationality = catLower.includes('overseas') || catLower.includes('retired') ? 'overseas' : 'indian';
      const isCapped = !catLower.includes('uncapped');

      let role = 'batter';
      if (catLower.includes('batters') || catLower.includes('batting')) {
        role = 'batter';
      } else if (
        catLower.includes('pacers') ||
        catLower.includes('bowlers') ||
        catLower.includes('bowler') ||
        catLower.includes('pacer')
      ) {
        role = 'pacer';
      } else if (catLower.includes('spinners') || catLower.includes('spinner')) {
        role = 'spinner';
      } else if (
        catLower.includes('allrounders') ||
        catLower.includes('all rounders') ||
        catLower.includes('allrounder')
      ) {
        role = 'allrounder';
      } else if (catLower.includes('wicket') || catLower.includes('wk')) {
        role = 'wk';
      }

      playersToSeed.push({
        name: nameStr,
        category: currentCategory,
        role,
        nationality,
        isMarquee,
        isCapped,
        basePriceLakhs,
      });
    }
  });

  console.info(`[Seed] Successfully parsed ${playersToSeed.length} players from Excel grid.`);

  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('supabase.co') || dbUrl.includes('pooler.supabase.com')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    await client.connect();
    console.info('🔌 Connected to database. Executing upsert operations...');

    for (const player of playersToSeed) {
      await client.query(
        `INSERT INTO players (id, name, category, role, nationality, is_marquee, is_capped, base_price_lakhs)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (name) DO UPDATE SET
           category = EXCLUDED.category,
           role = EXCLUDED.role,
           nationality = EXCLUDED.nationality,
           is_marquee = EXCLUDED.is_marquee,
           is_capped = EXCLUDED.is_capped,
           base_price_lakhs = EXCLUDED.base_price_lakhs`,
        [
          player.name,
          player.category,
          player.role,
          player.nationality,
          player.isMarquee,
          player.isCapped,
          player.basePriceLakhs,
        ]
      );
    }

    console.info(`🎉 Seeding completed! Database is fully populated with ${playersToSeed.length} players.`);
  } catch (err) {
    console.error('❌ Seeding transaction failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
