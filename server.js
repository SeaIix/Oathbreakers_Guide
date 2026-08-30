require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
});

const CSV_DIR = __dirname;

const ELEMENT_FILES = {
  air: 'Oathbreakers - air.csv',
  arcane: 'Oathbreakers - arcane.csv',
  dark: 'Oathbreakers - dark.csv',
  earth: 'Oathbreakers - earth.csv',
  fire: 'Oathbreakers - fire.csv',
  light: 'Oathbreakers - light.csv',
  water: 'Oathbreakers - water.csv',
};

const SHARED_TABLES = {
  monsters: {
    display_name: 'Enemies',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'health', label: 'Health' },
      { key: 'weakness_75', label: '75%' },
      { key: 'weakness_50', label: '50%' },
      { key: 'weakness_25', label: '25%' },
      { key: 'weakness_0', label: '0%' },
      { key: 'vuln_neg5', label: '-5%' },
      { key: 'vuln_neg25', label: '-25%' },
      { key: 'vuln_neg50', label: '-50%' },
      { key: 'vuln_neg67', label: '-67%' },
      { key: 'vuln_neg90', label: '-90%' },
      { key: 'invulnerable', label: 'Invulnerable' },
    ],
  },
  spells: {
    display_name: 'Spells Info',
    columns: [
      { key: 'element', label: 'Element' },
      { key: 'school', label: 'School' },
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'monster_applicable', label: 'Monster App.' },
      { key: 'max_stacks', label: 'Max Stacks' },
      { key: 'duration', label: 'Duration' },
      { key: 'magnitude', label: 'Magnitude' },
      { key: 'potency', label: 'Potency' },
      { key: 'dependencies', label: 'Dependencies' },
      { key: 'blockers', label: 'Blockers' },
      { key: 'removes', label: 'Removes' },
      { key: 'reapplication_cooldown', label: 'Reapply CD' },
    ],
  },
};

const CUSTOM_TAB_COLUMNS = [
  { key: 'spell_code', label: 'Spell Code' },
  { key: 'effect', label: 'Effect' },
  { key: 'element', label: 'Element', virtual: true },
  { key: 'school', label: 'School', virtual: true },
  { key: 'type', label: 'Type' },
  { key: 'influence', label: 'Influence' },
  { key: 'duration', label: 'Duration' },
  { key: 'charge', label: 'Charge' },
  { key: 'magnitude', label: 'Magnitude' },
];

