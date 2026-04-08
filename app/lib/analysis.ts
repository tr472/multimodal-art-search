import { appConfig } from "@/lib/config";
import { AgentError } from "@/lib/errors";
import { blendEmbeddings, textToCompatibleEmbedding, textToEmbedding } from "@/lib/embeddings";
import { buildSubmissionSemanticText, extractSemanticTags, summarizePaletteTags } from "@/lib/semanticTags";
import { buildVisualEmbedding, describeArtworkImage, resolveImageInput, type VisualDescription } from "@/lib/visualEmbeddings";
import type { AnalysisResult, Embedding } from "@/types/retrieval";

export type AnalysisAgentInput = {
  imageBuffer: Buffer;
  note: string;
  mimeType: string;
};

export type AnalysisAgentOutput = {
  semanticSummary: string;
  visualDescriptor: VisualDescription;
  embedding: Embedding;
  tags: string[];
  style: string | null;
  subjects: string[];
  paletteNotes: string | null;
  ocrText: string | null;
  confidence: number;
};

function parseDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new AgentError("Invalid data URL payload for analysis input.", { code: "ANALYSIS_DATA_URL_INVALID" });
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

function buildFallbackDescriptor(note: string): VisualDescription {
  const semanticTags = extractSemanticTags(note);
  const style = semanticTags.styleTags[0] ?? null;
  const subjects = Array.from(new Set([...semanticTags.subjectTags, ...semanticTags.categoryTags, ...semanticTags.paletteTags])).slice(0, 6);
  const subjectPhrase =
    subjects.length > 0
      ? `The painting appears to center ${subjects
          .slice(0, 3)
          .map((item) => item.replaceAll("_", " "))
          .join(", ")}`
      : "The painting suggests a representational scene";
  const stylePhrase = style ? ` with a ${style.replaceAll("-", " ")} direction` : "";

  return {
    summary: `${subjectPhrase}${stylePhrase}.`,
    styleHints: style ? [style] : [],
    subjects,
    palette: semanticTags.paletteTags,
    brushwork: null,
    composition: null,
    visibleText: null
  };
}

export async function runAnalysisAgent(input: AnalysisAgentInput): Promise<AnalysisAgentOutput> {
  const dataUrl = `data:${input.mimeType};base64,${input.imageBuffer.toString("base64")}`;
  const fallbackDescriptor = buildFallbackDescriptor(input.note);
  const described = (await describeArtworkImage({ imageUrl: dataUrl, contextText: input.note })) ?? fallbackDescriptor;
  const semanticSummary = described.summary || fallbackDescriptor.summary;
  const style = described.styleHints[0] ?? fallbackDescriptor.styleHints[0] ?? null;
  const subjects = described.subjects.length > 0 ? described.subjects.slice(0, 8) : fallbackDescriptor.subjects.slice(0, 8);
  const paletteNotes = described.palette.length > 0 ? `Palette cues: ${described.palette.join(", ")}` : summarizePaletteTags(fallbackDescriptor.palette);
  const ocrText = described.visibleText ?? null;
  const semanticTags = extractSemanticTags(input.note, semanticSummary, style ?? "", paletteNotes ?? "", subjects.join(" "), ocrText ?? "");
  const semanticText = buildSubmissionSemanticText({
    note: input.note,
    summary: [semanticSummary, style ?? "", subjects.join(" "), paletteNotes ?? "", ocrText ?? ""].filter(Boolean).join(" "),
    imageUrl: "in-memory-image",
    semanticTags
  });
  const targetDimension = appConfig.openai.apiKey ? undefined : appConfig.embeddings.deterministicDimension;

  const [semanticEmbedding, visualEmbedding] = await Promise.all([
    appConfig.openai.apiKey ? textToEmbedding(semanticText) : textToCompatibleEmbedding(semanticText, targetDimension),
    buildVisualEmbedding({
      imageUrl: dataUrl,
      contextText: [input.note, semanticSummary, style ?? "", subjects.join(" "), paletteNotes ?? "", ocrText ?? ""].filter(Boolean).join(" "),
      targetDimension,
      descriptor: described
    }).then((result) => result.embedding)
  ]);

  return {
    semanticSummary,
    visualDescriptor: described,
    embedding: blendEmbeddings([semanticEmbedding, visualEmbedding]),
    tags: semanticTags.allTags.slice(0, 24),
    style,
    subjects,
    paletteNotes,
    ocrText,
    confidence: described === fallbackDescriptor ? 0.62 : 0.78
  };
}

export async function analyzeSubmission(note: string, imageUrl: string): Promise<AnalysisResult> {
  const resolvedImage = await resolveImageInput(imageUrl);
  const { buffer, mimeType } = parseDataUrl(resolvedImage);
  const analysis = await runAnalysisAgent({ imageBuffer: buffer, note, mimeType });

  return {
    summary: analysis.semanticSummary,
    style: analysis.style,
    subjects: analysis.subjects,
    paletteNotes: analysis.paletteNotes,
    ocrText: analysis.ocrText,
    confidence: analysis.confidence,
    embedding: analysis.embedding
  };
}
