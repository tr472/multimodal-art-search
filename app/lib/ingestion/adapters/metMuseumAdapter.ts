import type { SourceAdapter } from "@/lib/ingestion/adapters/sourceAdapter";
import type { MuseumRecord } from "@/lib/ingestion/types";

const MET_BASE_URL = "https://collectionapi.metmuseum.org/public/collection/v1";

async function fetchWithRetry<T>(
  url: string,
  options: { maxRetries: number; retryDelayMs: number }
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "art-search-mvp-ingestor/1.0"
        }
      });

      if (!response.ok) {
        throw new Error(`Request failed ${response.status} for ${url}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < options.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

export class MetMuseumAdapter implements SourceAdapter<MuseumRecord> {
  sourceName = "met_museum_api";

  constructor(
    private readonly options: {
      maxRetries: number;
      retryDelayMs: number;
      maxConcurrentRequests: number;
      interBatchDelayMs: number;
    }
  ) {}

  async fetchRecordIds(params: { query: string; hasImages?: boolean }): Promise<number[]> {
    const searchParams = new URLSearchParams({
      q: params.query,
      hasImages: String(params.hasImages ?? true)
    });

    const data = await fetchWithRetry<{ total: number; objectIDs: number[] | null }>(
      `${MET_BASE_URL}/search?${searchParams.toString()}`,
      this.options
    );

    return data.objectIDs ?? [];
  }

  async fetchRecordById(id: number): Promise<MuseumRecord | null> {
    try {
      return await fetchWithRetry<MuseumRecord>(`${MET_BASE_URL}/objects/${id}`, this.options);
    } catch {
      return null;
    }
  }

  async *iterateRecordsByIds(args: {
    ids: number[];
    batchSize: number;
    startOffset?: number;
  }): AsyncGenerator<{ id: number; record: MuseumRecord | null; index: number }> {
    const start = args.startOffset ?? 0;

    for (let i = start; i < args.ids.length; i += args.batchSize) {
      const batch = args.ids.slice(i, i + args.batchSize);
      const records: Array<{ id: number; record: MuseumRecord | null }> = [];

      for (let j = 0; j < batch.length; j += this.options.maxConcurrentRequests) {
        const chunk = batch.slice(j, j + this.options.maxConcurrentRequests);
        const chunkResults = await Promise.all(
          chunk.map(async (id) => ({ id, record: await this.fetchRecordById(id) }))
        );
        records.push(...chunkResults);
      }

      for (let j = 0; j < records.length; j += 1) {
        const absoluteIndex = i + j;
        yield {
          id: records[j].id,
          record: records[j].record,
          index: absoluteIndex
        };
      }

      if (this.options.interBatchDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.options.interBatchDelayMs));
      }
    }
  }
}
