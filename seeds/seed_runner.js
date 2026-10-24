const { seedSuperAdmin } = require('./001_super_admin');

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

if (require.main === module) {
  runSeeds().then(() => process.exit(0));
}

module.exports = { runSeeds };
