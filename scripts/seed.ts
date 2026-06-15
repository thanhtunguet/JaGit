import { pathToFileURL } from "node:url";
import { buildSeedData, loadConfig, prisma, seedDatabase } from "@jigit/shared";

async function main(): Promise<void> {
  const cfg = loadConfig();
  console.log("🌱 Seeding JiGit database …");
  await seedDatabase(prisma, buildSeedData({ anthropicApiKey: cfg.anthropicApiKey }), cfg.encryptionKey);
  await prisma.$disconnect();
  console.log("✅ Seed complete.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
}