const ZONE_QUESTS = [
  {
    zone: 'Zone 1A',
    quests: [
      { giver: 'Drunkard', item: 'Beer', notes: '', tips: '2nd floor of the Tavern. Beer purchasable on 1st floor for 5SP.' },
      { giver: 'Pie Lady (1/3)', item: 'Status Fruit', notes: '', tips: 'Out the right side of the 2nd floor tavern exit; underneath a large tree. Yellow fruit on small green bushes.' },
      { giver: 'Pie Lady (2/3)', item: 'Mushroom', notes: '', tips: 'Red mushroom found in small clusters; one near the corner of the graveyard.' },
      { giver: 'Pie Lady (3/3)', item: 'Wild Pie', notes: '', tips: 'Made with a cooked fruit and cooked mushroom at a fire or stove (Cooking).' },
      { giver: 'Lumberjack (Repeatable)', item: 'Trading Plank', notes: '', tips: 'Sat outfront of the Lumber Mill. Trading Plank purchasable within the Lumber Mill for 10 Wood.' },
      { giver: 'Blacksmith (1/3)', item: 'T1 Ore', notes: '', tips: 'Working on a blade in the back of the Blacksmith. T1 Ore minable on large brown stones.' },
      { giver: 'Blacksmith (2/4)', item: 'Trading Ingot', notes: '', tips: 'Trading Ingot purchasable from the Blacksmith.' },
      { giver: 'Blacksmith (3/4)', item: 'T2 Ore', notes: '', tips: 'Minable on large gray stones. Located within further zones.' },
      { giver: 'Blacksmith (4/4)', item: 'T3 Ore', notes: '', tips: 'Minable on large black and yellow stones. Located within further zones.' },
      { giver: 'Bag Merchant (1/3)', item: 'Boar Tusk', notes: '', tips: 'Inside the General Store. Boar Tusk chance to be looted from Boar.' },
      { giver: 'Bag Merchant (2/3)', item: 'Wolf Spine', notes: '', tips: 'Wolf Spine chance to be looted from Wolf.' },
      { giver: 'Bag Merchant (3/3)', item: 'Bear Fur', notes: '', tips: 'Bear Fur chance to be looted from Bear.' },
      { giver: 'Sickly Alchemist (1/2)', item: 'Antidote Potion', notes: '', tips: 'Resting within the Alchemy Building across the river on the left side. Made with a cooked mushroom and water vial at a potion brewer (Alchemy).' },
      { giver: 'Sickly Alchemist (2/2)', item: 'Blue Team Band', notes: '', tips: 'Found upon a skeleton near the road fork; at the Darkened Soul.' },
      { giver: 'Boar Pen Assassin', item: 'Green Keycard', notes: 'Negative Karma', tips: 'Within the entrance to the Boar Pen; next to the Blacksmith. Green Keycard chance to be looted from Boar, Wolf, or can be caught by Fishing.' },
      { giver: 'Thieve Guild Watch (1/3)', item: 'T3 Dagger', notes: 'Negative Karma', tips: 'Located next to the Leveling Building. Purchase a dagger for 50SP from the market near the vault, and upgrade it 2 times at a Blacksmith.' },
      { giver: "Thieve's Guild Watch (2/3)", item: 'Coffee', notes: 'Negative Karma', tips: 'Purchase for 5SP at the Runemason.' },
      { giver: "Thieve's Guild Watch (3/3)", item: 'Sausage', notes: 'Negative Karma', tips: 'Purchase for 5SP at the Restaurant.' },
      { giver: 'Mechanic (Repeatable)', item: 'Water Pearl', notes: '', tips: 'Within the back of the Engineering Building; nearby the Restaurant. Water Pearl located within the deep waters behind the building.' },
      { giver: 'Sowstress', item: 'Black Bear Fur', notes: '', tips: 'Within the Clothes Shop; Behind the Restaurant. Black Bear Fur chance to be looted from Mama Bear.' },
      { giver: 'Cultist Insulter', item: 'T1 Bone', notes: '', tips: 'Within the Runemason; nearby the Wandcrafter. T1 Bone chance to be looted from Boar and Wolf.' },
      { giver: 'Staff Crafter (1/3)', item: 'Empty Rune', notes: '', tips: 'Within the Wandcrafter; infront of the Ecomancy Imbuer. Made with a T1 ore at the Runemason.' },
      { giver: 'Staff Crafter (2/3)', item: 'Earth Rune', notes: '', tips: 'Made with an Empty Rune and a Mushroom at the Runemason.' },
      { giver: 'Staff Crafter (3/3)', item: 'T2 Earth Wand', notes: '', tips: 'Made with an Earth Rune and a T1 Wand.' },
      { giver: 'Ruffian (1/2)', item: 'T2 Fist', notes: 'Negative Karma', tips: 'Within the wooden castle on the outskirts of town. Made by upgrading a T1 Claw at a Blacksmith.' },
      { giver: 'Ruffian (2/2)', item: 'Bone Dagger', notes: 'Negative Karma', tips: 'Made with a T1 Bone at a Blacksmith.' },
    ],
  },
  {
    zone: 'Zone 1B',
    quests: [
      { giver: 'Ring Thief', item: 'Wedding Ring', notes: 'Negative Karma', tips: 'Within the entrance to Zone 1A West. Collectable off the skeleton on the right side of the entrance to the Mama Bear Dungeon.' },
      { giver: 'Confused Cook', item: 'Blump Eye', notes: '', tips: 'Within the small building next to the Lumber Mill. Blump Eye chance to be looted from Blump; 2 nearby encampments totaling 7 enemies.' },
      { giver: "Detective (1/2)", item: "Derek's Diary", notes: '', tips: 'At a campsite nearby the Forsaken Mines; to the right side of the road coming from the Zone 1A West Gate. Book in a boat next to a skeleton in the Forsaken Mines.' },
      { giver: "Detective (2/2)", item: "Derek's Lockbox", notes: '', tips: 'Found in Forsaken Mines after entering boss room.' },
      { giver: 'Bag Dropper (1/3)', item: 'Lost Pouch', notes: '', tips: 'At the T2 Tree nearby the Mama Bear Dungeon. Small brown pouch located within the Mama Bear Dungeon.' },
      { giver: 'Bag Dropper (2/3)', item: 'Mysterious Key', notes: '', tips: 'Chance to be looted from the enemies within the Mama Bear Dungeon.' },
      { giver: 'Bag Dropper (3/3)', item: 'Mysterious Book', notes: '', tips: 'Chest that contains this book is nearby the Grave\'s Yard Dungeon.' },
      { giver: 'Secretive Individual (1/3)', item: 'SP Pouch (Trading)', notes: 'Negative Karma', tips: 'At the far corner nearby The Waterfall Dungeon. Can be picked up at the campsite nearby.' },
      { giver: 'Secretive Individual (2/3)', item: 'Green Keycard', notes: 'Negative Karma', tips: 'Can be looted from Boars within the zone or can be fished for in the nearby water (Fishing).' },
      { giver: 'Secretive Individual (3/3)', item: 'Rune Crystal', notes: 'Negative Karma', tips: 'The dungeon can be completely avoided by collecting a Blue Rune Crystal from Zone 1N.' },
      { giver: 'Ghostly Skeleton (1/3)', item: 'Ceremonial Dagger', notes: '', tips: 'Under the T2 Tree nearby the Grave\'s Yard Dungeon; the large collesium next to Zone 1I. Collectable off the sacrifical table in the center of the collesium.' },
      { giver: 'Ghostly Skeleton (2/3)', item: 'Blue Keycard', notes: '', tips: 'Chance to be looted from the Skeleton Soldier and Skeleton Archer nearby this NPC.' },
      { giver: 'Ghostly Skeleton (3/3)', item: 'Dark Orders', notes: '', tips: 'Scroll found in black chest in the boss room of Grave\'s Yard dungeon.' },
    ],
  },
  {
    zone: 'Zone 1C',
    quests: [
      { giver: 'Royal Scout (1/4)', item: 'Yeti Capture Plan', notes: '', tips: 'On the right side of the door at the Blacksmith near the Last Yeti dungeon. Scroll located nearby a box next to the Last Yeti Dungeon portal.' },
      { giver: 'Royal Scout (2/4)', item: 'Yeti Bone', notes: '', tips: 'Chance to be looted from the Yeti in Last Yeti.' },
      { giver: 'Royal Scout (3/4)', item: 'T5 - Chillbone', notes: '', tips: 'Made by using an Upgrader with a Yeti Bone.' },
      { giver: 'Royal Scout (4/4)', item: 'T6 Javelin - Toothpick', notes: '', tips: 'Chance to be looted from the Yeti Last Yeti.' },
      { giver: 'Rugged Adventurer (Repeatable)', item: 'Frost Wolf Tooth', notes: 'Negative Karma (100)', tips: 'At a campsite up the road, to the right from the White Wolf Mountain dungeon. Frost Wolf Tooth chance to be looted from Frost Wolf.' },
      { giver: 'Dwarf Scout (1/3)', item: 'Bounce Potion', notes: '', tips: 'On top of the White Wolf Mountain dungeon. Crafted with a Water Vial and an Air Rune at a potion brewer (Alchemy).' },
      { giver: 'Dwarf Scout (2/3)', item: 'Eye of Icanus', notes: '', tips: 'Chance to be looted from Icanus (White Wolf Mountain).' },
      { giver: 'Dwarf Scout (3/3)', item: 'Flux Potion', notes: '', tips: 'Crafted with a Water Vial and an Eye of Icanus at a potion brewer (Alchemy).' },
      { giver: 'Dwarf Adventurer (1/2)', item: 'White Bear Fur', notes: '', tips: 'When entering from 1O, follow the path until you see the darkened prisoner on the left, then head to the right. White Bear Fur chance to be looted from Polar Bear.' },
      { giver: 'Dwarf Adventurer (2/2)', item: 'Papa Bear Fur', notes: '', tips: 'Chance to be looted from Papa Bear.' },
      { giver: 'Dwarf Bandit', item: 'Water Mote', notes: '', tips: 'In front of the Il\'Heim Intelligence Tower. Complete 3 waves of the Il\'Heim Intelligence Tower and collect the Water Mote as a reward. Chance to be looted from the boss of The Heart.' },
    ],
  },
  {
    zone: 'Zone 1D',
    quests: [
      { giver: 'Cave Explorer (1/3)', item: 'Bounce Potion', notes: '', tips: 'Up the hill on the left side of the Zone 1A entrance; sat nearby a campfire and pond. Crafted with Water Vial and an Air Rune within an Alchemy Building.' },
      { giver: 'Cave Explorer (2/3)', item: 'Webbed Backpack', notes: '', tips: 'Found within the Runic Mines; slightly right from entrance within dungeon and is hanging from a large stalactite.' },
      { giver: 'Cave Explorer (3/3)', item: 'Spider Eye', notes: '', tips: 'Chance to be looted from Cave Spider or Forest Spider.' },
      { giver: 'Resting Adventurer (1/3)', item: "Henry's Goggles", notes: '', tips: 'Nearby the Lumber Mill at the crossroads within the zone. Found upon a skeleton nearby the entrance to the Goblin Hideout; walk within the cave.' },
      { giver: 'Resting Adventurer (2/3)', item: 'Boar Tusk', notes: '', tips: 'Chance to be looted from Boar; a boar is located nearby the large tree upon a steep slope.' },
      { giver: 'Resting Adventurer (3/3)', item: 'Agility Potion', notes: '', tips: 'Can be crafted with a Water Vial and a Cooked White Flower at an Alchemy Building; one is located nearby the large windmill inside the zone.' },
      { giver: 'Bossy Knight (1/5)', item: 'Wasp Stinger', notes: '', tips: 'Located nearby the Wasp Hive and the entrance to Zone 1C. Wasp Stinger chance to be looted from Forest Wasp.' },
      { giver: 'Bossy Knight (2/5)', item: 'Cacoon Potion', notes: '', tips: 'Can be crafted with a Water Vial and a Wasp Stinger at an Alchemy Building; one is located nearby the large windmill inside the zone.' },
      { giver: 'Bossy Knight (3/5)', item: 'Spider Eye', notes: '', tips: 'Chance to be looted from Forest Spider or Cave Spider.' },
      { giver: 'Bossy Knight (4/5)', item: 'Freedom Potion', notes: '', tips: 'Can be crafted with a Water Vial and a Spider Eye at an Alchemy Building.' },
      { giver: 'Bossy Knight (5/5)', item: 'Coffee', notes: '', tips: 'Can be purchased for 5SP within buildings throughout the zones; one is located nearby the large windmill inside the zone.' },
      { giver: 'Poisoned Dwarf', item: '???', notes: '', tips: 'Located next to the Alchemy Building within the zone; nearby the large windmill. A potion can be found in the Goblin Hideout at the back of the dungeon on the lowest level near a skeleton.' },
      { giver: 'Dwarven Wife (1/3)', item: 'Antidote Potion', notes: '', tips: 'Located next to the Poisoned Dwarf. Can be crafted with a Water Vial and a Cooked Mushroom at an Alchemy Building; located next to the quest giver.' },
      { giver: 'Dwarven Wife (2/3)', item: 'Stick of Wasp Goop', notes: '', tips: 'Located within the Wasp Hive.' },
      { giver: 'Dwarven Wife (3/3) (Repeatable)', item: 'Cleanse Potion', notes: '', tips: 'Can be crafted with a Water Vial and a Yellow Flower at an Alchemy Building (Alchemy).' },
      { giver: 'Hungry Man', item: 'Cooked Meat', notes: 'Negative Karma', tips: 'Nearby a tree at a camp site. Made with a Meat at a fire or stove.' },
    ],
  },
  {
    zone: 'Zone 1E',
    quests: [
      { giver: 'Bald Dude (1/2)', item: 'Bear Fur', notes: 'Negative Karma', tips: 'Located to the left side of the East Zone 1D entrance. Bear Fur chance to be looted from Bear.' },
      { giver: 'Bald Dude (2/2)', item: 'Ogre Juice', notes: 'Negative Karma', tips: 'Chance to be looted from Ogre.' },
      { giver: 'Incident Survivor (1/3)', item: 'Blue Keycard', notes: '', tips: 'Located at a camp site nearby the Adventure Guild. Can be looted from certain Monsters.' },
      { giver: 'Incident Survivor (2/3)', item: "Miner's Handbook", notes: '', tips: 'Found at the Blacksmith near Lycan Town dungeon.' },
      { giver: 'Incident Survivor (3/3)', item: 'Dog Collar', notes: '', tips: 'Found inside Lycan Town dungeon underwater near outer drain. If facing the boss room entrance from the center, it will be to the right at 3 o\'clock against the outer wall.' },
      { giver: 'Scaley Guy (Repeatable)', item: 'Troll Scale', notes: '', tips: 'Located in Northwest Corner of the map in front of the Troll Cave. Troll Scale chance to be looted from Cave Troll.' },
    ],
  },
  {
    zone: 'Zone 1F',
    quests: [
      { giver: 'Ecoplasma Scientist (1/5)', item: 'The Nature Of Ecoplasma', notes: '', tips: 'Located above Overgrowth dungeon entrance on ledge. Book found in a drawer in a house nearby within the walled in ecoplasma mill.' },
      { giver: 'Ecoplasma Scientist (2/5)', item: 'Plant Tooth', notes: '', tips: 'Looted from Mutated Plant in the Overgrowth dungeon.' },
      { giver: 'Ecoplasma Scientist (3/5)', item: 'Tempered Ecoplasma', notes: '', tips: 'Potion found outside Ogre Stronghold dungeon.' },
      { giver: 'Ecoplasma Scientist (4/5)', item: 'Purple Keycard', notes: '', tips: 'High chance to be looted from Ogres near Ogre Stronghold dungeon.' },
      { giver: 'Ecoplasma Scientist (5/5)', item: 'Ogre Nail/Scale', notes: '', tips: 'Looted from boss in Ogre Stronghold.' },
      { giver: 'Ogre Scavenger (1/2)', item: 'Health Potion', notes: '', tips: 'Down the hill from the Ogre Stronghold near the water towards the Blump camp. Crafted from Cooked Meat and a Vial of Water.' },
      { giver: 'Ogre Scavenger (2/2)', item: 'Ogre Ring', notes: '', tips: 'Looted from an Ogre nearby.' },
      { giver: 'Timberless Lumberjack (1/2)', item: "Logger's Heirloom Axe", notes: '', tips: 'Sitting on a crate at the Lumber Mill. Obtained from Green Keycard chest sitting on crate in Blump camp nearby.' },
      { giver: 'Timberless Lumberjack (2/2)', item: 'T3 Fist - Jaw Duster', notes: '', tips: 'Forged at a Blacksmith station using Beastly Jaw that can be obtained from looting the werewolves.' },
      { giver: 'Wall Scout (1/?)', item: 'Forsworn Sigil', notes: '', tips: 'Sitting above the entrance to the outer castle wall outside Accursed Keep dungeon. Chance to be looted from Forsworn enemies.' },
      { giver: 'Wall Scout (2/?)', item: '???', notes: 'Item not in game', tips: 'The item used to complete this quest is supposedly not in the game as no one has completed it.' },
    ],
  },
  {
    zone: 'Zone 1I',
    quests: [
      { giver: 'Unfortunate Miner', item: 'T3 Ore', notes: '', tips: 'Located to the left of the entrance, upon a rocky hill. Can be collected from yellow and black ore nodes within the zone.' },
      { giver: 'Wandering Soul (1/2)', item: 'For the Eyes of the Subject', notes: '', tips: 'Located above the entrance to the Soul Dungeon dungeon. Book obtained from turning in 5 tokens to Shuk\'Ra Battle Tower in Zone 1E.' },
      { giver: 'Wandering Soul (2/2) (Repeatable)', item: 'Earth Mote', notes: '', tips: 'Obtained from turning in 3 tokens to Shuk\'Ra Battle Tower in Zone 1E or looted from Soul Dungeon boss.' },
      { giver: 'Fate Seeker (1/2)', item: 'A Blumpain Society', notes: '', tips: 'Inside Blump Enclave dungeon near entrance. Book found at end of Blump Enclave dungeon near Ogre on crate.' },
      { giver: 'Fate Seeker (2/2) (Repeatable)', item: 'Blump Eye', notes: '', tips: 'Looted from Blump.' },
    ],
  },
  {
    zone: 'Zone 1J',
    quests: [
      { giver: 'Burdened Woman (1/2)', item: 'Runic Bear Spine', notes: '', tips: 'When entering zone from Zone 1C, head left. She is located around the vines. Looted from Runic Bear.' },
      { giver: 'Burdened Woman (2/2) (Repeatable)', item: 'T4 Greataxe - Runic Bear Spine Greataxe', notes: '', tips: 'Crafted using Runic Bear Spine.' },
      { giver: "Archie's Guardian (1/3)", item: "Alpha Wolf's Tooth", notes: '', tips: 'When entering zone from Zone 1C, head right. He is located around the side of the waterfall. Looted from Alpha Wolf.' },
      { giver: "Archie's Guardian (2/3)", item: 'T4 Dagger - Alpha Tooth Dagger', notes: '', tips: 'Crafted using Alpha Wolf\'s Tooth.' },
      { giver: "Archie's Guardian (3/3) (Repeatable)", item: "Alpha Wolf's Tooth", notes: '', tips: 'Looted from Alpha Wolf.' },
      { giver: 'Skeptical Adventurer (1/4)', item: 'The Ritual', notes: '', tips: 'Outside The Heart dungeon. Book located in the Faith Guild cellar below the Faith Guild underwater. Requires Faith Guild Cellar Key found in a boat on the dock behind the Faith Guild.' },
      { giver: 'Skeptical Adventurer (2/4)', item: 'Ritual Orders', notes: '', tips: 'Scroll located inside The Heart dungeon. It\'s sitting on a crate to the right beside the entrance portal in the first room where you select the difficulty setting.' },
      { giver: 'Skeptical Adventurer (3/4)', item: 'Water Mote', notes: '', tips: 'Complete 3 waves of the Il\'Heim Intelligence Tower and collect the Water Mote as a reward. Chance to be looted from the boss of The Heart.' },
      { giver: 'Skeptical Adventurer (4/4) (Repeatable)', item: 'The Frozen Heart', notes: 'Negative Karma (300)', tips: 'Complete 4 waves of the Il\'Heim Intelligence Tower and collect the book The Frozen Heart as a reward.' },
    ],
  },
  {
    zone: 'Zone 1N',
    quests: [
      { giver: 'Fisherman (1/2)', item: 'Frozen Rod', notes: '', tips: 'By the shore near tents. Straight out from the fisherman, slightly right underwater on the ground. You get to keep the Frozen Rod.' },
      { giver: 'Fisherman (2/2) (Repeatable)', item: 'T1 Frozen Fish', notes: '', tips: 'Obtained by using the Frozen Rod in any water.' },
      { giver: 'Man by the tents (1/3)', item: 'Eco Pearl', notes: 'Negative Karma', tips: 'By the tents downhill from Gathering Guild. When facing the water near the tents, to the right of the last glacier pad underwater on ground near edge of green ecoplasm goo.' },
      { giver: 'Man by the tents (2/3)', item: 'Scroll in Hakku Dungeon', notes: 'Negative Karma', tips: 'Near the exit trap door while fighting Hakku.' },
      { giver: 'Man by the tents (3/3) (Repeatable)', item: 'Crab Eye', notes: 'Negative Karma (100)', tips: 'Chance to be looted from Hard Shell Crab.' },
      { giver: 'Woman at the crossroads (1/3)', item: 'Ecorune Sample', notes: '', tips: 'Near the entrance of the Gathering Guild. Found in front of the portal to Papa Bear\'s Dungeon, on the box on the right at the Goblin Cryomage.' },
      { giver: 'Woman at the crossroads (2/3)', item: 'Rune Mutations', notes: '', tips: 'Found inside Papa Bear Dungeon as a Random Drop from the Gold Keyed Chests.' },
      { giver: 'Woman at the crossroads (3/3) (Repeatable)', item: 'Goblin Necklace', notes: '', tips: 'Random Drop from Frost Goblins.' },
    ],
  },
  {
    zone: 'Zone 1O',
    quests: [
      { giver: 'Crystal Girl (Repeatable)', item: 'Light Crystal', notes: '', tips: 'Located within the Dwarven Fortress, in the room to the left of the large flame, at a desk infront of burning coals. Chance to be looted from many sources (Primary source is Icanus in White Wolf Mountain).' },
      { giver: 'Dwarven King (1/4)', item: 'Claw of Icanus', notes: '', tips: 'Located within the Dwarven Fortress, down the main hall, upon a throne. Chance to be looted from Icanus (White Wolf Mountain).' },
      { giver: 'Dwarven King (2/4)', item: "Heych'de", notes: '', tips: 'Chance to be looted from Papa Bear.' },
      { giver: 'Dwarven King (3/4)', item: 'Shellcracker', notes: '', tips: 'Chance to be looted from Soft Shell Crabs (Haku\'s Lair).' },
      { giver: 'Dwarven King (4/4)', item: 'T8 - Perception', notes: '', tips: 'Chance to be found in Ice Chests at the end of Arctic dungeons.' },
      { giver: 'Miner near Mine (1/4)', item: "The Miner's Backpack", notes: '', tips: 'Coming from Zone 1N head slightly right to mountain with mine shaft opening. In the mine near the coffin next to the Darkened Warrior.' },
      { giver: 'Miner near Mine (2/4)', item: "Jeff's Courier Card", notes: '', tips: 'Looted from the Darkened Warrior in the mine.' },
      { giver: 'Miner near Mine (3/4)', item: 'T5 Shield - Ironpack', notes: '', tips: 'Sold by Warriors Guild.' },
      { giver: 'Miner near Mine (4/4)', item: 'T5 Backpack - Arctic Ghillie', notes: '', tips: 'Sold by Gathering Guild.' },
      { giver: 'Ghostly Woman at the Fire (1/3)', item: 'T1 Bone', notes: '', tips: 'In the large cave/mine hallway under the Kings room in front of the ghostly fire. Looted from any creature with bones.' },
      { giver: 'Ghostly Woman at the Fire (2/3)', item: 'T2 Bone', notes: '', tips: 'Looted from Mama Bear, Polar Bears.' },
      { giver: 'Ghostly Woman at the Fire (3/3) (Repeatable)', item: 'Papa Bear Bone', notes: '', tips: 'Looted from Papa Bear.' },
    ],
  },
  {
    zone: 'Zone 1P',
    quests: [
      { giver: 'Wounded Sister (1/5)', item: 'Light Crystal', notes: '', tips: 'Next to entrance from Zone 1J. Can be looted from Icanis in White Wolf Mountain dungeon, Papa Bear in Papa Bear Dungeon.' },
      { giver: 'Wounded Sister (2/5)', item: 'Oathsworn Sigil', notes: '', tips: 'Found on dead sister next to The Tainted Cathedral dungeon.' },
      { giver: 'Wounded Sister (3/5)', item: 'Scroll - A Warning For All', notes: '', tips: 'Found in the hand of a dead sister in the loot room of The Tainted Cathedral dungeon.' },
      { giver: 'Wounded Sister (4/5)', item: 'Scroll - The Time Has Come', notes: '', tips: 'Found in a gold keycard chest in the middle of the first enemy room in The Great Forge dungeon.' },
      { giver: 'Wounded Sister (5/5)', item: 'Dark Mote', notes: '', tips: 'Chance to be looted from the Forsworn Deathlord (The Great Forge).' },
    ],
  },
];

