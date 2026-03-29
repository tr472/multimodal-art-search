import { notFound } from "next/navigation";
import { ArtCompanionWorkspace } from "@/components/ArtCompanionWorkspace";
import { prisma } from "@/lib/db";
import { buildThreadWorkspace } from "@/lib/threadWorkspace";

export const dynamic = "force-dynamic";

export default async function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      chatThread: true
    }
  });

  if (!submission?.chatThread) notFound();
  const workspace = await buildThreadWorkspace(submission.chatThread.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Art companion thread</h1>
      <ArtCompanionWorkspace initialWorkspace={workspace} />
    </div>
  );
}
