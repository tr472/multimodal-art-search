import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const FEATURED_ARTWORK_IDS = ["544453", "545108", "544320", "544740"] as const;

const sampleTranscript = [
  {
    role: "Visitor",
    content: "I saw this head at the Met and kept thinking about the calm face and the crisp carved planes. Can you place it without overclaiming?"
  },
  {
    role: "Companion",
    content:
      "The strongest supported move is toward New Kingdom Egyptian sculpture: the frontal calm, idealized features, and surviving paint traces all point that way. I would treat the exact identity carefully unless we also have label or inscription evidence."
  },
  {
    role: "Visitor",
    content: "Show me more where the monumental calm and carved structure matter more than exact identity."
  },
  {
    role: "Companion",
    content:
      "That keeps the thread in evidence-backed Egyptian sculpture rather than broad 'ancient art'. I would stay with works that preserve similar facial stillness, temple-scale presence, and stone handling."
  }
] as const;

const sampleReasons = [
  "Preserves the same calm frontal head structure and carved facial geometry.",
  "Keeps the conversation anchored in New Kingdom funerary and commemorative context.",
  "Broadens from a single head to a fuller sculptural presence without leaving the same visual world."
] as const;

const overviewSteps = [
  {
    title: "Ingest + normalize",
    detail: "Museum records are mapped into a shared schema with provenance, metadata, and stable source links."
  },
  {
    title: "Generate signals",
    detail: "The app builds semantic and visual representations from both the indexed corpus and the uploaded artwork."
  },
  {
    title: "Retrieve + rerank",
    detail: "Candidate search combines vector lookup with semantic, visual, lexical, and preference-aware reranking."
  },
  {
    title: "Ground the answer",
    detail: "The assistant responds from retrieved evidence and keeps uncertainty, provenance, and supporting context visible."
  },
  {
    title: "Preserve the thread",
    detail: "The final conversation, surfaced works, and saved gallery stay attached to a reusable thread."
  }
] as const;

