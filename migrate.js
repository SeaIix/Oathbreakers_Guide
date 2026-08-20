const Database = require('better-sqlite3');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

async function migrate() {
  const localDbPath = path.join(__dirname, '..', 'Oathbreakers Personal Guide', 'oathbreakers.db');
  const localDb = new Database(localDbPath, { readonly: true });

  const pgUrl = process.env.DATABASE_URL || await ask('PostgreSQL connection URL: ');
  const pg = new Pool({ connectionString: pgUrl });
  const username = await ask('Username for your public account: ');
  const password = await ask('Password for your public account: ');

  console.log('\nConnecting to databases...');

  // Check if user exists
  const existingUser = await pg.query('SELECT id FROM users WHERE username = $1', [username]);
  let userId;

  if (existingUser.rows.length > 0) {
    userId = existingUser.rows[0].id;
    console.log(`User "${username}" already exists (id: ${userId}). Updating data...`);
  } else {
    const hash = await bcrypt.hash(password, 10);
    const result = await pg.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
      [username, hash]
    );
    userId = result.rows[0].id;
    console.log(`Created user "${username}" (id: ${userId})`);
  }

  const client = await pg.connect();
  try {
    await client.query('BEGIN');

    // Migrate quest completion
    console.log('Migrating quest completion...');
    const localQuests = localDb.prepare('SELECT giver, zone, guild, completed FROM quests WHERE completed = 1').all();
    for (const q of localQuests) {
      const questRow = await client.query(
        'SELECT id FROM quest_data WHERE giver = $1 AND zone = $2 AND guild = $3',
        [q.giver, q.zone, q.guild]
      );
      if (questRow.rows.length > 0) {
        await client.query(
          `INSERT INTO user_quest_progress (user_id, quest_id, completed)
           VALUES ($1, $2, 1)
           ON CONFLICT (user_id, quest_id) DO UPDATE SET completed = 1`,
          [userId, questRow.rows[0].id]
        );
      }
    }
    console.log(`  Migrated ${localQuests.length} completed quests`);

    // Migrate guild ranks
    console.log('Migrating guild ranks...');
    const localRanks = localDb.prepare('SELECT guild_key, guild_name, rank FROM guild_ranks WHERE rank > 0').all();
    for (const r of localRanks) {
      await client.query(
        `INSERT INTO user_guild_ranks (user_id, guild_key, guild_name, rank)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, guild_key) DO UPDATE SET rank = $4`,
        [userId, r.guild_key, r.guild_name, r.rank]
      );
    }
    console.log(`  Migrated ${localRanks.length} guild ranks`);

    await client.query('COMMIT');
    console.log('\nMigration complete!');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', e);
  } finally {
    client.release();
  }

  localDb.close();
  await pg.end();
  rl.close();
}

migrate().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
