import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { seedSuperAdmin } from './001_super_admin.js';

const __filename = fileURLToPath(import.meta.url);

async function runSeeds() {
  console.log('\n=============================================');
  console.log('   Course Platform Database Seed Runner      ');
  console.log('=============================================\n');

  try {
    await seedSuperAdmin();
    console.log('\n🎉 All seed scripts executed successfully.\n');
  } catch (err) {
    console.error('\n❌ Seeding failed:', err.message);
    process.exit(1);
  }
}

const isDirectCall = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectCall) {
  runSeeds().then(() => process.exit(0));
}

export { runSeeds };
export default runSeeds;

