import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NormalizedMuseumRecord } from "@/lib/ingestion/types";
import { upsertNormalizedMuseumRecords } from "@/lib/ingestion/pipeline/upsertNormalized";
import { prisma } from "@/lib/db";

type SeedOptions = {
  subsetPath: string;
  resetConversations: boolean;
  resetTasteProfile: boolean;
  pruneCorpusToSeed: boolean;
};

function parseOptions(): SeedOptions {
  const args = process.argv.slice(2);
  const pathArg = args.find((arg) => !arg.startsWith("--"));

  return {
    subsetPath: pathArg
      ? path.resolve(process.cwd(), pathArg)
      : path.join(process.cwd(), "ingestion/data/met-demo-subset.normalized.json"),
    resetConversations: args.includes("--reset-conversations"),
    resetTasteProfile: args.includes("--reset-taste-profile"),
    pruneCorpusToSeed: args.includes("--prune-corpus-to-seed")
  };
}

async function maybeResetConversationState(options: SeedOptions) {
  if (!options.resetConversations && !options.resetTasteProfile) {
    return;
  }

  if (options.resetConversations) {
    await prisma.recommendationEvent.deleteMany();
    await prisma.chatMessage.deleteMany();
    await prisma.chatThread.deleteMany();
    await prisma.submissionAnalysis.deleteMany();
    await prisma.submission.deleteMany();
  }

  if (options.resetTasteProfile || options.resetConversations) {
    await prisma.userTasteProfile.deleteMany();
  }
}

async function maybePruneCorpus(records: NormalizedMuseumRecord[]) {
  const keepKeys = new Set(records.map((record) => `${record.externalSource}::${record.externalId}`));
  const artworks = await prisma.artwork.findMany({
    select: { id: true, externalSource: true, externalId: true }
  });
  const artworkIdsToDelete = artworks
    .filter((artwork) => !keepKeys.has(`${artwork.externalSource}::${artwork.externalId}`))
    .map((artwork) => artwork.id);

  if (artworkIdsToDelete.length === 0) return 0;

  await prisma.artwork.deleteMany({
    where: {
      id: { in: artworkIdsToDelete }
    }
  });

  return artworkIdsToDelete.length;
}

async function main() {
  const options = parseOptions();
  const subsetContent = await readFile(options.subsetPath, "utf8");
  const records = JSON.parse(subsetContent) as NormalizedMuseumRecord[];

  console.log(`Seeding from ${options.subsetPath}`);
  console.log(`Upserting ${records.length} records into the corpus...`);
  await upsertNormalizedMuseumRecords(records);

  let prunedCount = 0;
  if (options.pruneCorpusToSeed) {
    console.log("Pruning corpus down to exactly the seeded subset...");
    prunedCount = await maybePruneCorpus(records);
  }

  await maybeResetConversationState(options);

  const status = [
    `Seed complete. Upserted ${records.length} corpus artwork records.`,
    options.pruneCorpusToSeed ? `Pruned ${prunedCount} artwork records not present in the seed subset.` : "Existing expanded corpus records were preserved.",
    options.resetConversations ? "Conversation history was reset." : "Conversation history was preserved.",
    options.resetTasteProfile || options.resetConversations ? "Taste profiles were reset." : "Taste profiles were preserved."
  ];

  console.log(status.join(" "));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
