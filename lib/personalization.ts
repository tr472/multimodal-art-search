import { prisma } from "@/lib/db";
import { textToEmbedding } from "@/lib/embeddings";
import { extractSemanticTags } from "@/lib/semanticTags";

export async function updateTasteProfile(userId: string, note: string) {
  const discovered = extractSemanticTags(note).allTags;

  const existing = await prisma.userTasteProfile.findUnique({ where: { userId } });
  const preferenceTags = Array.from(new Set([...(existing?.preferenceTags ?? []), ...discovered]));

  return prisma.userTasteProfile.upsert({
    where: { userId },
    update: {
      preferenceTags,
      summaryText:
        preferenceTags.length > 0
          ? `Prefers: ${preferenceTags.join(", ")}`
          : existing?.summaryText ?? "No strong preferences yet.",
      embedding: await textToEmbedding(preferenceTags.join(" "))
    },
    create: {
      userId,
      preferenceTags,
      dislikedTags: [],
      summaryText:
        preferenceTags.length > 0 ? `Prefers: ${preferenceTags.join(", ")}` : "No strong preferences yet.",
      embedding: await textToEmbedding(preferenceTags.join(" "))
    }
  });
}
