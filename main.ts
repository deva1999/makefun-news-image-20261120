// main.ts — copy the bundled front-page image to the output directory.
// Node 22 standard library only. No network, no dependencies.
//
// The entry is a pre-rendered PNG (entry.png, 1024x1024, under 1 MiB).
// This program validates it against the competition gate, then writes it
// atomically to $MAKEFUN_OUTPUT_DIR/entry.png (or /output/entry.png).
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 1048576;
const MAX_DIM = 1024;
const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = join(here, "entry.png");
  const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? "/output");
  const target = join(outDir, "entry.png");

  let bytes: Buffer;
  try {
    bytes = await readFile(source);
  } catch {
    fail(`cannot read bundled image: ${source}`);
  }
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    fail("bundled entry.png is not a PNG (bad signature)");
  }
  if (bytes.length > MAX_BYTES) {
    fail(`bundled entry.png is ${bytes.length} bytes, over the 1 MiB cap`);
  }
  // PNG IHDR: width is bytes 16-19, height is bytes 20-23, big-endian.
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width > MAX_DIM || height > MAX_DIM) {
    fail(`bundled entry.png is ${width}x${height}, over the 1024x1024 cap`);
  }

  const sourceHash = sha256Hex(bytes);
  await mkdir(outDir, { recursive: true });
  const tmp = join(outDir, `.entry-${process.pid}.tmp`);
  await writeFile(tmp, bytes);
  await rename(tmp, target);

  const written = await readFile(target);
  const writtenHash = sha256Hex(written);
  if (writtenHash !== sourceHash) {
    fail(`SHA-256 mismatch after write: ${writtenHash} != ${sourceHash}`);
  }
  const info = await stat(target);
  console.log(
    `wrote ${target} (${width}x${height}, ${info.size} bytes, sha256 ${writtenHash})`,
  );
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
