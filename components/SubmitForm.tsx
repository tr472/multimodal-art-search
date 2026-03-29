import { ArtCompanionWorkspace } from "@/components/ArtCompanionWorkspace";
import type { SavedChatPreview } from "@/types/chat";

export function SubmitForm({ initialSavedChats = [] }: { initialSavedChats?: SavedChatPreview[] }) {
  return <ArtCompanionWorkspace initialSavedChats={initialSavedChats} />;
}
