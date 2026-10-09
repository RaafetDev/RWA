/**
 * ============================================================================
 * RDevCore/modules/integrated/path/path.ts
 * ============================================================================
 * Complete Node.js-compatible 'path' module for RitaWapp
 * ============================================================================
 */

export const path = {
  sep: "\\",
  delimiter: ";",

  join(...segments: string[]): string {
    const parts = segments
      .filter(Boolean)
      .map((s) => s.replace(/[\/\\]+/g, "\\"))
      .join("\\");
    return this.normalize(parts);
  },

  resolve(...segments: string[]): string {
    return this.normalize(this.join(...segments));
  },

  normalize(pathStr: string): string {
    if (!pathStr) return ".";
    const normalized = pathStr.replace(/[\/\\]+/g, "\\");
    const isAbs = /^[a-zA-Z]:[\\\/]/.test(normalized);
    const prefix = isAbs
      ? normalized.slice(0, 3)
      : (normalized.startsWith("\\\\") ? "\\\\" : "");
    const rest = isAbs
      ? normalized.slice(3)
      : (normalized.startsWith("\\\\") ? normalized.slice(2) : normalized);
    const parts = rest.split(/[\\\/]+/).filter(Boolean);
    const stack: string[] = [];
    for (const p of parts) {
      if (p === ".") continue;
      if (p === "..") {
        if (stack.length > 0 && stack[stack.length - 1] !== "..") {
          stack.pop();
        } else if (!isAbs) {
          stack.push("..");
        }
      } else {
        stack.push(p);
      }
    }
    let res = prefix + stack.join("\\");
    if (!res) res = ".";
    return res;
  },

  isAbsolute(pathStr: string): boolean {
    return /^[a-zA-Z]:[\\\/]/.test(pathStr) || pathStr.startsWith("\\\\");
  },

  basename(pathStr: string, ext?: string): string {
    const norm = this.normalize(pathStr);
    const last = norm.split("\\").pop() || "";
    if (ext && last.endsWith(ext)) {
      return last.slice(0, -ext.length);
    }
    return last;
  },

  dirname(pathStr: string): string {
    const norm = this.normalize(pathStr);
    const idx = norm.lastIndexOf("\\");
    if (idx <= 0) return idx === 0 ? "\\" : ".";
    return norm.slice(0, idx);
  },

  extname(pathStr: string): string {
    const base = this.basename(pathStr);
    const idx = base.lastIndexOf(".");
    if (idx <= 0) return "";
    return base.slice(idx);
  },

  parse(
    pathStr: string,
  ): { root: string; dir: string; base: string; ext: string; name: string } {
    const base = this.basename(pathStr);
    const ext = this.extname(pathStr);
    const dir = this.dirname(pathStr);
    const root = /^[a-zA-Z]:\\/.test(pathStr) ? pathStr.slice(0, 3) : "";
    return {
      root,
      dir,
      base,
      ext,
      name: base.slice(0, base.length - ext.length),
    };
  },

  format(
    pathObj: {
      root?: string;
      dir?: string;
      base?: string;
      ext?: string;
      name?: string;
    },
  ): string {
    const dir = pathObj.dir || pathObj.root || "";
    const base = pathObj.base || `${pathObj.name || ""}${pathObj.ext || ""}`;
    if (!dir) return base;
    return `${dir}\\${base}`;
  },

  relative(from: string, to: string): string {
    const fromNorm = this.normalize(from).split("\\");
    const toNorm = this.normalize(to).split("\\");
    let same = 0;
    while (
      same < fromNorm.length && same < toNorm.length &&
      fromNorm[same].toLowerCase() === toNorm[same].toLowerCase()
    ) {
      same++;
    }
    const up = new Array(fromNorm.length - same).fill("..");
    const down = toNorm.slice(same);
    return [...up, ...down].join("\\") || ".";
  },

  win32: null as any,
  posix: null as any,
};

path.win32 = path;
path.posix = {
  sep: "/",
  delimiter: ":",
  join(...segments: string[]): string {
    return segments.filter(Boolean).join("/").replace(/\/+/g, "/");
  },
  resolve(...segments: string[]): string {
    return this.join(...segments);
  },
  normalize(p: string): string {
    return p.replace(/\\/g, "/");
  },
  isAbsolute(p: string): boolean {
    return p.startsWith("/");
  },
  basename(p: string, ext?: string): string {
    const last = p.split("/").pop() || "";
    if (ext && last.endsWith(ext)) return last.slice(0, -ext.length);
    return last;
  },
  dirname(p: string): string {
    const idx = p.lastIndexOf("/");
    return idx <= 0 ? (idx === 0 ? "/" : ".") : p.slice(0, idx);
  },
  extname(p: string): string {
    const base = this.basename(p);
    const idx = base.lastIndexOf(".");
    return idx <= 0 ? "" : base.slice(idx);
  },
  parse(p: string) {
    const base = this.basename(p);
    const ext = this.extname(p);
    return {
      root: p.startsWith("/") ? "/" : "",
      dir: this.dirname(p),
      base,
      ext,
      name: base.slice(0, base.length - ext.length),
    };
  },
  format(obj: any) {
    return `${obj.dir || ""}/${obj.base || obj.name || ""}`;
  },
  relative(from: string, to: string) {
    return to;
  },
  win32: path,
  posix: null as any,
};
path.posix.posix = path.posix;

export default path;
