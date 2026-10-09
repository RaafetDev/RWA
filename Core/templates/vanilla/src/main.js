import { rpc } from "./rpc.js";

export async function initApp() {
  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.innerText = "Runtime connected.";
}

export async function testDatabase() {
  const out = document.getElementById("output");
  if (!out) return;
  out.innerText = "Querying SQLite database...";
  try {
    const res = await rpc("database", "query", { sql: "SELECT sqlite_version() as version, datetime('now') as time;" });
    out.innerText = JSON.stringify(res, null, 2);
  } catch (err) {
    out.innerText = "Database query error: " + err.message;
  }
}

export async function testSystemInfo() {
  const out = document.getElementById("output");
  if (!out) return;
  out.innerText = "Fetching OS metrics...";
  try {
    const res = await rpc("os", "info");
    out.innerText = JSON.stringify(res, null, 2);
  } catch (err) {
    out.innerText = "OS query error: " + err.message;
  }
}

window.testDatabase = testDatabase;
window.testSystemInfo = testSystemInfo;

document.addEventListener("DOMContentLoaded", initApp);
