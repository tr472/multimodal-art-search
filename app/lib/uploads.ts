import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { appConfig } from "@/lib/config";

export function getMaxUploadBytes() {
  const safeMb = Number.isFinite(appConfig.upload.maxSizeMb) && appConfig.upload.maxSizeMb > 0 ? appConfig.upload.maxSizeMb : 12;
  return Math.floor(safeMb * 1024 * 1024);
}

export async function saveUploadedImage(file: File) {
  const uploadDir = appConfig.upload.directory;
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const absoluteDir = path.join(process.cwd(), uploadDir);

  await mkdir(absoluteDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(absoluteDir, safeName), buffer);

  return `/${uploadDir.replace(/^public\//, "")}/${safeName}`;
}
