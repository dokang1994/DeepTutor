import test from "node:test";
import assert from "node:assert/strict";

import { scanClaude } from "../lib/chat-import/claude-code";
import { scanCodex } from "../lib/chat-import/codex";
import { scanErrorCode } from "../lib/chat-import";
import { ImportScanError } from "../lib/chat-import/types";

/**
 * A project-local `.claude` folder (settings + skills, no `projects/`) used to
 * crash the import wizard: `getDirectoryHandle` rejects with a DOMException,
 * which is not an ImportScanError, so the wizard showed "something went wrong,
 * please try again" for a folder that could never succeed.
 */

function domError(name: string): Error {
  const err = new Error(name);
  err.name = name;
  return err;
}

/** Minimal stand-in for the slice of FileSystemDirectoryHandle we touch. */
function dirHandle(
  name: string,
  children: Record<string, "missing" | "denied">,
): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name,
    async getDirectoryHandle(child: string) {
      const state = children[child];
      if (state === "denied") throw domError("NotAllowedError");
      throw domError("NotFoundError");
    },
    async *values() {},
  } as unknown as FileSystemDirectoryHandle;
}

test("scanClaude treats a missing projects/ folder as an empty import", async () => {
  const handle = dirHandle(".claude", { projects: "missing" });
  assert.deepEqual(await scanClaude(handle), []);
});

test("scanCodex treats a missing sessions/ folder as an empty import", async () => {
  const handle = dirHandle(".codex", { sessions: "missing" });
  assert.deepEqual(await scanCodex(handle), []);
});

test("a denied read still propagates — it is not an empty import", async () => {
  const claude = dirHandle(".claude", { projects: "denied" });
  await assert.rejects(() => scanClaude(claude), { name: "NotAllowedError" });

  const codex = dirHandle(".codex", { sessions: "denied" });
  await assert.rejects(() => scanCodex(codex), { name: "NotAllowedError" });
});

test("scanErrorCode keeps ImportScanError codes intact", () => {
  assert.equal(
    scanErrorCode(new ImportScanError("not_recognized")),
    "not_recognized",
  );
  assert.equal(scanErrorCode(new ImportScanError("aborted")), "aborted");
});

test("scanErrorCode surfaces read denials instead of collapsing to generic", () => {
  assert.equal(scanErrorCode(domError("NotAllowedError")), "permission_denied");
  assert.equal(scanErrorCode(domError("SecurityError")), "permission_denied");
});

test("scanErrorCode still falls back to generic for anything unexpected", () => {
  assert.equal(scanErrorCode(new Error("boom")), "generic");
  assert.equal(scanErrorCode(null), "generic");
  assert.equal(scanErrorCode(undefined), "generic");
  assert.equal(scanErrorCode("a string"), "generic");
});
