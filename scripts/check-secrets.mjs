import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const root = process.cwd();
const mode = process.argv.includes("--staged") ? "staged" : "tracked";

const secretPatterns = [
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g],
  ["Stripe live secret", /\bsk_live_[A-Za-z0-9]{16,}\b/g],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g],
  ["JWT", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
  ["Credential-bearing URL", /[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s/@]+@[^\s]+/gi],
  [
    "Hardcoded credential assignment",
    /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|secret)\b\s*[:=]\s*["'][^"'\s]{16,}["']/gi,
  ],
];

function gitText(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function filesToScan() {
  const output =
    mode === "staged"
      ? gitText(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
      : gitText(["ls-files", "--cached", "--others", "--exclude-standard"]);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function contentFor(file) {
  if (mode === "staged") {
    return execFileSync("git", ["show", ":" + file], { cwd: root });
  }
  return readFileSync(resolve(root, file));
}

function unsafeFilename(file) {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  const name = basename(normalized);
  if (name === ".env") return "environment file";
  if (name.startsWith(".env.") && !/\.env\.(?:example|sample|template)$/.test(name)) {
    return "environment file";
  }
  if (/\.(?:pem|key|p12|pfx|jks|keystore|dump|backup|bak|sql\.gz)$/.test(name)) {
    return "private key, certificate, or backup";
  }
  if (
    /^(?:credentials|secrets)\.json$/.test(name) ||
    /^(?:client_secret|google-credentials|firebase-service-account|service-account).*\.json$/.test(name)
  ) {
    return "credential file";
  }
  return null;
}

function isPlaceholder(line) {
  const value = line.toLowerCase();
  return (
    value.includes("your_") ||
    value.includes("your-") ||
    value.includes("placeholder") ||
    value.includes("change_me") ||
    value.includes("changeme") ||
    value.includes("example.com")
  );
}

const findings = [];
for (const file of filesToScan()) {
  const filenameRule = unsafeFilename(file);
  if (filenameRule) findings.push({ file, line: 0, rule: filenameRule });

  let bytes;
  try {
    bytes = contentFor(file);
  } catch {
    continue;
  }
  if (bytes.length > 1_500_000 || bytes.includes(0)) continue;

  const lines = bytes.toString("utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isPlaceholder(line)) return;
    for (const [rule, pattern] of secretPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) findings.push({ file, line: index + 1, rule });
    }
  });
}

if (findings.length > 0) {
  console.error("Secret scan failed. Potential credentials were found:");
  for (const finding of findings) {
    const location = finding.line ? finding.file + ":" + finding.line : finding.file;
    console.error("- " + location + " (" + finding.rule + ")");
  }
  console.error("Only file names, line numbers, and rule names are shown; values are never printed.");
  process.exitCode = 1;
} else {
  console.log("Secret scan passed (" + mode + ").");
}
