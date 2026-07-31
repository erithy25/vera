#!/usr/bin/env node
/**
 * Is the download on the website the app we think it is?
 *
 *   node scripts/check-release.mjs            # the files in this repo agree with each other
 *   node scripts/check-release.mjs --live     # …and the live site serves exactly those bytes
 *
 * ## Why this exists
 *
 * The website's version number comes from `updater/latest.json`, and the
 * download button points at `downloads/Vera.dmg`. Nothing connected the two.
 * A release could update one and not the other, and the result is the worst
 * kind of wrong: a page that confidently offers "v0.5.2" and hands over the
 * previous build. Nobody would notice, because a DMG that installs fine looks
 * exactly like a DMG that is correct.
 *
 * So every release writes `downloads/Vera.dmg.sha256`, and this compares:
 * the manifest version, the version the app was built at, the hash beside the
 * file, the hash *of* the file, and — with `--live` — the hash of the bytes the
 * deployed site actually returns.
 *
 * No dependencies, no network unless asked. Exit code 0 means shippable.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const P = {
  manifest: join(root, "website/public/updater/latest.json"),
  dmg: join(root, "website/public/downloads/Vera.dmg"),
  dmgHash: join(root, "website/public/downloads/Vera.dmg.sha256"),
  tgz: join(root, "website/public/downloads/Vera.app.tar.gz"),
  tauriConf: join(root, "src-tauri/tauri.conf.json"),
};

let failed = 0;
const ok = (label, detail = "") => console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
const bad = (label, detail = "") => {
  failed++;
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
};

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const human = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

/* --- The files in this repo ---------------------------------------------- */

console.log("=== the release in this repo ===");

for (const [name, path] of Object.entries(P)) {
  if (!existsSync(path)) {
    bad(`${name} is missing`, path.replace(root + "/", ""));
  }
}
if (failed) {
  console.log("\n  Run `bash scripts/release-mac.sh` on the Mac that holds the signing key.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(P.manifest, "utf8"));
const built = JSON.parse(readFileSync(P.tauriConf, "utf8")).version;
const dmg = readFileSync(P.dmg);
const tgz = readFileSync(P.tgz);
const dmgSum = sha256(dmg);

// The sidecar is `<hex>  Vera.dmg  v<version>` so it is both machine-readable
// and something a person can check a download against by hand.
const sidecar = readFileSync(P.dmgHash, "utf8").trim();
const [sidecarSum, , sidecarVersion] = sidecar.split(/\s+/);

if (manifest.version === built) ok("the manifest version is the version the app was built at", `v${built}`);
else bad("manifest and tauri.conf.json disagree", `manifest v${manifest.version}, built v${built}`);

if (sidecarVersion === `v${manifest.version}`) ok("the hash beside the DMG names the same version");
else bad("the hash file names a different version", `${sidecarVersion} vs v${manifest.version}`);

if (sidecarSum === dmgSum) ok("the DMG matches its own checksum", dmgSum.slice(0, 16) + "…");
else bad("the DMG does not match its checksum — the file changed after release", `file ${dmgSum.slice(0, 16)}…, sidecar ${sidecarSum.slice(0, 16)}…`);

// A DMG is a UDIF image: the last 512 bytes are a trailer beginning `koly`.
// Catches the case where the copy produced a truncated or wrong-type file.
if (dmg.length > 512 && dmg.subarray(dmg.length - 512, dmg.length - 508).toString("ascii") === "koly") {
  ok("the DMG is a complete disk image", human(dmg.length));
} else {
  bad("the DMG has no `koly` trailer — it is truncated or not a disk image", human(dmg.length));
}

if (tgz.length > 2 && tgz[0] === 0x1f && tgz[1] === 0x8b) ok("the updater archive is a real gzip", human(tgz.length));
else bad("the updater archive is not gzip data");

const platforms = Object.keys(manifest.platforms ?? {});
if (platforms.length) ok("the update manifest covers", platforms.join(", "));
else bad("the update manifest lists no platforms — nobody will ever be offered the update");

for (const [name, p] of Object.entries(manifest.platforms ?? {})) {
  if (!p.signature) bad(`${name} has no updater signature`);
  if (!/^https:\/\//.test(p.url ?? "")) bad(`${name} update URL is not https`, p.url);
}

/* --- What the deployed site actually returns ------------------------------ */

if (process.argv.includes("--live")) {
  const site = (process.argv[process.argv.indexOf("--live") + 1] ?? "").startsWith("http")
    ? process.argv[process.argv.indexOf("--live") + 1].replace(/\/$/, "")
    : "https://vera-sandy.vercel.app";

  console.log(`\n=== what ${site} serves ===`);

  const get = async (path) => {
    const res = await fetch(site + path, { redirect: "follow", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  };

  try {
    const liveManifest = JSON.parse((await get("/updater/latest.json")).toString("utf8"));
    if (liveManifest.version === manifest.version) ok("the live manifest is this version", `v${liveManifest.version}`);
    else bad("the live manifest is a different version — the deploy has not landed", `live v${liveManifest.version}, repo v${manifest.version}`);
  } catch (e) {
    bad("could not read the live update manifest", String(e.message));
  }

  try {
    const liveDmg = await get("/downloads/Vera.dmg");
    if (sha256(liveDmg) === dmgSum) ok("the live DMG is byte-for-byte the one in this repo", human(liveDmg.length));
    else bad("the live DMG is a DIFFERENT FILE", `live ${sha256(liveDmg).slice(0, 16)}…, repo ${dmgSum.slice(0, 16)}…`);
  } catch (e) {
    bad("could not download the live DMG", String(e.message));
  }

  try {
    const liveTgz = await get("/downloads/Vera.app.tar.gz");
    if (sha256(liveTgz) === sha256(tgz)) ok("the live updater archive matches");
    else bad("the live updater archive differs — existing installs would update to the wrong build");
  } catch (e) {
    bad("could not download the live updater archive", String(e.message));
  }
}

console.log(
  failed === 0
    ? `\n  PASS  the download is Vera v${manifest.version}, and everything points at the same bytes`
    : `\n  FAIL  ${failed} problem${failed === 1 ? "" : "s"} — do not announce this release`
);
process.exit(failed === 0 ? 0 : 1);
