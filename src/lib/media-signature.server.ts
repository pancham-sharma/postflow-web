// Server-only. Verifies an uploaded file's real type from its magic bytes so a
// renamed executable/HTML/SVG payload cannot masquerade as an allowed image or video.

export type SniffedKind = "image" | "video" | null;

type Signature = { kind: "image" | "video"; mimes: string[]; test: (b: Uint8Array) => boolean };

const ascii = (b: Uint8Array, start: number, text: string) =>
  text.split("").every((ch, i) => b[start + i] === ch.charCodeAt(0));

const SIGNATURES: Signature[] = [
  {
    kind: "image",
    mimes: ["image/jpeg"],
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    kind: "image",
    mimes: ["image/png"],
    test: (b) => b[0] === 0x89 && ascii(b, 1, "PNG"),
  },
  { kind: "image", mimes: ["image/gif"], test: (b) => ascii(b, 0, "GIF8") },
  {
    kind: "image",
    mimes: ["image/webp"],
    test: (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP"),
  },
  {
    kind: "video",
    mimes: ["video/mp4", "video/quicktime"],
    test: (b) => ascii(b, 4, "ftyp"),
  },
  {
    kind: "video",
    mimes: ["video/webm"],
    test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  },
];

/** Returns the mime types the bytes actually look like, or an empty list. */
export function sniffMediaBytes(bytes: Uint8Array): { kind: SniffedKind; mimes: string[] } {
  for (const sig of SIGNATURES) {
    try {
      if (sig.test(bytes)) return { kind: sig.kind, mimes: sig.mimes };
    } catch {
      /* short buffer — keep checking */
    }
  }
  return { kind: null, mimes: [] };
}

/** True when the declared mime is consistent with the file's real signature. */
export function signatureMatchesMime(bytes: Uint8Array, declaredMime: string): boolean {
  const sniffed = sniffMediaBytes(bytes);
  if (!sniffed.kind) return false;
  // MOV/MP4/M4V all share the `ftyp` box; treat the container family as equivalent.
  return sniffed.mimes.includes(declaredMime.toLowerCase());
}
