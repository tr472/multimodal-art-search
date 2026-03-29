import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_MAX_UPLOAD_SIZE_MB = 12;

export function getMaxUploadBytes() {
  const configuredMb = Number(process.env.MAX_UPLOAD_SIZE_MB ?? DEFAULT_MAX_UPLOAD_SIZE_MB);
  const safeMb = Number.isFinite(configuredMb) && configuredMb > 0 ? configuredMb : DEFAULT_MAX_UPLOAD_SIZE_MB;
  return Math.floor(safeMb * 1024 * 1024);
}

export async function saveUploadedImage(file: File) {
  const uploadDir = process.env.UPLOAD_DIR ?? "public/uploads";
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const absoluteDir = path.join(process.cwd(), uploadDir);

  await mkdir(absoluteDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(absoluteDir, safeName), buffer);

  return `/${uploadDir.replace(/^public\//, "")}/${safeName}`;
}