const GUILD_QUESTS = [
  {
    guild: 'Fishing Guild',
    guild_key: 'fishing',
    quests: [
      { giver: 'Fisher', item: 'T1 Fish', notes: 'Guild Membership', tips: 'Zone 1A / Within the shack near the bend of the river. Catch a Fish (Fishing).' },
    ],
  },
  {
    guild: 'Cooking Guild',
    guild_key: 'cooking',
    quests: [
      { giver: 'Chef (1/7)', item: 'Cooked Fish', notes: '', tips: 'Zone 1A / Within the restaurant next to the river. Made with a T1 Fish at a fire or stove (Fishing).' },
      { giver: 'Chef (2/7)', item: 'Fish Stew', notes: '', tips: 'Made with a Cooked Fish and a Water Vial at a fire or stove (Cooking).' },
      { giver: 'Chef (3/7)', item: 'Ocean Stew', notes: '', tips: 'Made with a Fish Stew and a Seaweed at a fire or stove.' },
      { giver: 'Chef (4/7)', item: 'Cooked Meat', notes: '', tips: 'Made with a Meat at a fire or stove.' },
      { giver: 'Chef (5/7)', item: 'Spicy Meat', notes: '', tips: 'Made with a Cooked Meat and a Cooked Red Flower at a fire or stove.' },
      { giver: 'Chef (6/7)', item: 'Freeze Potion', notes: '', tips: 'Made with a Water Vial and a Water Rune at a Potion Brewer (Alchemy).' },
      { giver: 'Chef (7/7)', item: 'Meaty Reef Eye Stew', notes: 'Guild Membership', tips: 'Made with a Water Vial, Cooked Meat, Reef Root, and a Blump Eye at a fire or stove (Cooking).' },
    ],
  },
  {
    guild: 'Earth Guild',
    guild_key: 'earth',
    quests: [
      { giver: 'Geomancer (1/2)', item: 'T3 Earth Staff', notes: '', tips: 'Zone 1A / Within the small building next to the large Geomancy Tower. Made with 2 Earth Runes and a T1 Staff. Access to the Ecomancy Imbuer.' },
      { giver: 'Geomancer (2/2)', item: 'Earth Mote', notes: 'Guild Membership', tips: 'Complete 3 waves of the Shuk\'Ra Battle Tower and collect the Earth Mote as a reward. Chance to be looted from the boss of the Soul Dungeon.' },
    ],
  },
  {
    guild: 'Rangers Guild',
    guild_key: 'rangers',
    quests: [
      { giver: 'Archer', item: 'T3 Bow', notes: 'Guild Membership', tips: 'Zone 1A / Within the building nearby the entrance to Zone 1D. Made with a T1 Bow at a Lumber Mill.' },
    ],
  },
  {
    guild: 'Woodwork Guild',
    guild_key: 'woodwork',
    quests: [
      { giver: 'Lumberjack', item: 'T2 Axe', notes: 'Guild Membership', tips: 'Zone 1B / Within the Lumber Mill on the right side of the road from 1A. Purchase a T1 Axe for 50SP, and upgrade it at the Blacksmith nearby.' },
    ],
  },
  {
    guild: 'Titans Guild',
    guild_key: 'titans',
    quests: [
      { giver: 'Titanic Clerk (1/4)', item: 'Titan Scroll 1', notes: '', tips: 'Zone 1C / A sharp right turn from the North Zone 1B Gate. Found within the White Wolf Mountain Dungeon, in the boss room, in a small box.' },
      { giver: 'Titanic Clerk (2/4)', item: 'Titan Scroll 2', notes: '', tips: 'Found within the Papa Bear Dungeon, in the boss room, in a small box.' },
      { giver: 'Titanic Clerk (3/4)', item: 'Titan Scroll 3', notes: '', tips: 'Found within the Last Yeti Dungeon, near the back of the cave, in a small box.' },
      { giver: 'Titanic Clerk (4/4)', item: 'Titan Scroll 4', notes: 'Guild Membership', tips: 'Found within the Haku\'s Lair Dungeon, in the boss room, in a small box.' },
    ],
  },
  {
    guild: 'Adventure Guild',
    guild_key: 'adventure',
    quests: [
      { giver: 'Lead Adventurer (1/4)', item: 'Adventurer Scroll 1', notes: '', tips: 'Zone 1E / Within the upper floor of the tall building past Lycantown. Found within the Goblin Hideout Dungeon in Zone 1D, up a wooden plank and on a support beam, in a small box, to the left of the dungeon after entering with a Green Keycard.' },
      { giver: 'Lead Adventurer (2/4)', item: 'Adventurer Scroll 2', notes: '', tips: 'Found within the Mama Bear Dungeon in Zone 1B, to the left of the exit door in a small box.' },
      { giver: 'Lead Adventurer (3/4)', item: 'Adventurer Scroll 3', notes: '', tips: 'Found within the Forsaken Mines Dungeon in Zone 1B in a small box.' },
      { giver: 'Lead Adventurer (4/4)', item: 'Adventurer Scroll 4', notes: 'Guild Membership', tips: 'Found within the Lycan Town Dungeon in Zone 1E, in the boss room, in a small box.' },
    ],
  },
  {
    guild: 'Alchemy Guild',
    guild_key: 'alchemy',
    quests: [
      { giver: 'Novice Alchemist (1/5)', item: 'Defrost Potion', notes: '', tips: 'Zone 1O / Within the Dwarven Fortress, up the stairs, down the hallway, and within the right side door. Made with a Vial of Water and T1 Frozen Fish at an Alchemist\'s Workbench.' },
      { giver: 'Novice Alchemist (2/5)', item: 'Chill Potion', notes: '', tips: 'Made with a Vial of Water and Frozen Seaweed at an Alchemist\'s Workbench.' },
      { giver: 'Novice Alchemist (3/5)', item: 'Soothe Potion', notes: '', tips: 'Made with a Vial of Water and Crab Eye at an Alchemist\'s Workbench.' },
      { giver: 'Novice Alchemist (4/5)', item: 'Flux Potion', notes: 'Guild Membership', tips: 'Made with a Vial of Water and Eye of Icanus at an Alchemist\'s Workbench.' },
      { giver: 'Novice Alchemist (5/5)', item: 'Ascend Potion', notes: '', tips: 'Within the Dwarven Fortress, up the stairs, down the hallway, and within the right side door. Purchasable from the Alchemy Guild when you reach Rank 10.' },
    ],
  },
  {
    guild: 'Water Guild',
    guild_key: 'water',
    quests: [
      { giver: 'Riddle Mage (1/3)', item: 'Hydrate Potion', notes: '', tips: 'Zone 1O / Upon the waterfall near the Zone 1O West / Zone 1C East entrance. Purchasable from the Alchemy Guild when you reach Rank 3. Access to the Hydromancy Imbuer.' },
      { giver: 'Riddle Mage (2/3)', item: 'T3 Water Wand', notes: '', tips: 'Made with 2 Water Runes and a T1 Wand.' },
      { giver: 'Riddle Mage (3/3)', item: 'Water Mote', notes: 'Guild Membership', tips: 'Complete 3 waves of the Il\'Heim Intelligence Tower and collect the Water Mote as a reward. Chance to be looted from the boss of The Heart.' },
    ],
  },
  {
    guild: 'Warriors Guild',
    guild_key: 'warriors',
    quests: [
      { giver: 'Professional Warrioress (1/3)', item: 'T3 Sword', notes: '', tips: 'Zone 1O / Within the Dwarven Fortress, up the stairs, down the hallway, and within the left side door. Made by using an Upgrader with a T1 Sword.' },
      { giver: 'Professional Warrioress (2/3)', item: 'T5 Sword', notes: 'Guild Membership', tips: 'Made by using an Upgrader with a T1 Sword.' },
      { giver: 'Professional Warrioress (3/3)', item: "Lion's Reach", notes: '', tips: "Within the Dwarven Fortress, up the stairs, down the hallway, and within the left side door. Purchasable from the Titan's Guild when you reach Rank 10." },
    ],
  },
  {
    guild: 'Blacksmithing Guild',
    guild_key: 'blacksmithing',
    quests: [
      { giver: 'Professional Miner (1/3)', item: 'T2 Pickaxe', notes: '', tips: 'Zone 1O / Coming from Zone 1N head slightly right to mountain with mine shaft opening. Purchasable from the Blacksmithing Guild when you reach Rank 3.' },
      { giver: 'Professional Miner (2/3)', item: 'T4 Ore', notes: 'Guild Membership', tips: 'Found in the mine near the anvil.' },
      { giver: 'Professional Miner (3/3)', item: 'T5 Pickaxe - Nosgard The Depleter', notes: '', tips: 'Forged at a Blacksmith station.' },
    ],
  },
  {
    guild: 'Faith Guild',
    guild_key: 'faith',
    quests: [
      { giver: 'Priestess (1/4)', item: 'Golden Cross', notes: 'Guild Membership, Negative Karma (Full Red Eyes)', tips: 'Zone 1P / Located in the church area. Crafted with a Gold Ore, Iron Ore and a T1 Bone at a Runemason.' },
      { giver: 'Priestess (2/4)', item: 'Light Crystal', notes: '', tips: 'Looted from many sources (Primary source is Icanus in White Wolf Mountain).' },
      { giver: 'Priestess (3/4)', item: 'Symbol of Life', notes: '', tips: 'Crafted with a Gold Cross and a Light Crystal at a Runemason.' },
      { giver: 'Priestess (4/4)', item: 'T3 Bone', notes: 'Positive Karma (Full White Eyes)', tips: 'Looted from any creature with bones.' },
    ],
  },
  {
    guild: 'Merchants Guild',
    guild_key: 'merchants',
    quests: [
      { giver: 'Merchants Guild Clerk', item: "Jeff's Courier Card", notes: 'Guild Membership', tips: 'Zone 1O / Within the Dwarven Fortress, in the room to the left of the large flame. Looted from the Darkened Warrior in the mine.' },
    ],
  },
  {
    guild: 'Light Guild',
    guild_key: 'light',
    quests: [
      { giver: 'Unconscious Guild Clerk', item: 'Light Seed', notes: 'Guild Membership', tips: 'Zone 1P / When entering from Zone 1J, head right. Found nearby the Faith Guild underwater.' },
    ],
  },
  {
    guild: 'Thieves Guild',
    guild_key: 'thieves',
    quests: [
      { giver: 'Master Thief (1/3)', item: 'Golden SP Pouch', notes: 'Negative Karma', tips: 'Zone 1O / To the left when entering from Zone 1C. At the top of a tree behind the Water Guild NPC. Completing this quest unlocks the Thieves Guild.' },
      { giver: 'Master thief (2/3)', item: 'Tooth of Icanus', notes: '', tips: 'Chance to be looted from Icanus.' },
      { giver: 'Master thief (3/3) (Repeatable)', item: 'T5 Dagger', notes: 'Negative Karma (1000)', tips: 'A T1 Dagger can be upgraded at a Blacksmith.' },
    ],
  },
];

