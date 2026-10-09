# RitaWapp Global Installation & Setup (v1.0.1)

## 1. Automated Installation

Run the following setup command from your RitaWapp checkout:

```powershell
deno task setup
```

This performs the following actions:

1. Copies `Core/cli/bin/rwa.cmd` to `%LOCALAPPDATA%\RitaWapp\bin\rwa.cmd`.
2. Stores the absolute framework repository location in
   `%LOCALAPPDATA%\RitaWapp\bin\rwa.root`.
3. Adds `%LOCALAPPDATA%\RitaWapp\bin` to the current user's `PATH` environment
   variable (`HKCU\Environment`).

## 2. Verification

Open a new PowerShell or Command Prompt terminal and run:

```powershell
rwa --version
```

Output:

```text
RitaWapp v1.0.1
```

## 3. Uninstallation

To cleanly remove the global command and revert the User PATH modification:

```powershell
rwa uninstall-global
```
