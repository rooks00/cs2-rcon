import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";

const version = "0.2.0";
const go = process.env.RELAY_GO || "go";
const folder = resolve(`public/relay/v${version}`);
await mkdir(folder, { recursive: true });
const targets = ["linux-amd64", "linux-arm64", "darwin-amd64", "darwin-arm64", "windows-amd64", "windows-arm64"];
const artifacts = [];
for (const target of targets) {
  const [os, arch] = target.split("-");
  const name = `relay-helper-${target}${os === "windows" ? ".exe" : ""}`;
  const binary = resolve(folder, name);
  execFileSync(go, ["build", "-trimpath", "-buildvcs=false", "-ldflags", `-s -w -X main.version=${version}`, "-o", binary, "."], {
    cwd: resolve("helper"), env: { ...process.env, GOOS: os, GOARCH: arch, CGO_ENABLED: "0" }, stdio: "inherit",
  });
  const raw = await readFile(binary);
  const compressed = gzipSync(raw, { level: 9 });
  const hash = createHash("sha256").update(compressed).digest("hex");
  await writeFile(binary + ".gz", compressed);
  await writeFile(binary + ".gz.sha256", hash + "\n");
  await rm(binary);
  artifacts.push({ target, file: name + ".gz", sha256: hash, downloadBytes: compressed.length, executableBytes: raw.length });
  console.log(`${target}: ${(compressed.length / 1024 / 1024).toFixed(2)} MB download, ${(raw.length / 1024 / 1024).toFixed(2)} MB executable`);
}
await writeFile(resolve(folder, "manifest.json"), JSON.stringify({ version, toolchain: execFileSync(go, ["version"], { encoding: "utf8" }).trim(), artifacts }, null, 2) + "\n");
