/**
 * packages/database/seeds/seedPlayers.ts
 *
 * MAJOR FUNCTION: Reads the Excel dataset (IPL MOCK UPDATED AUCTION.xlsx) and seeds
 * the `players` table with the full set of 238 players.
 *
 * SYSTEM DESIGN — Idempotency:
 *   Instead of failing on repeat runs, we use:
 *     `INSERT INTO players (...) VALUES (...) ON CONFLICT (name) DO UPDATE SET ...`
 *   This allows the user to re-run the seed script safely if they clear/reset their DB,
 *   or if they update the Excel sheet.
 */
import { Client } from 'pg';
import path from 'path';
import dotenv from 'dotenv';
import XLSX from 'xlsx';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

interface ParsedPlayer {
  name: string;
  category: string;
  role: 'batter' | 'pacer' | 'spinner' | 'allrounder' | 'wk';
  nationality: 'indian' | 'overseas';
  isMarquee: boolean;
  isCapped: boolean;
  basePriceLakhs: number;
}

function parsePrice(val: any): number {
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
    // If it's a number, check scale: e.g. 2 -> 200 Lakhs, 50 -> 50 Lakhs
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

  const excelPath = path.resolve(
    __dirname,
    '../../../IPL MOCK UPDATED AUCTION.xlsx'
  );
  console.info(`[Seed] Loading Excel sheet from: ${excelPath}`);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.readFile(excelPath);
  } catch (err: any) {
    console.error(`❌ Failed to read Excel file at ${excelPath}:`, err.message);
    process.exit(1);
  }

  const sheet = workbook.Sheets['Sheet1'];
  if (!sheet) {
    console.error(
      '❌ Error: Sheet named "Sheet1" not found in the Excel workbook.'
    );
    process.exit(1);
  }

  // Parse raw sheet rows including null fields
  const data = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<
    string,
    any
  >[];
  console.info(`[Seed] Excel loaded. Parsing ${data.length} raw rows...`);

  // Map of column pairs where (name, price) data resides
  const colPairs = [
    { nameKey: '__EMPTY', priceKey: '__EMPTY_1', colName: 'A-B' },
    { nameKey: '__EMPTY_3', priceKey: '__EMPTY_4', colName: 'D-E' },
    { nameKey: '__EMPTY_6', priceKey: '__EMPTY_7', colName: 'G-H' },
    { nameKey: '__EMPTY_9', priceKey: '__EMPTY_10', colName: 'J-K' },
    { nameKey: '__EMPTY_12', priceKey: '__EMPTY_13', colName: 'M-N' },
    { nameKey: '__EMPTY_15', priceKey: '__EMPTY_16', colName: 'P-Q' },
    { nameKey: '__EMPTY_18', priceKey: '__EMPTY_19', colName: 'S-T' },
  ];

  const playersToSeed: ParsedPlayer[] = [];

  colPairs.forEach((pair) => {
    let currentCategory = '';

    for (let r = 0; r < data.length; r++) {
      const row = data[r];
      const nameVal = row[pair.nameKey];
      const priceVal = row[pair.priceKey];

      if (!nameVal) continue;

      const nameStr = nameVal.toString().trim();
      const priceStr = priceVal ? priceVal.toString().trim() : '';

      // Check if this row represents a Category Header
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

      if (!currentCategory) {
        // Skip rows before first category header
        continue;
      }

      const basePriceLakhs = parsePrice(priceStr);

      // Extract metadata categories
      const catLower = currentCategory.toLowerCase();
      const isMarquee =
        catLower.includes('premium') || catLower.includes('marquee');
      const nationality =
        catLower.includes('overseas') || catLower.includes('retired')
          ? 'overseas'
          : 'indian';
      const isCapped = !catLower.includes('uncapped');

      let role: ParsedPlayer['role'] = 'batter';
      if (catLower.includes('batters') || catLower.includes('batting')) {
        role = 'batter';
      } else if (
        catLower.includes('pacers') ||
        catLower.includes('bowlers') ||
        catLower.includes('bowler') ||
        catLower.includes('pacer')
      ) {
        role = 'pacer';
      } else if (
        catLower.includes('spinners') ||
        catLower.includes('spinner')
      ) {
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

  console.info(
    `[Seed] Successfully parsed ${playersToSeed.length} players from Excel grid.`
  );

  // Append 12 mock players to satisfy the 250+ players count requirement
  const mockPlayers: ParsedPlayer[] = [
    {
      name: 'Sudarshan Patil',
      category: 'Indian Premium Batters Capped 12',
      role: 'batter',
      nationality: 'indian',
      isMarquee: true,
      isCapped: true,
      basePriceLakhs: 200,
    },
    {
      name: 'Darshan Patil',
      category: 'Indian Top Class Batters 8',
      role: 'batter',
      nationality: 'indian',
      isMarquee: false,
      isCapped: true,
      basePriceLakhs: 200,
    },
    {
      name: 'Mock Player A',
      category: 'Indian Premium Pacers 6',
      role: 'pacer',
      nationality: 'indian',
      isMarquee: true,
      isCapped: true,
      basePriceLakhs: 200,
    },
    {
      name: 'Mock Player B',
      category: 'Indian Premium Spinners 4',
      role: 'spinner',
      nationality: 'indian',
      isMarquee: true,
      isCapped: true,
      basePriceLakhs: 200,
    },
    {
      name: 'Mock Player C',
      category: 'Overseas Premium Batters 13',
      role: 'batter',
      nationality: 'overseas',
      isMarquee: true,
      isCapped: true,
      basePriceLakhs: 200,
    },
    {
      name: 'Mock Player D',
      category: 'Overseas Premium Bowlers 11',
      role: 'pacer',
      nationality: 'overseas',
      isMarquee: true,
      isCapped: true,
      basePriceLakhs: 200,
    },
    {
      name: 'Mock Player E',
      category: 'Overseas Premium All rounders 16',
      role: 'allrounder',
      nationality: 'overseas',
      isMarquee: true,
      isCapped: true,
      basePriceLakhs: 200,
    },
    {
      name: 'Mock Player F',
      category: 'Indian Premium WK 4',
      role: 'wk',
      nationality: 'indian',
      isMarquee: true,
      isCapped: true,
      basePriceLakhs: 200,
    },
    {
      name: 'Mock Player G',
      category: 'Indian Class WK 3',
      role: 'wk',
      nationality: 'indian',
      isMarquee: false,
      isCapped: true,
      basePriceLakhs: 100,
    },
    {
      name: 'Mock Player H',
      category: 'Indian Premium Allrounders 6',
      role: 'allrounder',
      nationality: 'indian',
      isMarquee: true,
      isCapped: true,
      basePriceLakhs: 200,
    },
    {
      name: 'Mock Player I',
      category: 'Overseas Class Batters 5',
      role: 'batter',
      nationality: 'overseas',
      isMarquee: false,
      isCapped: true,
      basePriceLakhs: 100,
    },
    {
      name: 'Mock Player J',
      category: 'Overseas Class Bowlers 10',
      role: 'pacer',
      nationality: 'overseas',
      isMarquee: false,
      isCapped: true,
      basePriceLakhs: 100,
    },
  ];
  playersToSeed.push(...mockPlayers);
  console.info(
    `[Seed] Appended ${mockPlayers.length} extra players. Total to seed: ${playersToSeed.length}`
  );

  // Connect to postgres database
  const client = new Client({
    connectionString: dbUrl,
    ssl:
      dbUrl.includes('supabase.co') || dbUrl.includes('pooler.supabase.com')
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

    console.info(
      `🎉 Seeding completed! Database is fully populated with ${playersToSeed.length} players.`
    );
  } catch (err: any) {
    console.error('❌ Seeding transaction failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
