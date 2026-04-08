import { prisma } from "@/lib/db";

const fallbackEmail = process.env.DEMO_USER_EMAIL ?? "demo@artsearch.local";

export async function getOrCreateDemoUser() {
  return prisma.user.upsert({
    where: { email: fallbackEmail },
    update: {},
    create: { email: fallbackEmail, name: "Demo User" }
  });
}
