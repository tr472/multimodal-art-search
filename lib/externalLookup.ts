import type { TurnRetrievalContext } from "@/types/retrieval";

export type ConversationResearchMode = "indexed_corpus" | "external_lookup";

export type ExternalLookupCandidate = {
  mode: "IDENTIFICATION" | "CONTEXT" | "RECOMMENDATION";
  candidateTitle: string | null;
  candidateArtist: string | null;
  movementOrPeriod: string | null;
  evidenceSummary: string;
  sourceUrls: string[];
  confidence: number;
  sourceLabel: string;
};

export function chooseResearchMode(args: { retrieval: TurnRetrievalContext }) {
  return args.retrieval.evidence.shouldUseExternalLookup ? ("external_lookup" as const) : ("indexed_corpus" as const);
}

function buildSearchTerms(args: {
  queryText: string;
  ocrText?: string | null;
  topArtworkTitle?: string | null;
  topArtistName?: string | null;
}) {
  return [args.ocrText, args.topArtworkTitle, args.topArtistName, args.queryText]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

export async function lookupExternalArtContext(args: {
  queryText: string;
  ocrText?: string | null;
  topArtworkTitle?: string | null;
  topArtistName?: string | null;
}): Promise<ExternalLookupCandidate[]> {
  const trimmed = buildSearchTerms(args).trim();
  if (!trimmed) return [];

  try {
    const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");
    searchUrl.searchParams.set("srlimit", "3");
    searchUrl.searchParams.set("srsearch", trimmed);

    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) return [];

    const searchData = (await searchResponse.json()) as {
      query?: {
        search?: Array<{ title?: string }>;
      };
    };

    const titles = (searchData.query?.search ?? []).map((entry) => entry.title).filter((title): title is string => Boolean(title));
    if (titles.length === 0) return [];

    const summaries = await Promise.all(
      titles.map(async (title, index) => {
        try {
          const summaryResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
          if (!summaryResponse.ok) return null;
          const summary = (await summaryResponse.json()) as {
            title?: string;
            description?: string;
            extract?: string;
            content_urls?: { desktop?: { page?: string } };
          };

          return {
            mode: (index === 0 ? "IDENTIFICATION" : "CONTEXT") as "IDENTIFICATION" | "CONTEXT",
            candidateTitle: summary.title ?? title,
            candidateArtist: null,
            movementOrPeriod: summary.description ?? null,
            evidenceSummary: summary.extract ?? `Found external context related to ${title}.`,
            sourceUrls: summary.content_urls?.desktop?.page ? [summary.content_urls.desktop.page] : [],
            confidence: Math.max(0.34, 0.7 - index * 0.12),
            sourceLabel: "Wikipedia"
          };
        } catch {
          return null;
        }
      })
    );

    return summaries.filter((item): item is NonNullable<typeof item> => Boolean(item));
  } catch {
    return [];
  }
}