function isEmptyRow(row) {
  return !row || row.every((f) => !f || f.trim() === '');
}

function titleCase(str) {
  if (!str) return str;
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Middleware
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new PgSession({ pool, tableName: 'user_sessions' }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

async function loadNavData(req, res, next) {
  res.locals.tables = SHARED_TABLES;
  res.locals.username = req.session.username || null;
  res.locals.customTabs = [];
  if (req.session.userId) {
    try {
      const result = await pool.query(
        'SELECT id, name FROM custom_tabs WHERE user_id = $1 ORDER BY sort_order, id',
        [req.session.userId]
      );
      res.locals.customTabs = result.rows;
    } catch (e) { /* ignore */ }
  }
  next();
}

app.use(loadNavData);

// Database Initialization
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monsters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      health TEXT,
      weakness_75 TEXT,
      weakness_50 TEXT,
      weakness_25 TEXT,
      weakness_0 TEXT,
      vuln_neg5 TEXT,
      vuln_neg25 TEXT,
      vuln_neg50 TEXT,
      vuln_neg67 TEXT,
      vuln_neg90 TEXT,
      invulnerable TEXT,
      sort_order INTEGER
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS spells (
      id SERIAL PRIMARY KEY,
      element TEXT NOT NULL,
      school TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      monster_applicable TEXT,
      max_stacks TEXT,
      duration TEXT,
      magnitude TEXT,
      potency TEXT,
      dependencies TEXT,
      blockers TEXT,
      removes TEXT,
      reapplication_cooldown TEXT,
      sort_order INTEGER
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      sid TEXT PRIMARY KEY,
      sess JSONB NOT NULL,
      expire TIMESTAMP NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quest_data (
      id SERIAL PRIMARY KEY,
      giver TEXT NOT NULL,
      zone TEXT,
      guild TEXT,
      item TEXT,
      notes TEXT,
      tips TEXT,
      sort_order INTEGER
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_quest_progress (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      quest_id INTEGER REFERENCES quest_data(id) ON DELETE CASCADE,
      completed INTEGER DEFAULT 0,
      PRIMARY KEY(user_id, quest_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_guild_ranks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      guild_key TEXT NOT NULL,
      guild_name TEXT NOT NULL,
      rank INTEGER DEFAULT 0,
      UNIQUE(user_id, guild_key)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS custom_tabs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS custom_tab_entries (
      id SERIAL PRIMARY KEY,
      tab_id INTEGER REFERENCES custom_tabs(id) ON DELETE CASCADE,
      spell_code TEXT,
      effect TEXT,
      type TEXT,
      influence TEXT,
      duration TEXT,
      charge TEXT,
      magnitude TEXT,
      sort_order INTEGER DEFAULT 0
    );
  `);

  const monsterCount = await pool.query('SELECT COUNT(*) as count FROM monsters');
  if (parseInt(monsterCount.rows[0].count) === 0) {
    await importMonsters();
  }

  const spellCount = await pool.query('SELECT COUNT(*) as count FROM spells');
  if (parseInt(spellCount.rows[0].count) === 0) {
    await importSpells();
  }

  const questCount = await pool.query('SELECT COUNT(*) as count FROM quest_data');
  if (parseInt(questCount.rows[0].count) === 0) {
    await importQuestData();
  }
}

// CSV Import Functions
async function importMonsters() {
  const csv = fs.readFileSync(path.join(CSV_DIR, 'Oathbreakers - monsters.csv'), 'utf-8');
  const records = parse(csv, { relax_column_count: true, skip_empty_lines: true });
  records.shift();

  let order = 0;
  for (const row of records) {
    if (isEmptyRow(row) || !row[0] || !row[0].trim()) continue;
    const r = row.map((v) => (v || '').trim());
    while (r.length < 12) r.push('');
    await pool.query(
      `INSERT INTO monsters (name, health, weakness_75, weakness_50, weakness_25, weakness_0,
        vuln_neg5, vuln_neg25, vuln_neg50, vuln_neg67, vuln_neg90, invulnerable, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], order++]
    );
  }
}

async function importSpells() {
  let order = 0;
  for (const [element, filename] of Object.entries(ELEMENT_FILES)) {
    const csv = fs.readFileSync(path.join(CSV_DIR, filename), 'utf-8');
    const records = parse(csv, { relax_column_count: true, skip_empty_lines: true, trim: true });

    let currentSchool = null;
    let state = 'school';

    for (const row of records) {
      if (isEmptyRow(row)) {
        state = 'school';
        continue;
      }

      const first = (row[0] || '').trim();
      if (first.toLowerCase() === 'name') continue;

      if (state === 'school') {
        currentSchool = first;
        state = 'data';
      } else if (state === 'data') {
        if (!first) continue;
        const r = row.map((v) => (v || '').trim());
        while (r.length < 11) r.push('');
        await pool.query(
          `INSERT INTO spells (element, school, name, description, monster_applicable, max_stacks,
            duration, magnitude, potency, dependencies, blockers, removes, reapplication_cooldown, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [titleCase(element), currentSchool, r[0], r[1], r[2], r[3],
           r[4], r[5], r[6], r[7], r[8], r[9], r[10], order++]
        );
      }
    }
  }
}

async function importQuestData() {
  let order = 0;
  for (const zoneGroup of ZONE_QUESTS) {
    for (const q of zoneGroup.quests) {
      await pool.query(
        `INSERT INTO quest_data (giver, zone, guild, item, notes, tips, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [q.giver, zoneGroup.zone, '', q.item, q.notes, q.tips || '', order++]
      );
    }
  }
  for (const guildGroup of GUILD_QUESTS) {
    for (const q of guildGroup.quests) {
      await pool.query(
        `INSERT INTO quest_data (giver, zone, guild, item, notes, tips, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [q.giver, 'Guild', guildGroup.guild, q.item, q.notes, q.tips || '', order++]
      );
    }
  }
}

async function initUserProgress(userId) {
  const questResult = await pool.query('SELECT id FROM quest_data');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const q of questResult.rows) {
      await client.query(
        `INSERT INTO user_quest_progress (user_id, quest_id, completed)
         VALUES ($1, $2, 0) ON CONFLICT (user_id, quest_id) DO NOTHING`,
        [userId, q.id]
      );
    }

    for (const g of GUILD_QUESTS) {
      await client.query(
        `INSERT INTO user_guild_ranks (user_id, guild_key, guild_name, rank)
         VALUES ($1, $2, $3, 0) ON CONFLICT (user_id, guild_key) DO NOTHING`,
        [userId, g.guild_key, g.guild]
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Auth Routes
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.render('login', { error: 'Invalid username or password' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.render('login', { error: 'Invalid username or password' });
    }
    req.session.userId = user.id;
    req.session.username = user.username;

    await initUserProgress(user.id);

    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'An error occurred' });
  }
});

app.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
  const { username, password, confirmPassword } = req.body;
  if (!username || !password) {
    return res.render('register', { error: 'Username and password are required' });
  }
  if (username.length < 3 || password.length < 4) {
    return res.render('register', { error: 'Username must be 3+ chars, password 4+ chars' });
  }
  if (password !== confirmPassword) {
    return res.render('register', { error: 'Passwords do not match' });
  }
  try {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.render('register', { error: 'Username already taken' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
      [username, hash]
    );
    const userId = result.rows[0].id;
    req.session.userId = userId;
    req.session.username = username;

    await initUserProgress(userId);

    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('register', { error: 'An error occurred' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Health check (used by platform monitoring; must not require auth or redirect)
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

// Page Routes
app.get('/', requireAuth, async (req, res) => {
  try {
    const rowsCount = {};
    for (const name of Object.keys(SHARED_TABLES)) {
      const row = await pool.query(`SELECT COUNT(*) as count FROM ${name}`);
      rowsCount[name] = parseInt(row.rows[0].count);
    }

    const customTabs = await pool.query(
      'SELECT ct.*, (SELECT COUNT(*) FROM custom_tab_entries WHERE tab_id = ct.id) as entry_count FROM custom_tabs ct WHERE user_id = $1 ORDER BY ct.sort_order, ct.id',
      [req.session.userId]
    );

    const questCount = await pool.query(
      `SELECT COUNT(*) as completed FROM user_quest_progress WHERE user_id = $1 AND completed = 1`,
      [req.session.userId]
    );
    const totalQuests = await pool.query('SELECT COUNT(*) as total FROM quest_data');

    res.render('index', {
      username: req.session.username,
      tables: SHARED_TABLES,
      rowsCount,
      customTabs: customTabs.rows,
      questCompleted: parseInt(questCount.rows[0].completed),
      questTotal: parseInt(totalQuests.rows[0].total),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/table/:tableName', requireAuth, async (req, res) => {
  const { tableName } = req.params;

  if (SHARED_TABLES[tableName]) {
    const info = SHARED_TABLES[tableName];
    const dbCols = info.columns.filter((c) => !c.virtual).map((c) => c.key);
    const selectCols = dbCols.map((k) => `t.${k}`).join(', ');

    const result = await pool.query(`SELECT t.id, ${selectCols} FROM ${tableName} t ORDER BY t.sort_order, t.id`);

    let filterOptions = null;
    if (tableName === 'spells') {
      const elements = await pool.query('SELECT DISTINCT element FROM spells WHERE element IS NOT NULL ORDER BY element');
      const schools = await pool.query('SELECT DISTINCT school FROM spells WHERE school IS NOT NULL ORDER BY school');
      filterOptions = { elements: elements.rows.map((r) => r.element), schools: schools.rows.map((r) => r.school) };
    }

    res.render('table', {
      tableName,
      displayName: info.display_name,
      columns: info.columns,
      rows: result.rows,
      isShared: true,
      apiBase: tableName,
      filterOptions,
      compact: tableName === 'spells' || tableName === 'monsters',
    });
  } else {
    // Custom tab
    const tabResult = await pool.query(
      'SELECT * FROM custom_tabs WHERE id = $1 AND user_id = $2',
      [tableName, req.session.userId]
    );
    if (tabResult.rows.length === 0) return res.status(404).send('Not found');

    const tab = tabResult.rows[0];
    const entriesResult = await pool.query(
      `SELECT cte.*, COALESCE(sp.element, '') as element, COALESCE(sp.school, '') as school
       FROM custom_tab_entries cte
       LEFT JOIN spells sp ON lower(cte.effect) = lower(sp.name)
       WHERE cte.tab_id = $1
       GROUP BY cte.id, sp.element, sp.school
       ORDER BY cte.sort_order, cte.id`,
      [tableName]
    );

    const elements = await pool.query('SELECT DISTINCT element FROM spells WHERE element IS NOT NULL ORDER BY element');
    const schools = await pool.query('SELECT DISTINCT school FROM spells WHERE school IS NOT NULL ORDER BY school');

    res.render('table', {
      tableName,
      displayName: tab.name,
      columns: CUSTOM_TAB_COLUMNS,
      rows: entriesResult.rows,
      isShared: false,
      apiBase: 'custom-tab-entries',
      filterOptions: { elements: elements.rows.map((r) => r.element), schools: schools.rows.map((r) => r.school) },
      compact: false,
    });
  }
});

app.get('/quests', requireAuth, async (req, res) => {
  try {
    const progressResult = await pool.query(
      `SELECT qd.*, uqp.completed
       FROM quest_data qd
       JOIN user_quest_progress uqp ON qd.id = uqp.quest_id
       WHERE uqp.user_id = $1
       ORDER BY qd.sort_order, qd.id`,
      [req.session.userId]
    );

    const guildRankResult = await pool.query(
      'SELECT * FROM user_guild_ranks WHERE user_id = $1 ORDER BY id',
      [req.session.userId]
    );

    const rankMap = {};
    for (const g of guildRankResult.rows) {
      rankMap[g.guild_key] = g;
    }

    res.render('quests', {
      quests: progressResult.rows,
      zoneQuests: ZONE_QUESTS,
      guildQuests: GUILD_QUESTS,
      guildRankMap: rankMap,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// API Routes

// Quest completion
app.put('/api/quest-complete/:questId', requireAuth, async (req, res) => {
  const { questId } = req.params;
  const { completed } = req.body;
  try {
    await pool.query(
      'UPDATE user_quest_progress SET completed = $1 WHERE user_id = $2 AND quest_id = $3',
      [completed ? 1 : 0, req.session.userId, questId]
    );
    res.json({ message: 'Quest completion updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Guild ranks
app.put('/api/guild-rank/:guildKey', requireAuth, async (req, res) => {
  const { guildKey } = req.params;
  const { rank } = req.body;
  if (typeof rank !== 'number' || rank < 0 || rank > 10) {
    return res.status(400).json({ error: 'Invalid rank' });
  }
  try {
    const guild = GUILD_QUESTS.find((g) => g.guild_key === guildKey);
    const guildName = guild ? guild.guild : guildKey;

    await pool.query(
      `INSERT INTO user_guild_ranks (user_id, guild_key, guild_name, rank)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, guild_key) DO UPDATE SET rank = $4`,
      [req.session.userId, guildKey, guildName, rank]
    );
    res.json({ message: 'Rank updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Custom tabs
app.post('/api/custom-tabs', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tab name is required' });
  }
  try {
    const maxOrder = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM custom_tabs WHERE user_id = $1',
      [req.session.userId]
    );
    const result = await pool.query(
      'INSERT INTO custom_tabs (user_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id',
      [req.session.userId, name.trim(), maxOrder.rows[0].next]
    );
    res.json({ id: result.rows[0].id, message: 'Tab created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/custom-tabs/:tabId', requireAuth, async (req, res) => {
  const { tabId } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tab name is required' });
  }
  try {
    await pool.query(
      'UPDATE custom_tabs SET name = $1 WHERE id = $2 AND user_id = $3',
      [name.trim(), tabId, req.session.userId]
    );
    res.json({ message: 'Tab renamed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/custom-tabs/:tabId', requireAuth, async (req, res) => {
  const { tabId } = req.params;
  try {
    await pool.query('DELETE FROM custom_tab_entries WHERE tab_id = $1', [tabId]);
    await pool.query('DELETE FROM custom_tabs WHERE id = $1 AND user_id = $2', [tabId, req.session.userId]);
    res.json({ message: 'Tab deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Custom tab entries
app.post('/api/custom-tab-entries/:tabId', requireAuth, async (req, res) => {
  const { tabId } = req.params;
  try {
    const tabCheck = await pool.query('SELECT id FROM custom_tabs WHERE id = $1 AND user_id = $2', [tabId, req.session.userId]);
    if (tabCheck.rows.length === 0) return res.status(404).json({ error: 'Tab not found' });

    const { spell_code, effect, type, influence, duration, charge, magnitude } = req.body;
    const maxOrder = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM custom_tab_entries WHERE tab_id = $1',
      [tabId]
    );
    const result = await pool.query(
      `INSERT INTO custom_tab_entries (tab_id, spell_code, effect, type, influence, duration, charge, magnitude, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [tabId, spell_code || '', effect || '', type || '', influence || '', duration || '', charge || '', magnitude || '', maxOrder.rows[0].next]
    );

    const entryResult = await pool.query(
      `SELECT cte.*, COALESCE(sp.element, '') as element, COALESCE(sp.school, '') as school
       FROM custom_tab_entries cte
       LEFT JOIN spells sp ON lower(cte.effect) = lower(sp.name)
       WHERE cte.id = $1
       GROUP BY cte.id, sp.element, sp.school`,
      [result.rows[0].id]
    );

    let warning = null;
    if (effect && !entryResult.rows[0].element) {
      warning = `No spell named "${effect}" found in Spells Info. Element/School will be blank.`;
    }

    res.json({ id: result.rows[0].id, entry: entryResult.rows[0], message: 'Entry added', warning });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/custom-tab-entries/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const entryCheck = await pool.query(
      `SELECT cte.id FROM custom_tab_entries cte
       JOIN custom_tabs ct ON cte.tab_id = ct.id
       WHERE cte.id = $1 AND ct.user_id = $2`,
      [id, req.session.userId]
    );
    if (entryCheck.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });

    const { spell_code, effect, type, influence, duration, charge, magnitude } = req.body;
    await pool.query(
      `UPDATE custom_tab_entries SET spell_code = $1, effect = $2, type = $3, influence = $4,
       duration = $5, charge = $6, magnitude = $7 WHERE id = $8`,
      [spell_code || '', effect || '', type || '', influence || '', duration || '', charge || '', magnitude || '', id]
    );

    const entryResult = await pool.query(
      `SELECT cte.*, COALESCE(sp.element, '') as element, COALESCE(sp.school, '') as school
       FROM custom_tab_entries cte
       LEFT JOIN spells sp ON lower(cte.effect) = lower(sp.name)
       WHERE cte.id = $1
       GROUP BY cte.id, sp.element, sp.school`,
      [id]
    );

    let warning = null;
    if (effect && !entryResult.rows[0].element) {
      warning = `No spell named "${effect}" found in Spells Info. Element/School will be blank.`;
    }

    res.json({ entry: entryResult.rows[0], message: 'Entry updated', warning });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/custom-tab-entries/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const entryCheck = await pool.query(
      `SELECT cte.id FROM custom_tab_entries cte
       JOIN custom_tabs ct ON cte.tab_id = ct.id
       WHERE cte.id = $1 AND ct.user_id = $2`,
      [id, req.session.userId]
    );
    if (entryCheck.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });

    await pool.query('DELETE FROM custom_tab_entries WHERE id = $1', [id]);
    res.json({ message: 'Entry deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/custom-tab-entries/reorder', requireAuth, async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Invalid order' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of order) {
      // Verify ownership
      const check = await client.query(
        `SELECT cte.id FROM custom_tab_entries cte
         JOIN custom_tabs ct ON cte.tab_id = ct.id
         WHERE cte.id = $1 AND ct.user_id = $2`,
        [item.id, req.session.userId]
      );
      if (check.rows.length > 0) {
        await client.query('UPDATE custom_tab_entries SET sort_order = $1 WHERE id = $2', [item.position, item.id]);
      }
    }
    await client.query('COMMIT');
    res.json({ message: 'Order updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Server Start
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Oathbreakers Guide running at http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
