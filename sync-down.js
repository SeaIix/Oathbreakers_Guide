/**
 * sync-down.js
 * Pulls personal user data from the Railway (production) database into the
 * local database so the local copy stays in sync.
 *
 * Reads connection strings from .env:
 *   - DATABASE_URL          -> local database (target)
 *   - RAILWAY_DATABASE_URL  -> Railway database (source)
 *
 * Direction: Railway (source) -> Local (target).
 *
 * It copies the tables that hold PERSONAL user data:
 *   users, user_quest_progress, custom_tabs, custom_tab_entries
 * Ids are remapped where needed so relationships (foreign keys) stay intact.
 *
 * NOTE: Shared reference/curated tables (monsters, spells, quest_data) are NOT
 * copied down. Those live in this repo and are pushed up to Railway on deploy.
 * Pulling them down could overwrite corrected local data with stale Railway
 * data, so they are intentionally left out.
 */
require('dotenv').config();
const { Client } = require('pg');

const SOURCE_URL = process.env.RAILWAY_DATABASE_URL;
const TARGET_URL = process.env.DATABASE_URL;

if (!SOURCE_URL) {
  console.error('RAILWAY_DATABASE_URL is not set in .env');
  process.exit(1);
}
if (!TARGET_URL) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

const SOURCE_SSL = { rejectUnauthorized: false };

async function connect(url, ssl) {
  const c = new Client({ connectionString: url, ssl });
  await c.connect();
  return c;
}

async function clear(client, table) {
  await client.query(`DELETE FROM ${table}`);
}

async function main() {
  const src = await connect(SOURCE_URL, SOURCE_SSL);
  const dst = await connect(TARGET_URL, false);

  try {
    console.log('Pulling personal data from Railway into local db...\n');
    await dst.query('BEGIN');

    try {
      // --- users (id remapped by username) ---
      const sourceUsers = (await src.query('SELECT id, username, password_hash, created_at FROM users ORDER BY id')).rows;
      const srcIdToDstId = new Map();
      await clear(dst, 'users');
      for (const u of sourceUsers) {
        const ins = await dst.query(
          'INSERT INTO users (username, password_hash, created_at) VALUES ($1, $2, $3) RETURNING id',
          [u.username, u.password_hash, u.created_at]
        );
        srcIdToDstId.set(u.id, ins.rows[0].id);
      }
      console.log(`users: ${sourceUsers.length} (railway) -> ${srcIdToDstId.size} (local)`);

      // --- custom_tabs (id + user_id remapped) ---
      const sourceTabs = (await src.query('SELECT id, user_id, name, sort_order FROM custom_tabs ORDER BY id')).rows;
      const srcTabToDstTab = new Map();
      await clear(dst, 'custom_tabs');
      for (const t of sourceTabs) {
        const ins = await dst.query(
          'INSERT INTO custom_tabs (user_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id',
          [srcIdToDstId.get(t.user_id) ?? t.user_id, t.name, t.sort_order]
        );
        srcTabToDstTab.set(t.id, ins.rows[0].id);
      }
      console.log(`custom_tabs: ${sourceTabs.length} copied`);

      // --- custom_tab_entries (tab_id remapped) ---
      const sourceEntries = (await src.query(
        'SELECT tab_id, spell_code, effect, type, influence, duration, charge, magnitude, sort_order FROM custom_tab_entries ORDER BY id'
      )).rows;
      await clear(dst, 'custom_tab_entries');
      for (const e of sourceEntries) {
        await dst.query(
          `INSERT INTO custom_tab_entries
             (tab_id, spell_code, effect, type, influence, duration, charge, magnitude, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [srcTabToDstTab.get(e.tab_id) ?? e.tab_id, e.spell_code, e.effect, e.type, e.influence, e.duration, e.charge, e.magnitude, e.sort_order]
        );
      }
      console.log(`custom_tab_entries: ${sourceEntries.length} copied`);

      // --- user_quest_progress (user_id remapped; quest_id kept by giver match) ---
      // Build local quest_id-by-giver map, and railway quest_id-by-giver map.
      const railQuests = (await src.query('SELECT id, giver FROM quest_data')).rows;
      const dstQuests = (await dst.query('SELECT id, giver FROM quest_data')).rows;
      const railQuestByGiver = new Map(railQuests.map((q) => [q.giver, q.id]));
      const dstQuestByGiver = new Map(dstQuests.map((q) => [q.giver, q.id]));

      const sourceProgress = (await src.query('SELECT user_id, quest_id, completed FROM user_quest_progress')).rows;
      await clear(dst, 'user_quest_progress');
      let matched = 0, skipped = 0;
      for (const p of sourceProgress) {
        const newUserId = srcIdToDstId.get(p.user_id);
        if (newUserId === undefined) { skipped++; continue; }
        // Look up the giver of the railway quest to find the matching local quest id.
        const railQuest = railQuests.find((q) => q.id === p.quest_id);
        if (!railQuest) { skipped++; continue; }
        const newQuestId = dstQuestByGiver.get(railQuest.giver);
        if (newQuestId === undefined) { skipped++; continue; }
        await dst.query(
          'INSERT INTO user_quest_progress (user_id, quest_id, completed) VALUES ($1, $2, $3)',
          [newUserId, newQuestId, p.completed]
        );
        matched++;
      }
      console.log(`user_quest_progress: ${matched} copied, ${skipped} skipped (unresolvable)`);

      await dst.query('COMMIT');
      console.log('\nSync down complete.');
    } catch (err) {
      await dst.query('ROLLBACK');
      throw err;
    }
  } finally {
    await src.end();
    await dst.end();
  }
}

main().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
