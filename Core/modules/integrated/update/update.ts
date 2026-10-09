/**
 * ============================================================================
 * RDevCore/modules/integrated/update/update.ts
 * ============================================================================
 * Auto-Updater & GitHub Release Sync module for RitaWapp
 * Checks releases using configured repoUrl and swaps bundles seamlessly.
 * ============================================================================
 */

import { rpc } from "../../../client/vue/rpc.ts";

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  downloadUrl?: string;
  repoUrl?: string;
}

export const update = {
  /**
   * Retrieves the configured GitHub repository URL from RitaWapp-config.ts
   */
  async getRepoUrl(): Promise<string> {
    try {
      return await rpc("update", "getRepoUrl");
    } catch {
      return "";
    }
  },

  /**
   * Checks GitHub Releases for new updates using repoUrl.
   */
  async checkForUpdates(
    currentVersion?: string,
    repoUrl?: string,
  ): Promise<UpdateInfo> {
    try {
      const res = await rpc("update", "check", { repoUrl: repoUrl || "" });
      if (res && typeof res === "object") {
        return res;
      }
    } catch {
      // Fallback to fetch if native call is unavailable
    }

    const effectiveRepo = repoUrl || (await this.getRepoUrl());
    if (!effectiveRepo) {
      return {
        hasUpdate: false,
        currentVersion: currentVersion || "1.0.0",
        latestVersion: currentVersion || "1.0.0",
        releaseNotes:
          "No GitHub repository URL configured in RitaWapp-config.ts.",
        repoUrl: "",
      };
    }

    try {
      const slug = effectiveRepo.replace(/^https?:\/\/github\.com\//, "")
        .replace(/\.git$/, "").replace(/\/$/, "");
      const res = await fetch(
        `https://api.github.com/repos/${slug}/releases/latest`,
      );
      if (!res.ok) {
        return {
          hasUpdate: false,
          currentVersion: currentVersion || "1.0.0",
          latestVersion: currentVersion || "1.0.0",
          releaseNotes: "Unable to reach GitHub releases.",
          repoUrl: effectiveRepo,
        };
      }

      const data = await res.json();
      const latestTag = (data.tag_name || "").replace(/^v/i, "");
      const hasUpdate = Boolean(
        latestTag && currentVersion && latestTag !== currentVersion,
      );

      let downloadUrl = "";
      if (data.assets && Array.isArray(data.assets)) {
        const bundleAsset = data.assets.find((a: any) =>
          a.name?.endsWith(".app") || a.name?.endsWith(".zip")
        );
        if (bundleAsset) downloadUrl = bundleAsset.browser_download_url;
      }

      return {
        hasUpdate,
        currentVersion: currentVersion || "1.0.0",
        latestVersion: latestTag,
        releaseNotes: data.body || "",
        downloadUrl,
        repoUrl: effectiveRepo,
      };
    } catch (err: any) {
      return {
        hasUpdate: false,
        currentVersion: currentVersion || "1.0.0",
        latestVersion: currentVersion || "1.0.0",
        releaseNotes: `Check failed: ${err.message}`,
        repoUrl: effectiveRepo,
      };
    }
  },

  /**
   * Downloads the new bundle file from GitHub Releases.
   */
  async downloadUpdate(downloadUrl: string): Promise<boolean> {
    try {
      const res = await rpc("update", "download", { downloadUrl });
      return Boolean(res);
    } catch {
      return false;
    }
  },

  /**
   * Atomically swaps the active bundle with the newly downloaded bundle.
   */
  async install(): Promise<boolean> {
    return await rpc("update", "install");
  },

  /**
   * Restores the previous bundle backup in case of issue.
   */
  async rollback(): Promise<boolean> {
    return await rpc("update", "rollback");
  },
};

export default update;
