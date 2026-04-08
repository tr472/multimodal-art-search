import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { textToEmbeddings } from "@/lib/embeddings";
import { syncArtistPgvectorColumns, syncArtworkPgvectorColumns } from "@/lib/pgvector";
import { buildArtworkSemanticText, extractSemanticTags } from "@/lib/semanticTags";
import { buildVisualEmbedding } from "@/lib/visualEmbeddings";
import type { NormalizedMuseumRecord } from "@/lib/ingestion/types";

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getArtworkSemanticText(record: NormalizedMuseumRecord) {
  const metadataJson = record.artwork.metadataJson as { semanticText?: unknown; semanticTags?: unknown; sourceTags?: unknown };

  if (typeof metadataJson.semanticText === "string" && metadataJson.semanticText.trim()) {
    return metadataJson.semanticText;
  }

  return buildArtworkSemanticText({
    title: record.artwork.title,
    artistName: record.artist?.name ?? null,
    description: record.artwork.description,
    medium: record.artwork.medium,
    dateText: record.artwork.dateText,
    sourceTags: asStringArray(metadataJson.sourceTags),
    semanticTags: extractSemanticTags(
      record.artwork.title,
      record.artist?.name ?? "",
      record.artwork.description ?? "",
      record.artwork.medium ?? ""
    )
  });
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

/**
 * Persists normalized museum records into the core schema.
 * Deduplication key for artworks: (externalSource, externalId).
 */
export async function upsertNormalizedMuseumRecords(records: NormalizedMuseumRecord[]) {
  const artistTexts = records.map((record) => (record.artist ? `${record.artist.name} ${record.artist.bio ?? ""}` : ""));
  const artworkTexts = records.map((record) => getArtworkSemanticText(record));
  const [artistEmbeddings, artworkEmbeddings] = await Promise.all([
    textToEmbeddings(artistTexts),
    textToEmbeddings(artworkTexts)
  ]);
  const visualEmbeddings = await mapWithConcurrency(records, 3, async (record, index) => {
    const metadataJson = record.artwork.metadataJson as { imageDescriptorText?: unknown };
    const existingDescriptorText =
      typeof metadataJson.imageDescriptorText === "string" && metadataJson.imageDescriptorText.trim()
        ? metadataJson.imageDescriptorText
        : undefined;

    if (existingDescriptorText) {
      return {
        descriptor: null,
        descriptorText: existingDescriptorText,
        embedding: await textToEmbeddings([existingDescriptorText]).then((items) => items[0] ?? [])
      };
    }

    return buildVisualEmbedding({
      imageUrl: record.artwork.imageUrl,
      contextText: artworkTexts[index]
    });
  });

  for (const [index, record] of records.entries()) {
    const artistRecord = record.artist;
    const artistEmbedding = artistRecord ? artistEmbeddings[index] ?? null : null;
    const artist = artistRecord
      ? await prisma.artist.findFirst({
          where: {
            name: artistRecord.name,
            birthYear: null
          }
        }).then((existingArtist) => {
          const artistUpdatePayload = {
            bio: artistRecord.bio,
            textEmbedding: artistEmbedding ? asJson(artistEmbedding) : undefined
          };

          if (existingArtist) {
            return prisma.artist.update({
              where: { id: existingArtist.id },
              data: artistUpdatePayload
            });
          }

          return prisma.artist.create({
            data: {
              name: artistRecord.name,
              birthYear: null,
              bio: artistRecord.bio,
              textEmbedding: artistEmbedding ? asJson(artistEmbedding) : undefined
            }
          });
        })
      : null;

    if (artist?.id && artistEmbedding) {
      await syncArtistPgvectorColumns({
        artistId: artist.id,
        textEmbedding: artistEmbedding
      });
    }

    const institution = record.institution
      ? await prisma.institution.upsert({
          where: {
            name_city: {
              name: record.institution.name,
              city: record.institution.city ?? "Unknown"
            }
          },
          update: {
            country: record.institution.country,
            website: record.institution.website,
            type: record.institution.type
          },
          create: {
            name: record.institution.name,
            city: record.institution.city ?? "Unknown",
            country: record.institution.country,
            website: record.institution.website,
            type: record.institution.type
          }
        })
      : null;

    const textEmbedding = artworkEmbeddings[index] ?? [];
    const visualEmbedding = visualEmbeddings[index];
    const metadataJson = {
      ...record.artwork.metadataJson,
      imageDescriptor: visualEmbedding.descriptor,
      imageDescriptorText: visualEmbedding.descriptorText,
      rawPayload: record.rawPayload
    };

    const persistedArtwork = await prisma.artwork.upsert({
      where: {
        externalSource_externalId: {
          externalSource: record.externalSource,
          externalId: record.externalId
        }
      },
      update: {
        title: record.artwork.title,
        dateText: record.artwork.dateText,
        medium: record.artwork.medium,
        dimensions: record.artwork.dimensions,
        description: record.artwork.description,
        imageUrl: record.artwork.imageUrl,
        metadataJson: asJson(metadataJson),
        textEmbedding: asJson(textEmbedding),
        imageEmbedding: Array.isArray(visualEmbedding.embedding) ? asJson(visualEmbedding.embedding) : undefined,
        sourceUrl: record.sourceUrl,
        provenanceJson: asJson(record.artwork.provenanceJson),
        artistId: artist?.id,
        institutionId: institution?.id
      },
      create: {
        externalSource: record.externalSource,
        externalId: record.externalId,
        title: record.artwork.title,
        dateText: record.artwork.dateText,
        medium: record.artwork.medium,
        dimensions: record.artwork.dimensions,
        description: record.artwork.description,
        imageUrl: record.artwork.imageUrl,
        metadataJson: asJson(metadataJson),
        textEmbedding: asJson(textEmbedding),
        imageEmbedding: Array.isArray(visualEmbedding.embedding) ? asJson(visualEmbedding.embedding) : undefined,
        sourceUrl: record.sourceUrl,
        provenanceJson: asJson(record.artwork.provenanceJson),
        artistId: artist?.id,
        institutionId: institution?.id
      }
    });

    await syncArtworkPgvectorColumns({
      artworkId: persistedArtwork.id,
      textEmbedding,
      imageEmbedding: Array.isArray(visualEmbedding.embedding) ? visualEmbedding.embedding : null
    });
  }
}
