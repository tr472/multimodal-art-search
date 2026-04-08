import { appConfig } from "@/lib/config";
import type { Embedding } from "@/types/retrieval";

const DIMENSION: number = appConfig.embeddings.deterministicDimension;

function hashToken(token: string): number {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) % 1000000007;
  }
  return hash;
}

export function deterministicTextEmbedding(input: string, dimension = DIMENSION): Embedding {
  const vec = new Array<number>(dimension).fill(0);
  const tokens = input.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  for (const token of tokens) {
    const hash = hashToken(token);
    const idx = hash % dimension;
    vec[idx] += 1 + (hash % 7) / 10;
  }

  const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0)) || 1;
  return vec.map((v) => v / norm);
}

export async function textToEmbeddings(inputs: string[]): Promise<Embedding[]> {
  if (inputs.length === 0) return [];

  const sanitized = inputs.map((input) => input.trim());
  const nonEmptyEntries = sanitized
    .map((input, index) => ({ input, index }))
    .filter((entry) => entry.input.length > 0);
  const apiKey = appConfig.openai.apiKey;
  const model = appConfig.openai.embeddingModel;

  if (nonEmptyEntries.length === 0) {
    return sanitized.map(deterministicTextEmbedding);
  }

  if (!apiKey) {
    return sanitized.map(deterministicTextEmbedding);
  }

  for (let attempt = 0; attempt <= appConfig.embeddings.requestMaxRetries; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          input: nonEmptyEntries.map((entry) => entry.input)
        })
      });

      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < appConfig.embeddings.requestMaxRetries) {
          await new Promise((resolve) => setTimeout(resolve, appConfig.embeddings.requestRetryDelayMs * (attempt + 1)));
          continue;
        }

        console.error(`OpenAI embeddings request failed (${response.status}); falling back to deterministic embeddings.`);
        return sanitized.map(deterministicTextEmbedding);
      }

      const data = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };

      const embeddings = data.data?.map((item) => item.embedding ?? []) ?? [];
      if (embeddings.length !== nonEmptyEntries.length || embeddings.some((embedding) => embedding.length === 0)) {
        return sanitized.map(deterministicTextEmbedding);
      }

      const merged = sanitized.map(deterministicTextEmbedding);
      for (let i = 0; i < nonEmptyEntries.length; i += 1) {
        merged[nonEmptyEntries[i].index] = embeddings[i];
      }

      return merged;
    } catch (error) {
      if (attempt < appConfig.embeddings.requestMaxRetries) {
        await new Promise((resolve) => setTimeout(resolve, appConfig.embeddings.requestRetryDelayMs * (attempt + 1)));
        continue;
      }

      console.error("OpenAI embeddings request failed; falling back to deterministic embeddings.", error);
      return sanitized.map(deterministicTextEmbedding);
    }
  }

  return sanitized.map(deterministicTextEmbedding);
}

export async function textToEmbedding(input: string): Promise<Embedding> {
  const [embedding] = await textToEmbeddings([input]);
  return embedding ?? deterministicTextEmbedding(input);
}

export async function textToCompatibleEmbedding(input: string, targetDimension?: number | null): Promise<Embedding> {
  if (!targetDimension || targetDimension <= 0) {
    return textToEmbedding(input);
  }

  const embedding = await textToEmbedding(input);
  if (embedding.length === targetDimension) {
    return embedding;
  }

  return deterministicTextEmbedding(input, targetDimension);
}

export function imageToEmbedding(imageUrl: string): Embedding {
  return deterministicTextEmbedding(`image:${imageUrl}`);
}

export function blendEmbeddings(embeddings: Embedding[]): Embedding {
  const valid = embeddings.filter((embedding) => embedding.length > 0);
  if (valid.length === 0) return [];

  const blended = new Array<number>(valid[0].length).fill(0);
  for (const embedding of valid) {
    for (let i = 0; i < embedding.length; i += 1) {
      blended[i] += embedding[i];
    }
  }

  const norm = Math.sqrt(blended.reduce((sum, val) => sum + val * val, 0)) || 1;
  return blended.map((value) => value / norm);
}

export function cosineSimilarity(a: Embedding, b: Embedding): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
