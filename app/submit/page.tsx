import { SubmitForm } from "@/components/SubmitForm";
import { getOrCreateDemoUser } from "@/lib/auth";
import { buildSavedChatPreviews } from "@/lib/threadWorkspace";

export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const user = await getOrCreateDemoUser();
  const savedChats = await buildSavedChatPreviews(user.id);

  return (
    <div className="space-y-6">
      <section className="card border-0 bg-[linear-gradient(135deg,#f6ede0_0%,#f4f6f2_48%,#ffffff_100%)] p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Upload Flow</p>
        <h1 className="mt-2 font-[Iowan_Old_Style,Palatino_Linotype,Book_Antiqua,Georgia,serif] text-3xl text-slate-950">
          Start a thread from one artwork image.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
          Upload an artwork, add what you are responding to, get a grounded first interpretation, and keep the
          conversation open long enough to save the gallery and the reasoning trail.
        </p>
      </section>
      <SubmitForm initialSavedChats={savedChats} />
    </div>
  );
}
