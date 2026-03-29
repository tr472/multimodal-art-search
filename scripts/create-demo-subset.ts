import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeMetMuseumRecord } from "@/lib/ingestion/normalize/metMuseum";
import { passesMuseumFilter } from "@/lib/ingestion/filter";
import type { MuseumRecord, NormalizedMuseumRecord } from "@/lib/ingestion/types";

function parseArgs() {
  const args = process.argv.slice(2);
  const getNumber = (flag: string, fallback: number) => {
    const value = args.find((arg) => arg.startsWith(`${flag}=`))?.split("=")[1];
    return value ? Number(value) : fallback;
  };

  return {
    count: getNumber("--count", 60),
    inputPath: path.join(process.cwd(), "data/raw/met/records.ndjson"),
    outputPath: path.join(process.cwd(), "ingestion/data/met-demo-subset.normalized.json")
  };
}

function deterministicShuffle<T>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const aa = JSON.stringify(a).length;
    const bb = JSON.stringify(b).length;
    return aa - bb;
  });
}

async function main() {
  const { count, inputPath, outputPath } = parseArgs();
  const raw = await readFile(inputPath, "utf8");
  const lines = raw.split("\n").filter(Boolean);

  const records: MuseumRecord[] = [];

  for (const line of lines) {
    const parsed = JSON.parse(line) as { payload?: MuseumRecord };
    if (!parsed.payload) continue;
    if (passesMuseumFilter(parsed.payload, { requireImage: true, requireTitle: true, requireArtistOrDescription: true })) {
      records.push(parsed.payload);
    }
  }

  const normalized = deterministicShuffle(records)
    .slice(0, count)
    .map((record): NormalizedMuseumRecord => normalizeMetMuseumRecord(record));

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(normalized, null, 2), "utf8");

  console.log(`Wrote reproducible demo subset with ${normalized.length} records to ${outputPath}`);
}

main().catch((error) => {
  console.error("create-demo-subset failed", error);
  process.exit(1);
});
