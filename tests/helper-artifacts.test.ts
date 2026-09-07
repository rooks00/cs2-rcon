import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
const execute = promisify(execFile);

describe("portable helper distribution", () => {
  it("ships all six executable targets with matching download checksums", async () => {
    const directory = resolve("public/relay/v0.2.0");
    const manifest = JSON.parse(await readFile(join(directory,"manifest.json"),"utf8")) as {
      artifacts: Array<{target:string;file:string;sha256:string;downloadBytes:number;executableBytes:number}>;
    };
    expect(manifest.artifacts.map(item=>item.target).sort()).toEqual(["darwin-amd64","darwin-arm64","linux-amd64","linux-arm64","windows-amd64","windows-arm64"]);
    for (const item of manifest.artifacts) {
      const archive = await readFile(join(directory,item.file));
      expect(createHash("sha256").update(archive).digest("hex")).toBe(item.sha256);
      expect((await readFile(join(directory,item.file+".sha256"),"utf8")).trim()).toBe(item.sha256);
      expect(archive.length).toBe(item.downloadBytes);
      const binary = gunzipSync(archive);
      expect(binary.length).toBe(item.executableBytes);
      if (item.target.startsWith("linux")) expect(binary.subarray(0,4).toString("hex")).toBe("7f454c46");
      if (item.target.startsWith("windows")) expect(binary.subarray(0,2).toString()).toBe("MZ");
      if (item.target.startsWith("darwin")) expect(binary.subarray(0,4).toString("hex")).toBe("cffaedfe");
    }
  });
  it.skipIf(process.platform !== "linux")("refuses a corrupt download before executing and removes temporary files", async () => {
    const directory=await mkdtemp(join(tmpdir(),"relay-installer-check-"));
    const server=createServer((request,response)=>{response.end(request.url?.endsWith(".sha256")?"0".repeat(64):"not-an-executable");});
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    const address=server.address();
    if(!address||typeof address==="string") throw new Error("Missing fixture address");
    try {
      await expect(execute("sh",[resolve("public/relay/install.sh"),`http://127.0.0.1:${address.port}`,"--no-open"],{env:{...process.env,TMPDIR:directory}})).rejects.toMatchObject({code:1,stderr:expect.stringContaining("Nothing was executed")});
      expect(await readdir(directory)).toEqual([]);
    } finally {
      await new Promise<void>(resolve=>server.close(()=>resolve()));
      await rm(directory,{recursive:true,force:true});
    }
  });
});
