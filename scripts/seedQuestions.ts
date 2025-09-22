#!/usr/bin/env ts-node
// Ensure environment variables (.env.local) are loaded when running outside Next.js runtime
import 'dotenv/config';
import { getCollection, closeDb } from '@/lib/db';
import { Question, CATEGORIES } from '@/models/types';

async function main() {
  const col = await getCollection<Question>('questions');
  // Backfill strategy: for each category ensure at least MIN_PER_CAT questions.
  const MIN_PER_CAT = 5;
  const existingCounts = await col.aggregate<{ _id: string; count: number }>([
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ]).toArray();
  const countMap = new Map<string, number>(existingCounts.map(e => [e._id, e.count]));

  const docs: Question[] = [];
  // Simple tailored sample question templates per category.
  const sampleBank: Record<string, { text: string; choices: [string,string,string,string]; correctIndex: number }[]> = {
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

  for (const cat of CATEGORIES) {
    const have = countMap.get(cat) || 0;
    if (have >= MIN_PER_CAT) continue;
    const needed = MIN_PER_CAT - have;
    const bank = sampleBank[cat] || [];
    for (let i = 0; i < needed; i++) {
      const sample = bank[i % bank.length] || {
        text: `${cat} sample question ${have + i + 1}?`,
        choices: ['Option A','Option B','Option C','Option D'] as [string,string,string,string],
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
    await col.insertMany(docs as unknown as Question[]);
    console.log('Inserted', docs.length, 'new questions to backfill categories.');
  } else {
    console.log('All categories already meet minimum question count. No inserts.');
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(()=> closeDb());
