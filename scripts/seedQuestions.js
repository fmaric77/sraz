#!/usr/bin/env node
// JS seeding script mirroring the TypeScript version's backfill logic.
// Ensures each category has at least MIN_PER_CAT questions.
// Usage:
//   node scripts/seedQuestions.js            # backfill missing
//   node scripts/seedQuestions.js --reset    # drop existing then seed fresh
// Env: MONGODB_URI, MONGODB_DB optionally (.env.local/.env loaded via dotenv if available)

// Try to load dotenv if installed
try { require('dotenv').config({ path: '.env.local' }); } catch {}
try { require('dotenv').config(); } catch {}

const { MongoClient } = require('mongodb');

const argv = process.argv.slice(2);
const RESET = argv.includes('--reset');

// Official categories copied from models/types.ts
const CATEGORIES = [
  'Literature',
  'Culture',
  'General Knowledge',
  'History',
  'Nature',
  'Sport',
  'Geography',
  'Science',
  'Random',
];

// Sample bank identical to TS script
const sampleBank = {
  'Literature': [
    { text: 'Who wrote "1984"?', choices: ['George Orwell','Aldous Huxley','Ray Bradbury','J.R.R. Tolkien'], correctIndex: 0 },
    { text: 'Shakespeare tragedy featuring Hamlet is set in which country?', choices: ['Denmark','England','Italy','France'], correctIndex: 0 },
    { text: 'The Odyssey is attributed to which poet?', choices: ['Homer','Virgil','Sophocles','Plato'], correctIndex: 0 },
    { text: 'Author of "Pride and Prejudice"?', choices: ['Jane Austen','Emily Brontë','Mary Shelley','Virginia Woolf'], correctIndex: 0 },
    { text: 'Genre of "The Hobbit"?', choices: ['Fantasy','Romance','Historical','Satire'], correctIndex: 0 },
  ],
  'Culture': [
    { text: 'Origami is traditional paper folding from which country?', choices: ['Japan','China','Korea','Thailand'], correctIndex: 0 },
    { text: 'Diwali is a festival of lights in which religion?', choices: ['Hinduism','Buddhism','Christianity','Judaism'], correctIndex: 0 },
    { text: 'The Louvre Museum is located in which city?', choices: ['Paris','Rome','London','Madrid'], correctIndex: 0 },
    { text: 'Tango dance originated in?', choices: ['Argentina','Spain','Brazil','Mexico'], correctIndex: 0 },
    { text: 'Sushi primarily features what key ingredient?', choices: ['Rice','Wheat','Corn','Barley'], correctIndex: 0 },
  ],
  'General Knowledge': [
    { text: 'How many continents are there?', choices: ['7','5','6','8'], correctIndex: 0 },
    { text: 'Primary color NOT in RGB?', choices: ['Yellow','Red','Green','Blue'], correctIndex: 0 },
    { text: 'How many days in a leap year?', choices: ['366','365','364','367'], correctIndex: 0 },
    { text: 'Tallest mammal?', choices: ['Giraffe','Elephant','Moose','Rhino'], correctIndex: 0 },
    { text: 'Instrument with keys, pedals, and strings?', choices: ['Piano','Guitar','Violin','Flute'], correctIndex: 0 },
  ],
  'History': [
    { text: 'Who was the first President of the USA?', choices: ['George Washington','Abraham Lincoln','John Adams','Thomas Jefferson'], correctIndex: 0 },
    { text: 'The Roman Empire fell in (Western) year?', choices: ['476 AD','1066 AD','1492 AD','800 AD'], correctIndex: 0 },
    { text: 'The Magna Carta signed in which country?', choices: ['England','France','Germany','Spain'], correctIndex: 0 },
    { text: 'Pyramids of Giza are in which country?', choices: ['Egypt','Mexico','Peru','China'], correctIndex: 0 },
    { text: 'Explorer who reached the Americas in 1492?', choices: ['Christopher Columbus','Marco Polo','Ferdinand Magellan','James Cook'], correctIndex: 0 },
  ],
  'Nature': [
    { text: 'Photosynthesis primarily occurs in which plant cell organelle?', choices: ['Chloroplast','Mitochondrion','Nucleus','Ribosome'], correctIndex: 0 },
    { text: 'Largest land carnivore?', choices: ['Polar Bear','Lion','Kodiak Bear','Tiger'], correctIndex: 0 },
    { text: 'Desert known as the largest hot desert?', choices: ['Sahara','Gobi','Kalahari','Mojave'], correctIndex: 0 },
    { text: 'Bee-produced substance used as food?', choices: ['Honey','Royal Jelly','Wax','Propolis'], correctIndex: 0 },
    { text: 'Process of water vapor becoming liquid?', choices: ['Condensation','Evaporation','Sublimation','Precipitation'], correctIndex: 0 },
  ],
  'Sport': [
    { text: 'Number of players on a standard soccer team on the field?', choices: ['11','10','12','9'], correctIndex: 0 },
    { text: 'Olympic Games occur every ___ years.', choices: ['4','2','3','5'], correctIndex: 0 },
    { text: 'Grand Slam tournament played on clay?', choices: ['French Open','Wimbledon','US Open','Australian Open'], correctIndex: 0 },
    { text: 'Basketball originated in which country?', choices: ['USA','Canada','UK','Australia'], correctIndex: 0 },
    { text: 'Term for a score of one under par in golf?', choices: ['Birdie','Eagle','Par','Bogey'], correctIndex: 0 },
  ],
  'Geography': [
    { text: 'Capital of Japan?', choices: ['Tokyo','Kyoto','Osaka','Nagoya'], correctIndex: 0 },
    { text: 'River flowing through Egypt?', choices: ['Nile','Amazon','Danube','Yangtze'], correctIndex: 0 },
    { text: 'Mount Everest lies on the border of Nepal and?', choices: ['China','India','Bhutan','Pakistan'], correctIndex: 0 },
    { text: 'Largest ocean?', choices: ['Pacific','Atlantic','Indian','Arctic'], correctIndex: 0 },
    { text: 'Desert covering much of northern Africa?', choices: ['Sahara','Gobi','Patagonia','Great Victoria'], correctIndex: 0 },
  ],
  'Science': [
    { text: 'H2O is the chemical formula for?', choices: ['Water','Hydrogen peroxide','Ozone','Salt'], correctIndex: 0 },
    { text: 'Speed of light approx (km/s)?', choices: ['300000','150000','186000','100000'], correctIndex: 0 },
    { text: 'Gas plants absorb for photosynthesis?', choices: ['Carbon Dioxide','Nitrogen','Oxygen','Methane'], correctIndex: 0 },
    { text: 'Unit of electric current?', choices: ['Ampere','Volt','Ohm','Watt'], correctIndex: 0 },
    { text: 'Force that keeps planets in orbit?', choices: ['Gravity','Magnetism','Friction','Inertia'], correctIndex: 0 },
  ],
  'Random': [
    { text: 'Wildcard squares can draw from which set?', choices: ['All other categories','Only Science','Only Sport','Only Literature'], correctIndex: 0 },
    { text: 'Random category stands for?', choices: ['Wildcard','Specific topic','Math only','Geology only'], correctIndex: 0 },
    { text: 'Purpose of Random squares?', choices: ['Variety','Remove challenge','Guarantee win','Skip turn'], correctIndex: 0 },
    { text: 'Random selection should be?', choices: ['Unbiased','Biased','Predictable','Fixed'], correctIndex: 0 },
    { text: 'Fallback if no DB questions?', choices: ['Use sample','Throw error','Crash','Return null'], correctIndex: 0 },
  ],
};

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/quizchess';
  // Determine DB name
  let dbName = process.env.MONGODB_DB;
  if (!dbName) {
    try {
      const last = uri.split('/').pop();
      if (last) dbName = last.split('?')[0];
    } catch {}
  }
  dbName = dbName || 'quizchess';

  console.log(`[seedQuestions] Connecting to ${uri} (db=${dbName})`);
  const client = await MongoClient.connect(uri);
  const db = client.db(dbName);
  const col = db.collection('questions');

  if (RESET) {
    console.log('[seedQuestions] --reset flag detected: dropping existing collection (if present).');
    try { await col.drop(); console.log('[seedQuestions] Dropped existing questions collection.'); } catch (e) {
      if (e && e.codeName !== 'NamespaceNotFound') console.warn('Drop warning:', e.message);
      else console.log('[seedQuestions] Collection did not exist.');
    }
  }

  const MIN_PER_CAT = 5;
  // Aggregate counts per category
  const existingCounts = await col.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ]).toArray();
  const countMap = new Map(existingCounts.map(e => [e._id, e.count]));

  const docs = [];
  for (const cat of CATEGORIES) {
    const have = countMap.get(cat) || 0;
    if (have >= MIN_PER_CAT) continue;
    const needed = MIN_PER_CAT - have;
    const bank = sampleBank[cat] || [];
    for (let i = 0; i < needed; i++) {
      const sample = bank[i % bank.length] || {
        text: `${cat} sample question ${have + i + 1}?`,
        choices: ['Option A','Option B','Option C','Option D'],
        correctIndex: 0,
      };
      docs.push({
        category: cat,
        text: sample.text,
        choices: sample.choices,
        correctIndex: sample.correctIndex,
        language: 'en',
      });
    }
  }

  if (docs.length) {
    await col.insertMany(docs);
    console.log(`[seedQuestions] Inserted ${docs.length} new questions.`);
  } else {
    console.log('[seedQuestions] All categories already meet minimum question count. No inserts.');
  }

  await client.close();
  console.log('[seedQuestions] Done.');
}

main().catch(err => { console.error('[seedQuestions] Error:', err); process.exit(1); });
