const { Client } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('❌ Error: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

async function run() {
  const client = new Client({
    connectionString: dbUrl,
    ssl:
      dbUrl.includes('supabase.co') || dbUrl.includes('pooler.supabase.com')
        ? { rejectUnauthorized: false }
        : undefined,
  });

  try {
    await client.connect();
    console.info('🔌 Connected to database. Applying constraint patch...');

    // Drop old constraint
    await client.query(
      'ALTER TABLE room_members DROP CONSTRAINT room_members_unique_franchise_per_room;'
    );
    console.info(
      '✅ Dropped old constraint: room_members_unique_franchise_per_room'
    );

    // Recreate as standard UNIQUE constraint (permits multiple null values)
    await client.query(
      'ALTER TABLE room_members ADD CONSTRAINT room_members_unique_franchise_per_room UNIQUE (room_id, franchise);'
    );
    console.info(
      '✅ Recreated standard UNIQUE constraint on (room_id, franchise)'
    );

    console.info('🎉 Constraint fixed successfully!');
  } catch (error) {
    console.error('❌ Failed to apply constraint patch:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
