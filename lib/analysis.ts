import { blendEmbeddings, textToCompatibleEmbedding, textToEmbedding } from "@/lib/embeddings";
import { buildSubmissionSemanticText, extractSemanticTags, summarizePaletteTags } from "@/lib/semanticTags";
import { buildVisualEmbedding, describeArtworkImage } from "@/lib/visualEmbeddings";
import type { AnalysisResult } from "@/types/retrieval";

function buildFallbackAnalysis(note: string, imageUrl: string): Omit<AnalysisResult, "embedding"> {
  const semanticTags = extractSemanticTags(note);
  const style = semanticTags.styleTags[0] ?? null;
  const subjects = Array.from(new Set([...semanticTags.subjectTags, ...semanticTags.categoryTags, ...semanticTags.paletteTags])).slice(0, 6);
  const summary =
    note.trim().length > 0
      ? `You focused on ${note.slice(0, 80)}${note.length > 80 ? "..." : ""}`
      : "You submitted an artwork image without additional notes.";

  return {
    summary,
    style,
    subjects,
    paletteNotes: summarizePaletteTags(semanticTags.paletteTags),
    ocrText: null,
    confidence: 0.62
  };
}

async function analyzeWithVision(note: string, imageUrl: string): Promise<Omit<AnalysisResult, "embedding"> | null> {
  try {
    const described = await describeArtworkImage({
      imageUrl,
      contextText: note
    });
    if (!described) {
      return null;
    }

    return {
      summary: described.summary,
      style: described.styleHints[0] ?? null,
      subjects: described.subjects.slice(0, 8),
      paletteNotes: described.palette.length > 0 ? `Palette cues: ${described.palette.join(", ")}` : null,
      ocrText: described.visibleText ?? null,
      confidence: 0.78
    };
  } catch (error) {
    console.error("OpenAI vision analysis failed", error);
    return null;
  }
}

export async function analyzeSubmission(note: string, imageUrl: string): Promise<AnalysisResult> {
  const fallback = buildFallbackAnalysis(note, imageUrl);
  const vision = await analyzeWithVision(note, imageUrl);
  const summary = vision?.summary ?? fallback.summary;
  const style = vision?.style ?? fallback.style;
  const subjects = vision?.subjects?.length ? vision.subjects : fallback.subjects;
  const paletteNotes = vision?.paletteNotes ?? fallback.paletteNotes;
  const ocrText = vision?.ocrText ?? fallback.ocrText;
  const semanticTags = extractSemanticTags(note, summary, style ?? "", paletteNotes ?? "", subjects.join(" "), ocrText ?? "");
  const semanticText = buildSubmissionSemanticText({
    note,
    summary: [summary, style ?? "", subjects.join(" "), paletteNotes ?? "", ocrText ?? ""].filter(Boolean).join(" "),
    imageUrl,
    semanticTags
  });

  const targetDimension = process.env.OPENAI_API_KEY ? undefined : 16;
  const [semanticEmbedding, visualEmbedding] = await Promise.all([
    process.env.OPENAI_API_KEY
      ? textToEmbedding(semanticText)
      : textToCompatibleEmbedding(semanticText, targetDimension),
    buildVisualEmbedding({
      imageUrl,
      contextText: [note, summary, style ?? "", subjects.join(" "), paletteNotes ?? "", ocrText ?? ""].filter(Boolean).join(" "),
      targetDimension
    }).then((result) => result.embedding)
  ]);

  return {
    summary,
    style,
    subjects,
    paletteNotes,
    ocrText,
    confidence: vision?.confidence ?? fallback.confidence,
    embedding: blendEmbeddings([semanticEmbedding, visualEmbedding])
  };
}
