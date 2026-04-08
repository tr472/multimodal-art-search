import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MetMuseumAdapter } from "@/lib/ingestion/adapters/metMuseumAdapter";
import { passesMuseumFilter } from "@/lib/ingestion/filter";
import { normalizeMetMuseumRecord } from "@/lib/ingestion/normalize/metMuseum";
import { upsertNormalizedMuseumRecords } from "@/lib/ingestion/pipeline/upsertNormalized";
import type { IngestionOptions, MuseumRecord } from "@/lib/ingestion/types";
import { prisma } from "@/lib/db";

/**
 * Live Met ingestion entrypoint.
 * Designed for long-running jobs with resumability and API-safe batching.
 */
type CursorState = {
  ids: number[];
  nextIndex: number;
};

function parseOptions(): IngestionOptions {
  const args = process.argv.slice(2);

  const getNumber = (flag: string, fallback: number) => {
    const value = args.find((arg) => arg.startsWith(`${flag}=`))?.split("=")[1];
    return value ? Number(value) : fallback;
  };

  const getString = (flag: string, fallback: string) => {
    const value = args.find((arg) => arg.startsWith(`${flag}=`))?.split("=")[1];
    return value || fallback;
  };

  const hasFlag = (flag: string) => args.includes(flag);

  return {
    query: getString("--query", "painting"),
    hasImages: !hasFlag("--allow-no-images"),
    maxRecords: getNumber("--max-records", 200),
    batchSize: getNumber("--batch-size", 20),
    maxConcurrentRequests: getNumber("--max-concurrent-requests", 4),
    interBatchDelayMs: getNumber("--inter-batch-delay-ms", 350),
    maxRetries: getNumber("--max-retries", 2),
    retryDelayMs: getNumber("--retry-delay-ms", 500),
    startOffset: getNumber("--start-offset", 0),
    resetCursor: hasFlag("--reset-cursor"),
    filter: {
      requireImage: !hasFlag("--filter-no-image=false"),
      requireTitle: !hasFlag("--filter-no-title=false"),
      requireArtistOrDescription: !hasFlag("--filter-no-artist-or-description=false")
    }
  };
}

async function loadCursor(cursorPath: string): Promise<CursorState | null> {
  try {
    const content = await readFile(cursorPath, "utf8");
    return JSON.parse(content) as CursorState;
  } catch {
    return null;
  }
}

async function clearCursor(cursorPath: string) {
  await writeFile(cursorPath, JSON.stringify({ ids: [], nextIndex: 0 }, null, 2), "utf8");
}

async function saveCursor(cursorPath: string, cursor: CursorState) {
  await writeFile(cursorPath, JSON.stringify(cursor, null, 2), "utf8");
}

async function appendNdjson(filePath: string, payload: unknown) {
  const line = `${JSON.stringify(payload)}\n`;
  await writeFile(filePath, line, { encoding: "utf8", flag: "a" });
}

async function main() {
  const options = parseOptions();

  const cacheDir = path.join(process.cwd(), "data/raw/met");
  const cursorPath = path.join(cacheDir, "cursor.json");
  const rawPath = path.join(cacheDir, "records.ndjson");

  await mkdir(cacheDir, { recursive: true });

  const adapter = new MetMuseumAdapter({
    maxRetries: options.maxRetries,
    retryDelayMs: options.retryDelayMs,
    maxConcurrentRequests: options.maxConcurrentRequests,
    interBatchDelayMs: options.interBatchDelayMs
  });

  if (options.resetCursor) {
    await clearCursor(cursorPath);
  }

  const existingCursor = options.resetCursor ? null : await loadCursor(cursorPath);
  const ids = existingCursor?.ids ?? (await adapter.fetchRecordIds({ query: options.query, hasImages: options.hasImages }));
  const start = existingCursor ? existingCursor.nextIndex : options.startOffset;
  const targetTotal = Math.min(options.maxRecords, Math.max(ids.length - start, 0));
  const startedAt = Date.now();
  let nextProgressLog = 10;

  console.log(`Found ${ids.length} IDs for query \"${options.query}\". Starting at offset ${start}.`);
  console.log(
    `Rate-limit-safe mode: batchSize=${options.batchSize}, maxConcurrentRequests=${options.maxConcurrentRequests}, interBatchDelayMs=${options.interBatchDelayMs}`
  );

  let processed = 0;
  let kept = 0;
  let pendingNormalized: ReturnType<typeof normalizeMetMuseumRecord>[] = [];

  for await (const item of adapter.iterateRecordsByIds({
    ids,
    batchSize: options.batchSize,
    startOffset: start
  })) {
    if (processed >= options.maxRecords) break;

    processed += 1;
    const nextIndex = item.index + 1;

    await saveCursor(cursorPath, { ids, nextIndex });

    if (!item.record) continue;

    const record = item.record as MuseumRecord;
    await appendNdjson(rawPath, { objectID: item.id, fetchedAt: new Date().toISOString(), payload: record });

    if (!passesMuseumFilter(record, options.filter)) continue;

    const normalized = normalizeMetMuseumRecord(record);
    pendingNormalized.push(normalized);
    kept += 1;

    if (pendingNormalized.length >= options.batchSize) {
      await upsertNormalizedMuseumRecords(pendingNormalized);
      pendingNormalized = [];
    }

    if (targetTotal > 0) {
      const percent = Math.floor((processed / targetTotal) * 100);
      if (percent >= nextProgressLog || processed % 25 === 0) {
        const elapsedMs = Date.now() - startedAt;
        const perRecordMs = processed > 0 ? elapsedMs / processed : 0;
        const remaining = Math.max(targetTotal - processed, 0);
        const etaMs = Math.floor(perRecordMs * remaining);
        console.log(
          `[progress] ${processed}/${targetTotal} (${Math.min(percent, 100)}%) kept=${kept} elapsed=${Math.round(
            elapsedMs / 1000
          )}s eta=${Math.round(etaMs / 1000)}s`
        );
        while (nextProgressLog <= percent) nextProgressLog += 10;
      }
    }
  }

  if (pendingNormalized.length > 0) {
    await upsertNormalizedMuseumRecords(pendingNormalized);
  }

  console.log(`Ingestion complete. Processed=${processed}, kept=${kept}.`);
  console.log(`Raw payload cache: ${rawPath}`);
  console.log(`Cursor state: ${cursorPath}`);
}

main()
  .catch((error) => {
    console.error("ingest-museum failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
