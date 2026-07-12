import { Client } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function verifySeed() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ Error: DATABASE_URL environment variable is missing.');
    process.exit(1);
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl:
      dbUrl.includes('supabase.co') || dbUrl.includes('pooler.supabase.com')
        ? { rejectUnauthorized: false }
        : undefined,
  });

  try {
    await client.connect();

    // Query total players count
    const countRes = await client.query(
      'SELECT COUNT(*)::integer as count FROM players'
    );
    const totalCount = countRes.rows[0].count;

    console.log(`\n======================================`);
    console.log(`📊 SEED VERIFICATION REPORT`);
    console.log(`======================================`);
    console.log(`Total Players in Database: ${totalCount}`);

    // Query breakdown by category
    const breakdownRes = await client.query(`
      SELECT category, COUNT(*)::integer as count 
      FROM players 
      GROUP BY category 
      ORDER BY category
    `);

    console.log(`\nCategory Breakdown:`);
    breakdownRes.rows.forEach((row: { category: string; count: number }) => {
      console.log(`  - ${row.category}: ${row.count}`);
    });

    console.log(`======================================`);

    if (totalCount >= 250) {
      console.log(`✅ Total players: ${totalCount} (>= 250)`);
      process.exit(0);
    } else {
      console.error(
        `❌ Error: Seed verification failed. Expected >= 250 players, found ${totalCount}.`
      );
      process.exit(1);
    }
  } catch (err: any) {
    console.error('❌ Database query failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

verifySeed();
