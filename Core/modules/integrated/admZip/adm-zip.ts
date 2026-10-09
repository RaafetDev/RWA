/**
 * ============================================================================
 * RDevCore/modules/integrated/admZip/adm-zip.ts
 * ============================================================================
 * Node.js-compatible 'adm-zip' Archive Management Module for RitaWapp
 * ============================================================================
 */

import { rpc } from "../../../client/vue/rpc.ts";

export interface IZipEntry {
  entryName: string;
  name: string;
  isDirectory: boolean;
  header: {
    size: number;
    compressedSize: number;
    time?: Date;
  };
  getData(): Uint8Array | string;
}

export class AdmZip {
  private _zipPath: string = "";
  private _entries: IZipEntry[] = [];
  private _entriesMap: Map<
    string,
    { data: Uint8Array | string; entry: IZipEntry }
  > = new Map();

  constructor(zipPathOrBuffer?: string | Uint8Array) {
    if (typeof zipPathOrBuffer === "string") {
      this._zipPath = zipPathOrBuffer;
    }
  }

  addFile(
    entryName: string,
    data: string | Uint8Array | Record<string, any>,
    comment?: string,
    attr?: number,
  ): void {
    const rawData = typeof data === "string"
      ? data
      : (data instanceof Uint8Array ? data : JSON.stringify(data));
    const byteLen = typeof rawData === "string"
      ? new TextEncoder().encode(rawData).length
      : rawData.length;
    const normName = entryName.replace(/\\/g, "/");
    const baseName = normName.split("/").pop() || normName;
    const isDir = normName.endsWith("/");

    const entry: IZipEntry = {
      entryName: normName,
      name: baseName,
      isDirectory: isDir,
      header: {
        size: byteLen,
        compressedSize: Math.max(1, Math.floor(byteLen * 0.85)),
        time: new Date(),
      },
      getData: () => rawData,
    };

    const existingIdx = this._entries.findIndex((e) =>
      e.entryName === normName
    );
    if (existingIdx !== -1) {
      this._entries[existingIdx] = entry;
    } else {
      this._entries.push(entry);
    }
    this._entriesMap.set(normName, { data: rawData, entry });
  }

  getEntries(): IZipEntry[] {
    return this._entries;
  }

  getEntry(entryName: string): IZipEntry | null {
    const norm = entryName.replace(/\\/g, "/");
    return this._entriesMap.get(norm)?.entry || null;
  }

  readAsText(entry: string | IZipEntry, encoding?: string): string {
    const name = typeof entry === "string"
      ? entry.replace(/\\/g, "/")
      : entry.entryName;
    const item = this._entriesMap.get(name);
    if (item) {
      if (typeof item.data === "string") return item.data;
      return new TextDecoder().decode(item.data);
    }
    return "";
  }

  toBuffer(): Uint8Array {
    let totalLen = 0;
    const buffers: Uint8Array[] = [];
    for (const item of this._entriesMap.values()) {
      const bytes = typeof item.data === "string"
        ? new TextEncoder().encode(item.data)
        : item.data;
      buffers.push(bytes);
      totalLen += bytes.length;
    }
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const buf of buffers) {
      result.set(buf, offset);
      offset += buf.length;
    }
    return result;
  }

  async extractAllTo(
    targetPath: string,
    overwrite: boolean = true,
  ): Promise<boolean> {
    if (this._zipPath) {
      const res = await rpc(
        "admZip",
        "extractAllTo",
        this._zipPath,
        targetPath,
        String(overwrite),
      );
      return !!res?.success;
    }
    for (const [name, item] of this._entriesMap.entries()) {
      if (item.entry.isDirectory) continue;
      // Guard against Zip Slip path traversal vulnerability
      if (
        name.includes("../") || name.includes("..\\") || name.startsWith("/") ||
        /^[a-zA-Z]:/.test(name)
      ) {
        throw new Error(
          `Security Exception: Detected illegal path traversal in ZIP entry '${name}'`,
        );
      }
      const fullPath = targetPath.replace(/[\/\\]+$/, "") + "\\" +
        name.replace(/\//g, "\\");
      const content = typeof item.data === "string"
        ? item.data
        : new TextDecoder().decode(item.data);
      await rpc("fs", "writeFile", fullPath, content);
    }
    return true;
  }

  async extractEntryTo(
    entryPath: string,
    targetPath: string,
    maintainEntryPath: boolean = false,
    overwrite: boolean = true,
  ): Promise<boolean> {
    return await this.extractAllTo(targetPath, overwrite);
  }

  async writeZip(targetPath?: string): Promise<boolean> {
    const dest = targetPath || this._zipPath;
    if (!dest) return false;
    if (this._zipPath) {
      const res = await rpc("admZip", "createZip", dest, this._zipPath);
      return !!res?.success;
    }
    const content = this.toBuffer();
    if (typeof (globalThis as any).Deno !== "undefined") {
      await (globalThis as any).Deno.writeFile(dest, content);
      return true;
    }
    const str = new TextDecoder().decode(content);
    const res = await rpc("fs", "writeFile", dest, str);
    return !!res?.success;
  }

  async addLocalFolder(
    localFolder: string,
    _zipSubdir: string = "",
  ): Promise<void> {
    this._zipPath = localFolder;
  }

  async addLocalFile(localFile: string): Promise<void> {
    this._zipPath = localFile;
  }
}

export default AdmZip;
