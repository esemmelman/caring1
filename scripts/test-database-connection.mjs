import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error('SUPABASE_DB_URL is missing from .env.');
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const result = await client.query(`
    select
      current_database() as database_name,
      to_regclass('caring.members') is not null as members_table_exists
  `);

  const { database_name, members_table_exists } = result.rows[0];
  console.log(`Connected successfully to database: ${database_name}`);
  console.log(`caring.members exists: ${members_table_exists}`);
} catch (error) {
  console.error(`Connection failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

