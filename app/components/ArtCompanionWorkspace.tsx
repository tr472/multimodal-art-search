"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createSubmissionAction } from "@/app/actions";
import type { SavedChatPreview, ThreadWorkspace, WorkspaceImage } from "@/types/chat";

const initialActionState = { message: "", submissionId: "", threadId: "", workspace: null as ThreadWorkspace | null };
const MAX_UPLOAD_SIZE_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB ?? "12");

function ThumbUpIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden="true">
      <path d="M8 9V4.8c0-.9.2-1.7.7-2.4L9.9 1l1.6 1.4c.5.4.8 1 .8 1.7V7h3.1c1.1 0 1.9 1 1.7 2l-1 5.2c-.1.8-.8 1.3-1.6 1.3H8m0-6H5.7c-.9 0-1.7.8-1.7 1.7v4.6c0 .9.8 1.7 1.7 1.7H8V9Z" />
    </svg>
  );
}

function EvidenceDetails({
  summary,
  children
}: {
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-slate-700">{summary}</summary>
      <div className="mt-2 space-y-2 text-slate-600">{children}</div>
    </details>
  );
}

function ImageLightbox({
  image,
  onClose
}: {
  image: WorkspaceImage | null;
  onClose: () => void;
}) {
  if (!image) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6" onClick={onClose}>
      <div className="max-w-4xl" onClick={(event) => event.stopPropagation()}>
        <img src={image.imageUrl} alt={image.role} className="max-h-[80vh] w-auto rounded-xl object-contain" />
        <div className="mt-3 flex items-center justify-between text-sm text-white">
          <div>
            <p className="font-medium">{image.role.replaceAll("_", " ").toLowerCase()}</p>
            {image.note && <p className="text-slate-200">{image.note}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded border border-white/30 px-3 py-1">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SavedChatList({
  savedChats
}: {
  savedChats: SavedChatPreview[];
}) {
  if (savedChats.length === 0) return null;

  return (
    <section className="card">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Saved threads</h2>
          <p className="mt-1 text-sm text-slate-600">Reopen a prior thread to inspect the preserved gallery, summary, and reasoning trail.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{savedChats.length} saved</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {savedChats.map((chat) => (
          <Link key={chat.threadId} href={`/submission/${chat.submissionId}`} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="font-semibold">{chat.title}</p>
            <p className="mt-1 text-sm text-slate-600">{chat.summaryText}</p>
            {chat.artworks.length > 0 && (
              <div className="mt-3 flex gap-2">
                {chat.artworks.map((artwork) => (
                  <div key={artwork.id} className="h-14 w-14 overflow-hidden rounded-md bg-slate-100">
                    {artwork.imageUrl ? (
                      <Image src={artwork.imageUrl} alt={artwork.title} width={112} height={112} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

function CurrentSuggestions({ workspace }: { workspace: ThreadWorkspace }) {
  if (workspace.artworks.length === 0 && workspace.artists.length === 0 && !workspace.statusBanner) return null;

  const bannerToneClasses =
    workspace.statusBanner?.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : workspace.statusBanner?.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : workspace.statusBanner?.tone === "info"
          ? "border-sky-200 bg-sky-50 text-sky-900"
          : "border-slate-200 bg-slate-50 text-slate-800";

  return (
    <section className="card">
      <div>
        <h2 className="text-lg font-semibold">{workspace.isSaved ? "Saved gallery" : "Thread status"}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {workspace.isSaved
            ? "These are the latest works and artists preserved with the saved conversation."
            : "The conversation below carries the artworks and artists alongside each assistant response, so you can follow how the thread evolves without jumping around the page."}
        </p>
      </div>

      {workspace.statusBanner && !workspace.isSaved && (
        <div className={`mt-4 rounded-2xl border px-4 py-3 ${bannerToneClasses}`}>
          <p className="text-sm font-semibold">{workspace.statusBanner.label}</p>
          <p className="mt-1 text-sm leading-6">{workspace.statusBanner.detail}</p>
        </div>
      )}

      {workspace.isSaved && workspace.artworks.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {workspace.artworks.map((artwork) => (
            <article key={artwork.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="aspect-[4/3] bg-slate-100">
                {artwork.imageUrl ? (
                  <Image src={artwork.imageUrl} alt={artwork.title} width={900} height={675} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">Image unavailable</div>
                )}
              </div>
              <div className="space-y-2 p-3 text-sm">
                <p className="font-semibold">{artwork.title}</p>
                <p className="text-slate-600">{artwork.artistName ?? "Unknown artist"}</p>
                <p>{artwork.reason}</p>
                <EvidenceDetails summary={workspace.isSaved ? "Saved source details" : "Why this is currently shown"}>
                  <p>{artwork.evidenceSummary}</p>
                  <p>{artwork.uncertainty}</p>
                  {artwork.provenanceLabel && <p>Provenance: {artwork.provenanceLabel}</p>}
                  <p>Institution: {artwork.sourceInstitution ?? "Unknown"}</p>
                  {artwork.sourceUrl && (
                    <a href={artwork.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                      Open source URL
                    </a>
                  )}
                </EvidenceDetails>
              </div>
            </article>
          ))}
        </div>
      )}

      {workspace.isSaved && workspace.artists.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {workspace.artists.map((artist) => (
            <article key={artist.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="font-semibold">{artist.name}</p>
              {artist.bio && <p className="mt-1 text-slate-600">{artist.bio}</p>}
              <p className="mt-2">{artist.reason}</p>
              <div className="mt-3">
                <EvidenceDetails summary={workspace.isSaved ? "Saved source details" : "Why this artist is currently shown"}>
                  <p>{artist.evidenceSummary}</p>
                  <p>{artist.uncertainty}</p>
                  {artist.provenanceLabel && <p>Source: {artist.provenanceLabel}</p>}
                </EvidenceDetails>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ChatHistory({
  workspace,
  onToggleGalleryArtwork,
  onOpenImage,
  savedArtworkIds,
  feedbackPending
}: {
  workspace: ThreadWorkspace;
  onToggleGalleryArtwork?: (artworkId: string, signal: "up" | "down") => void;
  onOpenImage?: (image: WorkspaceImage) => void;
  savedArtworkIds: Set<string>;
  feedbackPending?: boolean;
}) {
  const latestAssistantId = [...workspace.messages].reverse().find((message) => message.role === "ASSISTANT")?.id;

  return (
    <div className="space-y-3">
      {workspace.messages.map((entry) => (
        <article key={entry.id} className={`rounded-xl p-4 text-sm ${entry.role === "ASSISTANT" ? "bg-slate-100" : "bg-blue-50"}`}>
          <p className="mb-1 font-medium">{entry.role === "ASSISTANT" ? "Companion" : "You"}</p>
          <p className="whitespace-pre-wrap">{entry.content}</p>
          {entry.attachment && (
            <button
              type="button"
              onClick={() =>
                onOpenImage?.({
                  id: `${entry.id}-attachment`,
                  imageUrl: entry.attachment!.imageUrl,
                  role: entry.attachment!.role,
                  note: entry.attachment!.note
                })
              }
              className="mt-3 w-full max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              <div className="aspect-[4/3] bg-slate-100">
                <Image src={entry.attachment.imageUrl} alt="Attached reference" width={900} height={675} className="h-full w-full object-cover" />
              </div>
              <div className="p-2 text-left text-xs text-slate-600">
                Added image · {entry.attachment.role.replaceAll("_", " ").toLowerCase()}
                {entry.attachment.note ? ` · ${entry.attachment.note}` : ""}
              </div>
            </button>
          )}

          {entry.role === "ASSISTANT" && ((entry.artworks?.length ?? 0) > 0 || (entry.artists?.length ?? 0) > 0) && (
            <div className="mt-4 space-y-4">
              {(entry.artworks?.length ?? 0) > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {entry.artworks?.map((artwork) => (
                    <article key={artwork.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <div className="aspect-[4/3] bg-slate-100">
                        {artwork.imageUrl ? (
                          <Image src={artwork.imageUrl} alt={artwork.title} width={900} height={675} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-slate-500">Image unavailable</div>
                        )}
                      </div>
                      <div className="space-y-2 p-3 text-sm">
                        <p className="font-semibold">{artwork.title}</p>
                        <p className="text-slate-600">{artwork.artistName ?? "Unknown artist"}</p>
                        <p>{artwork.reason}</p>
                        {!workspace.isSaved && entry.id === latestAssistantId && onToggleGalleryArtwork && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => onToggleGalleryArtwork(artwork.id, savedArtworkIds.has(artwork.id) ? "down" : "up")}
                              disabled={feedbackPending}
                              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 ${
                                savedArtworkIds.has(artwork.id)
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                  : "border-slate-300 text-slate-700"
                              } disabled:opacity-50`}
                            >
                              <ThumbUpIcon />
                              {savedArtworkIds.has(artwork.id) ? "Saved" : "Save to gallery"}
                            </button>
                            {savedArtworkIds.has(artwork.id) && (
                              <button
                                type="button"
                                onClick={() => onToggleGalleryArtwork(artwork.id, "down")}
                                disabled={feedbackPending}
                                className="inline-flex items-center rounded-full border border-rose-300 px-3 py-1.5 text-rose-700 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        )}
                        <EvidenceDetails summary="Source details">
                          <p>{artwork.evidenceSummary}</p>
                          <p>{artwork.uncertainty}</p>
                          {artwork.provenanceLabel && <p>Provenance: {artwork.provenanceLabel}</p>}
                          <p>Institution: {artwork.sourceInstitution ?? "Unknown"}</p>
                          {artwork.sourceUrl && (
                            <a href={artwork.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                              Open source URL
                            </a>
                          )}
                        </EvidenceDetails>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {(entry.artists?.length ?? 0) > 0 && (
                <div className="grid gap-3 md:grid-cols-2">
                  {entry.artists?.map((artist) => (
                    <article key={artist.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="font-semibold">{artist.name}</p>
                      {artist.bio && <p className="mt-1 text-slate-600">{artist.bio}</p>}
                      <p className="mt-2">{artist.reason}</p>
                      <EvidenceDetails summary="Source details">
                        <p>{artist.evidenceSummary}</p>
                        <p>{artist.uncertainty}</p>
                        {artist.provenanceLabel && <p>Source: {artist.provenanceLabel}</p>}
                      </EvidenceDetails>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {entry.role === "ASSISTANT" && entry.evidence && (
            <div className="mt-3 space-y-2">
              <EvidenceDetails summary="Why these?">
                <p>{entry.evidence.whyThese}</p>
                <p>{entry.evidence.uncertainty}</p>
              </EvidenceDetails>
              <EvidenceDetails summary="Functionality">
                <p>{entry.evidence.sourceSummary}</p>
                {entry.evidence.functionalitySummary && <p>{entry.evidence.functionalitySummary}</p>}
              </EvidenceDetails>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function PendingCompanionMessage({
  label,
  detail
}: {
  label: string;
  detail: string;
}) {
  return (
    <article className="rounded-xl bg-slate-100 p-4 text-sm">
      <p className="mb-1 font-medium">Companion</p>
      <p className="text-slate-700">{label}</p>
      <p className="mt-2 text-slate-600">{detail}</p>
    </article>
  );
}

function derivePendingMessage(message: string) {
  const lowered = message.toLowerCase();

  if (
    lowered.includes("query the met") ||
    lowered.includes("search the met") ||
    lowered.includes("look in the met") ||
    lowered.includes("pull from the met") ||
    lowered.includes("check the met") ||
    lowered.includes("browse the met") ||
    (lowered.includes("the met") && (lowered.includes("find") || lowered.includes("show") || lowered.includes("look")))
  ) {
    return {
      label: "I’m checking The Met for visual examples in this direction.",
      detail: "If I find strong image-backed matches, I’ll bring them into the current gallery. If not, I’ll say that plainly."
    };
  }

  if (lowered.includes("show me") || lowered.includes("similar") || lowered.includes("more like this")) {
    return {
      label: "I’m looking for stronger visual matches in this direction.",
      detail: "I’m rechecking the corpus and nearby paths to surface better-fitting works."
    };
  }

  return {
    label: "I’m looking closely at the image and refining the direction.",
    detail: "I’ll keep the response grounded while I check for the strongest supported next step."
  };
}

async function readJsonSafely<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function ArtCompanionWorkspace({
  initialWorkspace,
  initialSavedChats = []
}: {
  initialWorkspace?: ThreadWorkspace | null;
  initialSavedChats?: SavedChatPreview[];
}) {
  const [actionState, formAction, pendingStart] = useActionState(createSubmissionAction, initialActionState);
  const [workspace, setWorkspace] = useState<ThreadWorkspace | null>(initialWorkspace ?? null);
  const [savedChats, setSavedChats] = useState<SavedChatPreview[]>(initialWorkspace?.savedChats ?? initialSavedChats);
  const [message, setMessage] = useState("");
  const [messagePending, setMessagePending] = useState(false);
  const [imagePending, setImagePending] = useState(false);
  const [selectedRole, setSelectedRole] = useState<WorkspaceImage["role"]>("DETAIL");
  const [lightboxImage, setLightboxImage] = useState<WorkspaceImage | null>(null);
  const [savedHistoryOpen, setSavedHistoryOpen] = useState(initialWorkspace ? !initialWorkspace.isSaved : false);
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [pendingSubmissionPreview, setPendingSubmissionPreview] = useState<{ imageUrl: string; note: string } | null>(null);
  const [pendingCopy, setPendingCopy] = useState<{ label: string; detail: string } | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [galleryEditMode, setGalleryEditMode] = useState(false);
  const [selectedGalleryArtworkIds, setSelectedGalleryArtworkIds] = useState<string[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const submitImageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (actionState.workspace) {
      // Mirror the server action result into the interactive workspace state once a submission is created.
      setWorkspace(actionState.workspace);
      setSavedChats(actionState.workspace.savedChats);
      setSavedHistoryOpen(!actionState.workspace.isSaved);
      setPendingSubmissionPreview(null);
      setPendingCopy(null);
      setUiError(null);
      setGalleryEditMode(false);
      setSelectedGalleryArtworkIds([]);
    }
  }, [actionState.workspace]);

  const activeWorkspace = workspace ?? actionState.workspace;
  const originalImage = activeWorkspace?.images[0] ?? null;
  const visibleGalleryArtworks = useMemo(() => activeWorkspace?.galleryArtworks.slice(0, 12) ?? [], [activeWorkspace]);
  const savedArtworkIds = useMemo(() => new Set(activeWorkspace?.galleryArtworks.map((artwork) => artwork.id) ?? []), [activeWorkspace]);
  const referenceImages = useMemo(() => activeWorkspace?.images.slice(1) ?? [], [activeWorkspace]);
  const isLivePending = messagePending || imagePending || feedbackPending;

  useEffect(() => {
    return () => {
      if (pendingSubmissionPreview?.imageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(pendingSubmissionPreview.imageUrl);
      }
    };
  }, [pendingSubmissionPreview]);

  function startPendingSubmissionPreview() {
    const file = submitImageInputRef.current?.files?.[0];
    if (!file) return;

    const objectUrl = pendingSubmissionPreview?.imageUrl || URL.createObjectURL(file);
    setPendingSubmissionPreview((existing) => {
      if (existing?.imageUrl?.startsWith("blob:") && existing.imageUrl !== objectUrl) {
        URL.revokeObjectURL(existing.imageUrl);
      }
      return {
        imageUrl: objectUrl,
        note: draftNote.trim()
      };
    });
  }

  function updateSelectedSubmissionPreview(file: File | null) {
    setPendingSubmissionPreview((existing) => {
      if (!file) {
        if (existing?.imageUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(existing.imageUrl);
        }
        return null;
      }

      const objectUrl = URL.createObjectURL(file);
      if (existing?.imageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(existing.imageUrl);
      }

      return {
        imageUrl: objectUrl,
        note: draftNote.trim()
      };
    });
  }

  async function sendMessage() {
    if (!activeWorkspace || !message.trim() || messagePending) return;
    const outgoingMessage = message.trim();
    setMessagePending(true);
    setPendingCopy(derivePendingMessage(outgoingMessage));
    setUiError(null);
    const res = await fetch(`/api/chat/${activeWorkspace.threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: outgoingMessage })
    });
    const data = await readJsonSafely<ThreadWorkspace | { error?: string }>(res);
    if (res.ok) {
      if (data && "threadId" in data) {
        setWorkspace(data);
        setSavedChats(data.savedChats);
        setMessage("");
        setSavedHistoryOpen(true);
      } else {
        setUiError("The conversation updated, but the response could not be rendered cleanly. Please try again.");
      }
    } else {
      setUiError((data && "error" in data && data.error) || "I couldn't continue the conversation just now. Please try again.");
    }
    setMessagePending(false);
    setPendingCopy(null);
  }

  async function updateThread(action: "save" | "discard" | "rename" | "undo", title?: string) {
    if (!activeWorkspace) return;
    setUiError(null);
    const res = await fetch(`/api/chat/${activeWorkspace.threadId}/messages`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, title })
    });
    const data = await readJsonSafely<ThreadWorkspace | { discarded: true; savedChats: SavedChatPreview[]; error?: string }>(res);
    if (!res.ok || !data) {
      setUiError((data && "error" in data && data.error) || "I couldn't update this thread just now. Please try again.");
      return;
    }

    if (action === "discard") {
      if ("savedChats" in data) {
        setSavedChats(data.savedChats);
      }
      setWorkspace(null);
      setMessage("");
      setSavedHistoryOpen(false);
      setGalleryEditMode(false);
      setSelectedGalleryArtworkIds([]);
      return;
    }

    if ("threadId" in data) {
      setSavedChats(data.savedChats);
      setWorkspace(data);
      setSelectedGalleryArtworkIds((current) => current.filter((id) => data.galleryArtworks.some((artwork) => artwork.id === id)));
      if (action === "save") {
        setSavedHistoryOpen(false);
      }
    }
  }

  async function attachImage(file: File) {
    if (!activeWorkspace || imagePending) return;
    setImagePending(true);
    setPendingCopy({
      label: "I’m looking closely at the new image and folding it into the conversation.",
      detail: "I’ll use it to refine the current direction or widen the search if it adds something new."
    });
    setUiError(null);
    const formData = new FormData();
    formData.set("image", file);
    formData.set("role", selectedRole);
    formData.set("note", message.trim());

    const res = await fetch(`/api/chat/${activeWorkspace.threadId}/images`, {
      method: "POST",
      body: formData
    });
    const data = await readJsonSafely<ThreadWorkspace | { error?: string }>(res);
    if (res.ok) {
      if (data && "threadId" in data) {
        setWorkspace(data);
        setSavedChats(data.savedChats);
        setMessage("");
        setSavedHistoryOpen(true);
      } else {
        setUiError("The new image was added, but I couldn't render the updated thread cleanly.");
      }
    } else {
      setUiError((data && "error" in data && data.error) || "I couldn't use that image just now. Please try again.");
    }
    setImagePending(false);
    setPendingCopy(null);
  }

  async function toggleGalleryArtwork(artworkId: string, signal: "up" | "down") {
    if (!activeWorkspace || feedbackPending) return;
    setFeedbackPending(true);
    setPendingCopy({
      label: "One moment, saving",
      detail: "Updating your thread gallery."
    });
    setUiError(null);
    const feedbackRes = await fetch(`/api/chat/${activeWorkspace.threadId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal: signal === "up" ? "LIKE" : "DISLIKE", artworkId })
    });
    if (!feedbackRes.ok) {
      const error = await readJsonSafely<{ error?: string }>(feedbackRes);
      setUiError(error?.error || "I couldn't update the gallery just now. Please try again.");
    } else {
      const refreshed = await fetch(`/api/chat/${activeWorkspace.threadId}/messages`);
      const data = await readJsonSafely<ThreadWorkspace | { error?: string }>(refreshed);
      if (refreshed.ok && data && "threadId" in data) {
        setWorkspace(data);
        setSavedChats(data.savedChats);
        setSavedHistoryOpen(true);
        setSelectedGalleryArtworkIds((current) => current.filter((id) => data.galleryArtworks.some((artwork) => artwork.id === id)));
      } else {
        setUiError((data && "error" in data && data.error) || "I updated the gallery, but couldn't refresh the thread cleanly.");
      }
    }
    setFeedbackPending(false);
    setPendingCopy(null);
  }

  function toggleGallerySelection(artworkId: string) {
    setSelectedGalleryArtworkIds((current) =>
      current.includes(artworkId) ? current.filter((id) => id !== artworkId) : [...current, artworkId]
    );
  }

  async function removeSelectedGalleryArtworks() {
    if (!activeWorkspace || selectedGalleryArtworkIds.length === 0 || feedbackPending) return;
    setFeedbackPending(true);
    setPendingCopy({
      label: "One moment, saving",
      detail: "Updating your thread gallery."
    });
    setUiError(null);
    const feedbackRes = await fetch(`/api/chat/${activeWorkspace.threadId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal: "DISLIKE", artworkIds: selectedGalleryArtworkIds })
    });
    if (!feedbackRes.ok) {
      const error = await readJsonSafely<{ error?: string }>(feedbackRes);
      setUiError(error?.error || "I couldn't remove those gallery items just now. Please try again.");
      setFeedbackPending(false);
      setPendingCopy(null);
      return;
    }

    const refreshed = await fetch(`/api/chat/${activeWorkspace.threadId}/messages`);
    const data = await readJsonSafely<ThreadWorkspace | { error?: string }>(refreshed);
    if (refreshed.ok && data && "threadId" in data) {
      setWorkspace(data);
      setSavedChats(data.savedChats);
      setSelectedGalleryArtworkIds([]);
      setGalleryEditMode(false);
    } else {
      setUiError((data && "error" in data && data.error) || "I removed those items, but couldn't refresh the gallery cleanly.");
    }
    setFeedbackPending(false);
    setPendingCopy(null);
  }

  return (
    <div className="space-y-6">
      <SavedChatList savedChats={savedChats} />

      {!activeWorkspace && (
        <form
          action={formAction}
          onSubmit={() => startPendingSubmissionPreview()}
          className="card overflow-hidden border border-slate-200 bg-[linear-gradient(135deg,#f8f4eb_0%,#eef3f6_45%,#ffffff_100%)] p-0"
        >
          <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-5 p-8">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Visual Companion</p>
                <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-slate-900">Start with one artwork and let the conversation build around it.</h1>
                <p className="max-w-lg text-sm leading-6 text-slate-600">
                  Upload an image, name what you are responding to, and get a grounded first reading before the thread turns into a saved summary, gallery, and provenance-backed trail you can return to.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/70 bg-white/80 p-4 backdrop-blur">
                  <p className="text-sm font-medium text-slate-700">Best opening prompts</p>
                  <p className="mt-2 text-sm text-slate-600">Brushwork, palette, mood, era, subject, or a direct “what is this?” question all give the system something concrete to ground to.</p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/80 p-4 backdrop-blur">
                  <p className="text-sm font-medium text-slate-700">What gets preserved</p>
                  <p className="mt-2 text-sm text-slate-600">The evolving conversation, the strongest surfaced works, and the final saved gallery all stay attached to the thread.</p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200/80 bg-white/80 p-8 lg:border-l lg:border-t-0">
              {!pendingStart && (
                <div className="space-y-4">
                <div>
                  <label htmlFor="image" className="mb-1 block text-sm font-medium text-slate-700">
                    Artwork image
                  </label>
                  <input
                    ref={submitImageInputRef}
                    required
                    id="image"
                    name="image"
                    type="file"
                    accept="image/*"
                    onChange={(event) => updateSelectedSubmissionPreview(event.target.files?.[0] ?? null)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-3"
                  />
                  <p className="mt-1 text-xs text-slate-500">Upload JPG, PNG, or similar image files up to {MAX_UPLOAD_SIZE_MB} MB.</p>
                </div>

                {pendingSubmissionPreview?.imageUrl && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                    <img src={pendingSubmissionPreview.imageUrl} alt="Selected artwork preview" className="aspect-[4/3] w-full object-cover" />
                  </div>
                )}

                <div>
                  <label htmlFor="note" className="mb-1 block text-sm font-medium text-slate-700">
                    What are you noticing?
                  </label>
                  <textarea
                    id="note"
                    name="note"
                    placeholder="The loose flowers, the cool gray background, the softness of the paint..."
                    rows={5}
                    value={draftNote}
                    onChange={(event) => setDraftNote(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-3"
                  />
                </div>

                <button
                  type="submit"
                  disabled={pendingStart}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {pendingStart ? "Looking closely..." : "Begin conversation"}
                </button>

                {actionState.message && <p className="text-sm text-slate-700">{actionState.message}</p>}
                </div>
              )}

              {pendingStart && (
                <div className="space-y-4">
                  {pendingSubmissionPreview?.imageUrl && (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                      <img src={pendingSubmissionPreview.imageUrl} alt="Pending submission preview" className="aspect-[4/3] w-full object-cover" />
                    </div>
                  )}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Starting chat</p>
                    {pendingSubmissionPreview?.note && <p className="mt-2 text-sm text-slate-600">{pendingSubmissionPreview.note}</p>}
                    <div className="mt-4">
                      <PendingCompanionMessage
                        label="I’m looking closely at the image to start the conversation."
                        detail="I’m gathering a first read and matching works that fit what’s actually visible."
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>
      )}

      {activeWorkspace && (
        <>
          <section className="card space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {originalImage && (
                  <button
                    type="button"
                    onClick={() => setLightboxImage(originalImage)}
                    className="h-28 w-28 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                  >
                    <Image src={originalImage.imageUrl} alt="Original submission" width={224} height={224} className="h-full w-full object-cover" />
                  </button>
                )}
                <div>
                  <p className="text-sm font-medium text-slate-500">{activeWorkspace.isSaved ? "Saved companion thread" : "Art companion"}</p>
                  <h2 className="text-xl font-semibold">{activeWorkspace.threadTitle}</h2>
                  {activeWorkspace.submissionNote && <p className="mt-1 text-sm text-slate-600">{activeWorkspace.submissionNote}</p>}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-sm">
                <button type="button" onClick={() => updateThread("save")} className="rounded border border-slate-300 px-3 py-1.5">
                  ★ {activeWorkspace.isSaved ? "Saved" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextTitle = window.prompt("Rename chat", activeWorkspace.threadTitle);
                    if (nextTitle !== null) void updateThread("rename", nextTitle);
                  }}
                  className="rounded border border-slate-300 px-3 py-1.5"
                >
                  ✎ Rename
                </button>
                <button type="button" onClick={() => updateThread("undo")} className="rounded border border-slate-300 px-3 py-1.5">
                  ↶ Undo last turn
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Discard this entire thread and remove its saved history?")) {
                      void updateThread("discard");
                    }
                  }}
                  className="rounded border border-slate-300 px-3 py-1.5 text-rose-700"
                >
                  × Discard thread
                </button>
              </div>
            </div>

            {activeWorkspace.isSaved && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Summary</p>
                <p className="mt-2 text-sm text-slate-700">{activeWorkspace.submissionSummary}</p>
              </div>
            )}

            <CurrentSuggestions workspace={activeWorkspace} />

            {(!activeWorkspace.isSaved || savedHistoryOpen) && (
              <ChatHistory
                workspace={activeWorkspace}
                onToggleGalleryArtwork={toggleGalleryArtwork}
                onOpenImage={setLightboxImage}
                savedArtworkIds={savedArtworkIds}
                feedbackPending={feedbackPending}
              />
            )}

            {!activeWorkspace.isSaved && isLivePending && (
              <PendingCompanionMessage
                label={pendingCopy?.label ?? "I’m looking closely and gathering related works."}
                detail={pendingCopy?.detail ?? "I’ll keep this grounded to what’s visible while I pull stronger matches."}
              />
            )}

            {(!activeWorkspace.isSaved || savedHistoryOpen) && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap gap-2">
                  <input
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Ask for context, identification, or related works..."
                    className="min-w-[240px] flex-1 rounded border border-slate-300 p-2 text-sm"
                  />
                  <select
                    value={selectedRole}
                    onChange={(event) => setSelectedRole(event.target.value as WorkspaceImage["role"])}
                    className="rounded border border-slate-300 p-2 text-sm"
                  >
                    <option value="DETAIL">detail</option>
                    <option value="PRIMARY">primary</option>
                    <option value="SUPPORTING">supporting</option>
                    <option value="WALL_LABEL">wall label</option>
                    <option value="COMPARATIVE">comparative</option>
                  </select>
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void attachImage(file);
                      event.currentTarget.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => attachmentInputRef.current?.click()}
                    disabled={imagePending}
                    className="rounded border border-slate-300 px-3 py-2 text-sm"
                  >
                    + Image
                  </button>
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={messagePending}
                    className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                  >
                    {messagePending ? "Thinking..." : "Send →"}
                  </button>
                </div>
                {uiError && <p className="mt-3 text-sm text-rose-700">{uiError}</p>}
              </div>
            )}

            {activeWorkspace.isSaved && (
              <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-slate-700">Conversation history</summary>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSavedHistoryOpen((open) => !open)}
                    className="rounded border border-slate-300 px-3 py-1.5"
                  >
                    {savedHistoryOpen ? "Hide chat" : "Reopen chat"}
                  </button>
                  <p className="text-slate-600">Open the full exchange to continue the conversation or revisit how the gallery and reasoning evolved turn by turn.</p>
                </div>
              </details>
            )}
          </section>

          {(activeWorkspace.isSaved || visibleGalleryArtworks.length > 0 || referenceImages.length > 0) && (
            <section className="card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{activeWorkspace.isSaved ? "Gallery" : "Thread gallery"}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {activeWorkspace.isSaved
                      ? "This gallery preserves the works you explicitly kept from the conversation by saving them to the thread gallery."
                      : "This gallery keeps the specific works you saved from the conversation, separate from the changing suggestions inside the chat."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {visibleGalleryArtworks.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setGalleryEditMode((open) => !open);
                          setSelectedGalleryArtworkIds([]);
                        }}
                        className="rounded border border-slate-300 px-3 py-1.5 text-sm"
                      >
                        {galleryEditMode ? "Cancel edit" : "Edit gallery"}
                      </button>
                      {galleryEditMode && (
                        <button
                          type="button"
                          onClick={removeSelectedGalleryArtworks}
                          disabled={selectedGalleryArtworkIds.length === 0 || feedbackPending}
                          className="rounded border border-rose-300 px-3 py-1.5 text-sm text-rose-700 disabled:opacity-50"
                        >
                          Remove selected ({selectedGalleryArtworkIds.length})
                        </button>
                      )}
                    </>
                  )}
                  <Link href={`/submission/${activeWorkspace.submissionId}`} className="text-sm text-blue-700 underline">
                    Standalone thread view
                  </Link>
                </div>
              </div>

              {referenceImages.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-slate-700">Uploaded references in this thread</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {referenceImages.map((image) => (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => setLightboxImage(image)}
                        className="overflow-hidden rounded-lg border border-slate-200 bg-white text-left"
                      >
                        <div className="aspect-[4/3] bg-slate-100">
                          <Image src={image.imageUrl} alt={`Thread reference ${image.role}`} width={900} height={675} className="h-full w-full object-cover" />
                        </div>
                        <div className="p-2 text-xs text-slate-600">
                          {image.role.replaceAll("_", " ").toLowerCase()}
                          {image.note ? ` · ${image.note}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {visibleGalleryArtworks.map((artwork) => (
                  <article key={artwork.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <div className="aspect-[4/3] bg-slate-100">
                      {artwork.imageUrl ? (
                        <Image src={artwork.imageUrl} alt={artwork.title} width={900} height={675} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-500">Image unavailable</div>
                      )}
                    </div>
                    <div className="space-y-2 p-3 text-sm">
                      {galleryEditMode && (
                        <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={selectedGalleryArtworkIds.includes(artwork.id)}
                            onChange={() => toggleGallerySelection(artwork.id)}
                          />
                          Select to remove
                        </label>
                      )}
                      <p className="font-semibold">{artwork.title}</p>
                      <p className="text-slate-600">{artwork.artistName ?? "Unknown artist"}</p>
                      <p>{artwork.reason}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeWorkspace.isSaved && activeWorkspace.externalLookups.length > 0 && (
            <section className="card">
              <h2 className="text-lg font-semibold">Context</h2>
              <div className="mt-4 space-y-3">
                {activeWorkspace.externalLookups.map((lookup) => (
                  <article key={lookup.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
                    <p className="font-semibold">{lookup.candidateTitle ?? "Possible lead"}</p>
                    <p className="mt-1 text-slate-600">
                      {lookup.candidateArtist ? `Artist: ${lookup.candidateArtist}` : "Artist not confirmed"}
                      {lookup.movementOrPeriod ? ` • ${lookup.movementOrPeriod}` : ""}
                    </p>
                    <p className="mt-2">{lookup.evidenceSummary}</p>
                    <div className="mt-3">
                      <EvidenceDetails summary="Source details">
                        <p>Mode: {lookup.mode.toLowerCase()}</p>
                        <p>Source: {lookup.sourceLabel}</p>
                        <p>Confidence: {Math.round(lookup.confidence * 100)}%</p>
                        {lookup.sourceUrls.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer" className="block text-blue-700 underline">
                            {url}
                          </a>
                        ))}
                      </EvidenceDetails>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />
    </div>
  );
}
