const Database = require('better-sqlite3');
const path = require('path');
const localDb = new Database(path.join(__dirname, '..', 'Oathbreakers Personal Guide', 'oathbreakers.db'), { readonly: true });

// Get ALL damage_debuff entries, sorted
const all = localDb.prepare("SELECT id, spell_code, effect, type, influence FROM damage_debuff ORDER BY sort_order, id").all();
console.log('Total damage_debuff:', all.length);
console.log('\nAll entries:');
all.forEach((r, i) => console.log(i + ': [' + r.spell_code + '] ' + r.effect + ' | ' + r.type + ' | ' + r.influence));

localDb.close();
