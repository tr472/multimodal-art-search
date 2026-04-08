import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ProvenancePage() {
  const artworks = await prisma.artwork.findMany({
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      externalSource: true,
      externalId: true,
      sourceUrl: true
    },
    take: 200
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Provenance View</h1>
        <p className="text-slate-700">
          Admin/debug view for source tracking on ingested records: source, external ID, and source URL.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="py-2 pr-4">Title</th>
              <th className="py-2 pr-4">Source</th>
              <th className="py-2 pr-4">External ID</th>
              <th className="py-2 pr-4">Source URL</th>
            </tr>
          </thead>
          <tbody>
            {artworks.map((artwork) => (
              <tr key={artwork.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-4">{artwork.title}</td>
                <td className="py-2 pr-4">{artwork.externalSource}</td>
                <td className="py-2 pr-4">{artwork.externalId}</td>
                <td className="py-2 pr-4">
                  {artwork.sourceUrl ? (
                    <a href={artwork.sourceUrl} className="text-blue-700 underline" target="_blank" rel="noreferrer">
                      {artwork.sourceUrl}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Link href="/" className="text-sm text-blue-700 underline">
        Back to home
      </Link>
    </div>
  );
}
