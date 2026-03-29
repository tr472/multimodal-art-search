type SemanticTagGroup = "styleTags" | "categoryTags" | "subjectTags" | "materialTags" | "paletteTags";

export type SemanticTagBundle = {
  styleTags: string[];
  categoryTags: string[];
  subjectTags: string[];
  materialTags: string[];
  paletteTags: string[];
  allTags: string[];
};

const TAG_RULES: Record<SemanticTagGroup, Record<string, string[]>> = {
  styleTags: {
    impressionism: ["impressionism", "impressionist", "plein air"],
    "post-impressionism": ["post-impressionism", "post impressionism", "van gogh", "gauguin", "cezanne"],
    baroque: ["baroque", "dramatic light", "chiaroscuro"],
    renaissance: ["renaissance"],
    realism: ["realism", "realist"],
    expressionism: ["expressionism", "expressionist", "expressive brushwork"],
    cubism: ["cubism", "cubist"],
    surrealism: ["surrealism", "surrealist"],
    abstract: ["abstract", "nonobjective", "non-objective", "geometric abstraction"]
  },
  categoryTags: {
    painting: ["painting", "paintings", "oil on canvas", "tempera"],
    drawing: ["drawing", "drawings", "graphite", "charcoal", "pastel"],
    print: ["print", "prints", "etching", "engraving", "lithograph", "woodcut"],
    sculpture: ["sculpture", "bronze", "marble", "carved"],
    textile: ["textile", "tapestry", "woven"],
    photography: ["photograph", "photography", "albumen", "gelatin silver"],
    decorative: ["decorative", "ornament", "design"]
  },
  subjectTags: {
    portrait: ["portrait", "face", "sitter", "figure"],
    landscape: ["landscape", "field", "garden", "river", "tree", "mountain", "nature"],
    still_life: ["still life", "fruit", "flowers", "vase", "tabletop"],
    music: ["music", "musician", "musicians", "instrument", "violin", "guitar"],
    religious: ["madonna", "christ", "saint", "biblical", "religious"],
    animal: ["animal", "bird", "dog", "horse", "cat"],
    architecture: ["architecture", "building", "interior", "room", "cathedral"]
  },
  materialTags: {
    oil: ["oil", "oil on canvas", "oil on wood"],
    watercolor: ["watercolor", "watercolour"],
    ink: ["ink"],
    pastel: ["pastel"],
    charcoal: ["charcoal"],
    bronze: ["bronze"],
    marble: ["marble"]
  },
  paletteTags: {
    blue: ["blue", "azure", "cobalt"],
    red: ["red", "crimson", "scarlet"],
    green: ["green", "emerald", "verdant"],
    gold: ["gold", "golden", "ochre"],
    monochrome: ["monochrome", "black and white", "grayscale"]
  }
};

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}

function collectMatches(haystack: string, rules: Record<string, string[]>) {
  return Object.entries(rules)
    .filter(([, needles]) => needles.some((needle) => haystack.includes(needle)))
    .map(([tag]) => tag);
}

export function extractSemanticTags(...parts: Array<string | null | undefined>): SemanticTagBundle {
  const haystack = parts
    .filter(Boolean)
    .map((part) => String(part).toLowerCase())
    .join(" ");

  const styleTags = collectMatches(haystack, TAG_RULES.styleTags);
  const categoryTags = collectMatches(haystack, TAG_RULES.categoryTags);
  const subjectTags = collectMatches(haystack, TAG_RULES.subjectTags);
  const materialTags = collectMatches(haystack, TAG_RULES.materialTags);
  const paletteTags = collectMatches(haystack, TAG_RULES.paletteTags);

  return {
    styleTags,
    categoryTags,
    subjectTags,
    materialTags,
    paletteTags,
    allTags: dedupe([...styleTags, ...categoryTags, ...subjectTags, ...materialTags, ...paletteTags])
  };
}

export function summarizePaletteTags(paletteTags: string[]) {
  if (paletteTags.length === 0) return null;
  if (paletteTags.length === 1) return `Dominant ${paletteTags[0]} tones`;
  return `Palette cues: ${paletteTags.join(", ")}`;
}

export function buildArtworkSemanticText(args: {
  title: string;
  artistName?: string | null;
  description?: string | null;
  medium?: string | null;
  dateText?: string | null;
  sourceTags?: string[];
  semanticTags: SemanticTagBundle;
}) {
  return [
    args.title,
    args.artistName ?? "",
    args.description ?? "",
    args.medium ?? "",
    args.dateText ?? "",
    args.sourceTags?.join(" ") ?? "",
    args.semanticTags.allTags.join(" ")
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildSubmissionSemanticText(args: {
  note: string;
  summary: string;
  imageUrl?: string;
  semanticTags: SemanticTagBundle;
}) {
  return [args.note, args.summary, args.semanticTags.allTags.join(" "), args.imageUrl ?? ""].filter(Boolean).join(" ");
}

export function scoreTagOverlap(queryTags: string[], candidateTags: string[]) {
  if (queryTags.length === 0 || candidateTags.length === 0) return 0;
  const query = new Set(queryTags);
  const candidate = new Set(candidateTags);
  let hits = 0;
  for (const tag of query) {
    if (candidate.has(tag)) hits += 1;
  }
  return hits / query.size;
}
