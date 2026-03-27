require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../db');

const ROSTER = [
  { name: 'Blair',    isGKEligible: false },
  { name: 'CJ',      isGKEligible: false },
  { name: 'Ellie',   isGKEligible: false },
  { name: 'Grace',   isGKEligible: false },
  { name: 'Kate',    isGKEligible: true  },
  { name: 'Lucy B',  isGKEligible: false },
  { name: 'Lucy R',  isGKEligible: true  },
  { name: 'Maitland',isGKEligible: false },
  { name: 'Shea',    isGKEligible: false },
  { name: 'Tara',    isGKEligible: true  },
  { name: 'Wesley',  isGKEligible: false },
];

async function main() {
  console.log('Seeding Gaffer database...');

  // Create Spring 2025 season
  const season = await prisma.season.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'Spring 2025', year: 2025, isActive: true },
  });

  console.log(`Season: ${season.name} (id=${season.id})`);

  // Create players
  for (const p of ROSTER) {
    const player = await prisma.player.upsert({
      where: { id: (await prisma.player.findFirst({ where: { seasonId: season.id, name: p.name } }))?.id ?? 0 },
      update: { isGKEligible: p.isGKEligible },
      create: { seasonId: season.id, name: p.name, isGKEligible: p.isGKEligible },
    });
    console.log(`  Player: ${player.name} (GK-eligible: ${player.isGKEligible})`);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
