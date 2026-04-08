import Image from "next/image";
import Link from "next/link";
import { getOrCreateDemoUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const FEATURED_ARTWORK_IDS = ["436785", "438821", "11050", "929079"] as const;

export default async function HomePage() {
  const demoUser = await getOrCreateDemoUser();

  const [artworkCount, threadCount, featuredArtworks, recentThreads, recentUploads, savedGalleryMentions] = await Promise.all([
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
        userId: demoUser.id,
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
    }),
    prisma.submission.findMany({
      where: {
        userId: demoUser.id,
        chatThread: {
          discardedAt: null
        }
      },
      orderBy: { createdAt: "desc" },
      take: 6
    }),
    prisma.threadArtworkMention.findMany({
      where: {
        thread: {
          userId: demoUser.id,
          discardedAt: null
        }
      },
      orderBy: { createdAt: "desc" },
      take: 24,
      include: {
        artwork: {
          include: {
            artist: true,
            institution: true
          }
        }
      }
    })
  ]);

  const featuredByExternalId = new Map(featuredArtworks.map((artwork) => [artwork.externalId, artwork]));
  const leadArtwork = featuredByExternalId.get("436785") ?? featuredArtworks[0] ?? null;
  const uniqueSavedArtworks = Array.from(
    new Map(savedGalleryMentions.map((mention) => [mention.artworkId, mention.artwork])).values()
  );
  const savedGalleryItems = [
    ...recentUploads.map((submission) => ({
      key: `upload-${submission.id}`,
      title: submission.rawNote?.slice(0, 60) || "Uploaded artwork",
      subtitle: "Uploaded reference",
      imageUrl: submission.imageUrl,
      href: `/submission/${submission.id}`,
      detail: "A user-uploaded work that started or extended a conversation thread."
    })),
    ...uniqueSavedArtworks.map((artwork) => ({
        key: `saved-${artwork.id}`,
        title: artwork.title,
        subtitle: artwork.artist?.name ?? "Saved work",
        imageUrl: artwork.imageUrl,
        href: artwork.sourceUrl ?? "/",
        detail: "A work explicitly saved to the gallery from a live thread."
      }))
  ].slice(0, 12);

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="card border-0 bg-[radial-gradient(circle_at_top_left,#f7ead8_0%,#f3f4ef_46%,#ffffff_100%)] p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-800/80">Visual Companion</p>
          <h1 className="mt-4 max-w-3xl font-[Iowan_Old_Style,Palatino_Linotype,Book_Antiqua,Georgia,serif] text-4xl leading-tight text-slate-950 md:text-5xl">
            From one painting image to a grounded conversation you can return to.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-700">
            Upload one artwork, describe what feels important, and let the companion search for visually and historically related works without losing the thread.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/submit"
              className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Start a New Thread
            </Link>
            <Link
              href="#how-to-try"
              className="rounded-full border border-slate-300 bg-white/80 px-5 py-3 text-sm font-medium text-slate-800 transition hover:bg-white"
            >
              How to Try It
            </Link>
            <Link
              href="/how-it-works"
              className="rounded-full border border-slate-300 bg-white/80 px-5 py-3 text-sm font-medium text-slate-800 transition hover:bg-white"
            >
              How It Works
            </Link>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Indexed Corpus</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{artworkCount}</p>
              <p className="mt-1 text-sm text-slate-600">a curated painting set chosen to support rich first conversations</p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Recent Threads</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{threadCount}</p>
              <p className="mt-1 text-sm text-slate-600">saved or active conversations that can be reopened</p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Core Value</p>
              <p className="mt-2 text-base font-semibold text-slate-900">Explainable multimodal retrieval</p>
              <p className="mt-1 text-sm text-slate-600">with thread memory, provenance, and gallery persistence</p>
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
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Representative Painting</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">{leadArtwork?.title ?? "Featured artwork"}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {leadArtwork?.artist?.name ?? "Unknown artist"}
                {leadArtwork?.institution?.name ? ` · ${leadArtwork.institution.name}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
              “The harbor light feels loose and atmospheric, but the brushwork is more controlled than I expected. Help me place this painting and show me related works.”
            </div>
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">Sample conversation</p>
                <p className="mt-2 text-sm text-slate-600">
                  You: “Tell me more about the era, the handling of light, and painters who work in this direction.”
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Companion: “I would start with late-19th-century painting, keep the attribution provisional, and compare how nearby painters treat atmosphere, water, and broken color before naming a maker.”
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">What the demo is tuned for</p>
                <p className="mt-2 text-sm text-slate-600">
                  This demo starts with a curated painting set, so questions about brushwork, palette, era, and artist direction have stronger support from the first turn.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section id="how-to-try" className="card border-slate-200/80 bg-white/90">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">How to Try It</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">A clean way to walk through the demo</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">3 quick steps</span>
        </div>
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {[
            {
              title: "1. Start with one image",
              detail: "Upload a painting, add a short note about brushwork, palette, subject, or mood, and let the companion establish a grounded first reading."
            },
            {
              title: "2. Push the thread",
              detail: "Ask for era, artist, or visual comparisons. If the first direction is off, reject it and ask for a new one or explicitly query The Met."
            },
            {
              title: "3. Save what matters",
              detail: "Keep the final thread, gallery, and reasoning trail together so the conversation becomes something reusable rather than disposable."
            }
          ].map((step) => (
            <article key={step.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-950">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card border-slate-200/80">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recent Threads</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Open a recent conversation</h2>
          </div>
          <Link href="/submit" className="text-sm text-blue-700 underline">
            Start a new one
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {recentThreads.length > 0 ? (
            recentThreads.map((thread) => (
              <Link key={thread.id} href={`/submission/${thread.submissionId}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-950">{thread.title ?? "Untitled thread"}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {thread.summaryText ?? thread.submission.rawNote ?? "Open this thread to inspect the stored conversation and gallery."}
                </p>
                {thread.artworkMentions.length > 0 && (
                  <div className="mt-4 flex gap-2">
                    {thread.artworkMentions.map((mention) => (
                      <div key={mention.artwork.id} className="h-14 w-14 overflow-hidden rounded-md bg-slate-100">
                        {mention.artwork.imageUrl ? (
                          <Image src={mention.artwork.imageUrl} alt={mention.artwork.title} width={112} height={112} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </Link>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600 md:col-span-2 xl:col-span-4">
              No live threads yet. Start a new thread from one painting image and it will appear here.
            </div>
          )}
        </div>
      </section>

      <section className="card border-slate-200/80">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Saved Gallery</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Uploaded references and liked works</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              This gallery now reflects the user’s own uploads and the works they marked as visually close during the conversation.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{savedGalleryItems.length} items</span>
        </div>

        {savedGalleryItems.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {savedGalleryItems.map((item) => (
              <article key={item.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="aspect-[4/3] bg-slate-100">
                  {item.imageUrl ? (
                    item.href.startsWith("/submission/") ? (
                      <Link href={item.href}>
                        <Image src={item.imageUrl} alt={item.title} width={900} height={675} className="h-full w-full object-cover" />
                      </Link>
                    ) : (
                      <a href={item.href} target="_blank" rel="noreferrer">
                        <Image src={item.imageUrl} alt={item.title} width={900} height={675} className="h-full w-full object-cover" />
                      </a>
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-500">Image unavailable</div>
                  )}
                </div>
                <div className="space-y-2 p-4 text-sm">
                  <p className="font-semibold text-slate-950">{item.title}</p>
                  <p className="text-slate-600">{item.subtitle}</p>
                  <p className="leading-6 text-slate-700">{item.detail}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
            Upload a work or give a thumbs-up to strong matches and they will collect here.
          </div>
        )}
      </section>
    </div>
  );
}
