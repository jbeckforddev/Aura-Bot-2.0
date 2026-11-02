import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const libsignalDir = path.join(root, "node_modules", "libsignal");
const packageJson = JSON.parse(
  readFileSync(path.join(libsignalDir, "package.json"), "utf8"),
);

if (packageJson.version !== "6.0.0") {
  throw new Error(
    `Expected libsignal 6.0.0, found ${packageJson.version ?? "unknown"}.`,
  );
}

const sessionCipherPath = path.join(
  libsignalDir,
  "src",
  "session_cipher.js",
);
const sessionRecordPath = path.join(
  libsignalDir,
  "src",
  "session_record.js",
);
let sessionCipher = readFileSync(sessionCipherPath, "utf8");
let sessionRecord = readFileSync(sessionRecordPath, "utf8");
const newline = sessionCipher.includes("\r\n") ? "\r\n" : "\n";
const decryptLogMarker =
  "further libsignal decrypt errors will be suppressed.";

if (!sessionCipher.includes(decryptLogMarker)) {
  const versionLine = `const VERSION = 3;${newline}`;
  const decryptLogPattern =
    /[\t ]{8}console\.error\("Failed to decrypt message with any known session\.\.\."\);[\t ]*\r?\n[\t ]{8}for \(const e of errs\) \{[\t ]*\r?\n[\t ]{12}console\.error\("Session error:" \+ e, e\.stack\);[\t ]*\r?\n[\t ]{8}\}/;

  if (!sessionCipher.includes(versionLine)) {
    throw new Error("Could not locate libsignal SessionCipher version marker.");
  }

  if (!decryptLogPattern.test(sessionCipher)) {
    throw new Error(
      "Could not locate libsignal's repeated decrypt error logging block.",
    );
  }

  sessionCipher = sessionCipher.replace(
    versionLine,
    `${versionLine}let hasLoggedDecryptFailure = false;${newline}`,
  );
  sessionCipher = sessionCipher.replace(
    decryptLogPattern,
    [
      "        if (!hasLoggedDecryptFailure) {",
      '            console.warn("Failed to decrypt a message with known sessions; further libsignal decrypt errors will be suppressed.");',
      "            hasLoggedDecryptFailure = true;",
      "        }",
    ].join(newline),
  );
}

sessionRecord = sessionRecord.replace(
  `        console.info("Closing session:", session);${newline}`,
  "",
);

writeFileSync(sessionCipherPath, sessionCipher);
writeFileSync(sessionRecordPath, sessionRecord);
console.log("Applied libsignal decrypt log suppression.");
