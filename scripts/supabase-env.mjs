#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const activeEnv = resolve(root, ".env.local");
const remoteEnv = resolve(root, ".env.local.remote");
const target = process.argv[2];

const usage = () => {
  console.log("Usage: node scripts/supabase-env.mjs <local|remote>");
  console.log("Creates .env.local from local Supabase status or .env.local.remote.");
  console.log("Restart the Next.js dev server after changing environments.");
};
if (process.argv.length === 3 && ["--help", "-h"].includes(target)) {
  usage();
  process.exit(0);
}
if (process.argv.length !== 3 || !["local", "remote"].includes(target)) {
  usage();
  process.exit(2);
}

const parseEnv = (contents) => {
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
};

const isLoopbackHost = (hostname) =>
  hostname === "localhost" ||
  hostname === "[::1]" ||
  (/^127(?:\.\d{1,3}){3}$/.test(hostname) && hostname.split(".").every((part) => Number(part) <= 255));

const isSafeValue = (value) => typeof value === "string" && value.length > 0 && !/[\r\n\0]/.test(value);

const isExpectedUrl = (value, environment) => {
  if (!isSafeValue(value)) return false;

  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return false;
  if (environment === "local") return url.protocol === "http:" && isLoopbackHost(url.hostname);
  return url.protocol === "https:" && !url.port && /^[a-z0-9][a-z0-9-]*\.supabase\.co$/.test(url.hostname);
};

let values;
if (target === "local") {
  let status;
  try {
    // Keep CLI output captured: status includes credentials and must never reach stdout.
    status = execFileSync("npx", ["--no-install", "supabase", "status", "--output", "env"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    console.error("Unable to read the local Supabase status. Is Supabase running?");
    process.exit(1);
  }
  const local = parseEnv(status);
  values = { url: local.API_URL, anonKey: local.ANON_KEY, authMode: "local" };
  if (!isExpectedUrl(values.url, "local")) {
    console.error("The local Supabase status did not provide a loopback API URL.");
    process.exit(1);
  }
} else {
  if (!existsSync(remoteEnv)) {
    console.error("No remote environment file found at .env.local.remote.");
    process.exit(1);
  }
  const remote = parseEnv(readFileSync(remoteEnv, "utf8"));
  values = {
    url: remote.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: remote.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    authMode: remote.AUTH_MODE,
    appOrigin: remote.APP_ORIGIN,
    cfTeamDomain: remote.CF_ACCESS_TEAM_DOMAIN,
    cfAudience: remote.CF_ACCESS_AUD,
    serviceRoleKey: remote.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (remote.DEV_BYPASS_AUTH !== "false") {
    console.error("The remote environment must set DEV_BYPASS_AUTH=false.");
    process.exit(1);
  }
  if (values.authMode !== "cloudflare" || !isSafeValue(values.appOrigin) || !isSafeValue(values.cfTeamDomain) || !isSafeValue(values.cfAudience) || !isSafeValue(values.serviceRoleKey)) {
    console.error("The remote environment must configure AUTH_MODE=cloudflare and all Cloudflare/Supabase server credentials.");
    process.exit(1);
  }
  if (!isExpectedUrl(values.url, "remote")) {
    console.error("The remote environment did not provide a valid Supabase URL.");
    process.exit(1);
  }
  if (values.appOrigin !== "https://invitation-event-calendar.amida-solutions.uk") {
    console.error("The remote environment must set APP_ORIGIN=https://invitation-event-calendar.amida-solutions.uk.");
    process.exit(1);
  }
}

if (!isSafeValue(values.anonKey)) {
  console.error(`The ${target} environment did not provide a Supabase URL and anon key.`);
  process.exit(1);
}

const output = [
  `NEXT_PUBLIC_SUPABASE_URL=${values.url}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${values.anonKey}`,
  "DEV_BYPASS_AUTH=false",
  `AUTH_MODE=${values.authMode}`,
  ...(target === "remote" ? [
    `CF_ACCESS_TEAM_DOMAIN=${values.cfTeamDomain}`,
    `CF_ACCESS_AUD=${values.cfAudience}`,
    `APP_ORIGIN=${values.appOrigin}`,
    `SUPABASE_SERVICE_ROLE_KEY=${values.serviceRoleKey}`,
  ] : []),
].join("\n") + "\n";
const temporary = `${activeEnv}.tmp-${process.pid}`;
try {
  writeFileSync(temporary, output, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, activeEnv);
} catch {
  if (existsSync(temporary)) unlinkSync(temporary);
  console.error(`Unable to activate the ${target} Supabase environment.`);
  process.exit(1);
}
