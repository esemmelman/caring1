import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error('Set SUPABASE_DB_URL in your local environment. Never put it in browser code or commit it.');
}

const csvPath = process.argv[2] ?? 'membership.csv';
const input = await readFile(csvPath, 'utf8');
const records = parse(input, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

const requiredHeaders = ['fnls', 'fnfl', 'Email', 'Phone', 'Address', 'UID'];
for (const header of requiredHeaders) {
  if (!records.length || !(header in records[0])) {
    throw new Error(`Missing required CSV column: ${header}`);
  }
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query('begin');
  await client.query('truncate table caring.members');

  const insert = `
    insert into caring.members
      (source_uid, name_last_first, name_first_last, email, phone, address)
    values ($1, $2, $3, $4, $5, $6)
  `;

  for (const row of records) {
    if (!row.fnls || !row.fnfl) {
      throw new Error('Every member must have both name formats before import.');
    }

    await client.query(insert, [
      row.UID || null,
      row.fnls,
      row.fnfl,
      row.Email || null,
      row.Phone || null,
      row.Address || null,
    ]);
  }

  await client.query('commit');
  console.log(`Imported ${records.length} members securely.`);
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  await client.end();
}
