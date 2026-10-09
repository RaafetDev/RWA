/**
 * RitaWapp Setup and Uninstallation Helper
 * Installs rwa.cmd to %LOCALAPPDATA%\RitaWapp\bin and registers into HKCU\Environment PATH.
 */

export async function setupGlobalCli(): Promise<boolean> {
  const isWindows = Deno.build.os === "windows";
  if (!isWindows) {
    console.log(
      "[rwa setup] Global .cmd launcher is only applicable on Windows.",
    );
    return false;
  }

  const localAppData = Deno.env.get("LOCALAPPDATA") ||
    `${Deno.env.get("USERPROFILE")}\\AppData\\Local`;
  const targetDir = `${localAppData}\\RitaWapp\\bin`;
  await Deno.mkdir(targetDir, { recursive: true });

  const rootPath = Deno.cwd();
  await Deno.writeTextFile(`${targetDir}\\rwa.root`, rootPath);

  const cmdSrc = `${rootPath}\\Core\\cli\\bin\\rwa.cmd`;
  const cmdDest = `${targetDir}\\rwa.cmd`;
  await Deno.copyFile(cmdSrc, cmdDest);

  // Add targetDir to HKCU\Environment PATH idempotently
  const psScript = `
    $target = "${targetDir.replaceAll("\\", "\\\\")}"
    $path = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($path -notlike "*$target*") {
      [Environment]::SetEnvironmentVariable("PATH", "$path;$target", "User")
      Write-Output "ADDED"
    } else {
      Write-Output "ALREADY_PRESENT"
    }
  `;

  try {
    const cmd = new Deno.Command("powershell", {
      args: ["-NoProfile", "-Command", psScript],
      stdout: "piped",
      stderr: "piped",
    });
    const out = await cmd.output();
    const result = new TextDecoder().decode(out.stdout).trim();
    console.log(`[rwa setup] rwa.cmd installed at ${cmdDest}`);
    console.log(`[rwa setup] User PATH registry update: ${result}`);
    return true;
  } catch (err) {
    console.error(
      `[rwa setup] Failed updating User PATH: ${(err as Error).message}`,
    );
    return false;
  }
}

export async function uninstallGlobalCli(): Promise<boolean> {
  const localAppData = Deno.env.get("LOCALAPPDATA") ||
    `${Deno.env.get("USERPROFILE")}\\AppData\\Local`;
  const targetDir = `${localAppData}\\RitaWapp\\bin`;

  const psScript = `
    $target = "${targetDir.replaceAll("\\", "\\\\")}"
    $path = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($path -like "*$target*") {
      $parts = $path.Split(';') | Where-Object { $_ -ne $target -and $_ -ne "" }
      $newPath = $parts -join ';'
      [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
      Write-Output "REMOVED"
    } else {
      Write-Output "NOT_PRESENT"
    }
  `;

  try {
    const cmd = new Deno.Command("powershell", {
      args: ["-NoProfile", "-Command", psScript],
      stdout: "piped",
      stderr: "piped",
    });
    const out = await cmd.output();
    const result = new TextDecoder().decode(out.stdout).trim();
    console.log(`[rwa uninstall] User PATH registry update: ${result}`);

    try {
      await Deno.remove(targetDir, { recursive: true });
      console.log(`[rwa uninstall] Removed ${targetDir}`);
    } catch {
      // ignore if already removed
    }
    return true;
  } catch (err) {
    console.error(
      `[rwa uninstall] Failed uninstallation: ${(err as Error).message}`,
    );
    return false;
  }
}