export default async function HomePage() {
  const [artworkCount, threadCount, featuredArtworks, recentThreads] = await Promise.all([
    prisma.artwork.count(),
    prisma.chatThread.count({
      where: {
        discardedAt: null
      }
    }),
    prisma.artwork.findMany({
      where: {
        externalId: {
          in: [...FEATURED_ARTWORK_IDS]
        }
      },
      include: {
        artist: true,
        institution: true
      }
    }),
    prisma.chatThread.findMany({
      where: {
        discardedAt: null
      },
      orderBy: { updatedAt: "desc" },
      take: 4,
      include: {
        submission: true,
        artworkMentions: {
          include: {
            artwork: true
          },
          orderBy: { createdAt: "asc" },
          take: 3
        }
      }
    })
  ]);

  const featuredByExternalId = new Map(featuredArtworks.map((artwork) => [artwork.externalId, artwork]));
  const leadArtwork = featuredByExternalId.get("544453") ?? featuredArtworks[0] ?? null;
  const sampleGallery = ["545108", "544320", "544740"]
    .map((externalId) => featuredByExternalId.get(externalId))
    .filter((artwork): artwork is NonNullable<typeof leadArtwork> => Boolean(artwork));

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="card border-0 bg-[radial-gradient(circle_at_top_left,#f7ead8_0%,#f3f4ef_46%,#ffffff_100%)] p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-800/80">Visual Companion</p>
          <h1 className="mt-4 max-w-3xl font-[Iowan_Old_Style,Palatino_Linotype,Book_Antiqua,Georgia,serif] text-4xl leading-tight text-slate-950 md:text-5xl">
            From one artwork image to a conversation that stays grounded.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-700">
            This is built for people who want to look closely, not just search broadly. Upload one artwork, get
            explainable visual neighbors from an indexed corpus, keep the conversation focused on what actually feels
            important, and save the thread with its gallery and provenance intact.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/submit"
              className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Start a New Thread
            </Link>
            <Link
              href="#representative-thread"
              className="rounded-full border border-slate-300 bg-white/80 px-5 py-3 text-sm font-medium text-slate-800 transition hover:bg-white"
            >
              See a Sample Conversation
            </Link>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Indexed Corpus</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{artworkCount}</p>
              <p className="mt-1 text-sm text-slate-600">artworks normalized, embedded, and provenance-linked</p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Review Threads</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{threadCount}</p>
              <p className="mt-1 text-sm text-slate-600">saved or active conversations that can be reopened</p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Core Value</p>
              <p className="mt-2 text-base font-semibold text-slate-900">Explainable multimodal retrieval</p>
              <p className="mt-1 text-sm text-slate-600">with taste steering, provenance, and gallery memory</p>
            </div>
          </div>
        </div>

        <aside className="card overflow-hidden border-slate-200/80 bg-white p-0 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          {leadArtwork?.imageUrl && (
            <div className="aspect-[4/3] bg-slate-100">
              <Image src={leadArtwork.imageUrl} alt={leadArtwork.title} width={1200} height={900} className="h-full w-full object-cover" />
            </div>
          )}
          <div className="space-y-4 p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Representative Upload</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">{leadArtwork?.title ?? "Featured artwork"}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {leadArtwork?.artist?.name ?? "Unknown artist"}
                {leadArtwork?.institution?.name ? ` · ${leadArtwork.institution.name}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
              “I saw this at the Met and kept thinking about the carved stillness in the face. Help me place it, but stay grounded.”
            </div>
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">Why this demo feels different</p>
                <p className="mt-2 text-sm text-slate-600">
                  The assistant preserves what was actually discussed: the image, the reasoning trail, the suggested works,
                  and the final saved gallery.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">What makes the conversation useful</p>
                <p className="mt-2 text-sm text-slate-600">
                  The thread starts from visual evidence, supports follow-up questions, and stores something you can come
                  back to rather than a disposable chat reply.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="card border-slate-200/80 bg-white/90">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Quick Intro</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">How the system works in one pass</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">System at a glance</span>
        </div>
        <div className="mt-6 grid gap-3 lg:grid-cols-5">
          {overviewSteps.map((step, index) => (
            <article key={step.title} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Step {index + 1}</p>
              <h3 className="mt-2 text-sm font-semibold text-slate-950">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.detail}</p>
              {index < overviewSteps.length - 1 && (
                <span className="pointer-events-none absolute -right-2 top-1/2 hidden -translate-y-1/2 text-slate-300 lg:block">
                  →
                </span>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Visual-first retrieval",
            detail: "The system blends upload analysis, stored image embeddings, and normalized metadata instead of depending on keyword matches alone."
          },
          {
            title: "Explainable recommendations",
            detail: "Every surfaced work comes with evidence, uncertainty language, provenance, and a small rationale you can actually inspect."
          },
          {
            title: "Thread memory, not one-off answers",
            detail: "The user can save a conversation, reopen it later, compare images, and keep a gallery of the works that actually mattered."
          }
        ].map((item) => (
          <article key={item.title} className="card border-slate-200/80">
            <p className="text-sm font-semibold text-slate-950">{item.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
          </article>
        ))}
      </section>

      <section id="representative-thread" className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="card border-slate-200/80">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Sample Conversation</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">A museum visit turned into a reusable thread</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Example walkthrough</span>
          </div>
          <div className="mt-6 space-y-3">
            {sampleTranscript.map((message) => (
              <div
                key={`${message.role}-${message.content.slice(0, 24)}`}
                className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                  message.role === "Companion" ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-slate-800"
                }`}
              >
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{message.role}</p>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-900">Why this matters</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The thread demonstrates identification restraint, evidence-backed similarity, and a path from first upload
              to saved gallery. That is the core product behavior this MVP is trying to prove.
            </p>
          </div>
        </article>

        <article className="card border-slate-200/80">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Saved Gallery</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">What the thread preserves after the conversation</h2>
            </div>
            <Link href="/submit" className="text-sm font-medium text-blue-700 underline">
              Try your own upload
            </Link>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {sampleGallery.map((artwork, index) => (
              <article key={artwork.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {artwork.imageUrl && (
                  <div className="aspect-[4/3] bg-slate-100">
                    <Image src={artwork.imageUrl} alt={artwork.title} width={900} height={675} className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="space-y-2 p-4">
                  <p className="text-sm font-semibold text-slate-950">{artwork.title}</p>
                  <p className="text-sm text-slate-600">{artwork.artist?.name ?? artwork.institution?.name ?? "Indexed corpus record"}</p>
                  <p className="text-sm leading-6 text-slate-700">{sampleReasons[index] ?? "Preserved because it stayed relevant through the conversation."}</p>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="card border-slate-200/80">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">How to Try It</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">A simple path through the product</h2>
          </div>
          <Link href="/submit" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800">
            Go to upload flow
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            "Open the sample conversation above to see how the thread stays close to the artwork instead of drifting into generic art talk.",
            "Go to the upload flow, add an artwork image, and watch the first grounded response plus evidence-backed matches appear in the same thread.",
            "Save the thread and inspect the preserved gallery, conversation history, and provenance details to see what the system actually retains."
          ].map((step, index) => (
            <div key={step} className="rounded-2xl bg-slate-100 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Step {index + 1}</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card border-slate-200/80">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recent Threads</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Recent history in this environment</h2>
          </div>
          <Link href="/submit" className="text-sm font-medium text-blue-700 underline">
            Start a fresh thread
          </Link>
        </div>
        {recentThreads.length === 0 ? (
          <div className="mt-5 rounded-2xl bg-slate-100 p-5 text-sm leading-6 text-slate-600">
            No live threads yet. The sample conversation above shows the intended structure; the upload flow is ready
            whenever you want to create the first real thread in this environment.
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {recentThreads.map((thread) => (
              <Link
                key={thread.id}
                href={`/submission/${thread.submissionId}`}
                className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"
              >
                <p className="text-lg font-semibold text-slate-950">{thread.title ?? "Untitled thread"}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {thread.summaryText ?? thread.submission.rawNote ?? "Open this thread to inspect the stored conversation and gallery."}
                </p>
                {thread.artworkMentions.length > 0 && (
                  <div className="mt-4 flex gap-2">
                    {thread.artworkMentions.map((mention) => (
                      <div key={mention.artwork.id} className="h-16 w-16 overflow-hidden rounded-xl bg-slate-100">
                        {mention.artwork.imageUrl ? (
                          <Image
                            src={mention.artwork.imageUrl}
                            alt={mention.artwork.title}
                            width={128}
                            height={128}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
