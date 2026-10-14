// Starts a fresh, seeded Django and a production build of Next.js for browser tests.
// Uses ports 8100/3100 so it never collides with the dev servers on 8000/3000.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, "../../backend");
const frontend = path.resolve(here, "..");
const isWindows = process.platform === "win32";
const python = path.join(backend, ".venv", isWindows ? "Scripts/python.exe" : "bin/python");
const npm = isWindows ? "npm.cmd" : "npm";
const accounts = JSON.parse(fs.readFileSync(path.join(here, "accounts.json"), "utf-8"));
const DJANGO = "http://127.0.0.1:8100";

const djangoEnv = {
  ...process.env,
  DATABASE_URL: "sqlite:///e2e.sqlite3",
  DJANGO_MEDIA_ROOT: path.join(backend, "e2e-media"),
  DJANGO_DEBUG: "true",
  DJANGO_SECRET_KEY: "e2e-only-secret-key-0123456789abcdefghijklmnopqrstuvwxyz",
  PLATFORM_DOMAIN: "localhost",
  PLATFORM_EMAIL: "hello@schoolsite.test",
  SITE_URL_TEMPLATE: "http://{host}:3100",
  SMS_FILE_PATH: path.join(backend, "e2e-sms.jsonl"),
  FRONTEND_ORIGIN: "http://127.0.0.1:3100",
  REVALIDATE_SECRET: "e2e-only-revalidate-secret",
  PROXY_SECRET: "e2e-only-proxy-secret",
};
const nextEnv = {
  ...process.env,
  DJANGO_ORIGIN: DJANGO,
  PLATFORM_DOMAIN: "localhost",
  REVALIDATE_SECRET: "e2e-only-revalidate-secret",
  PROXY_SECRET: "e2e-only-proxy-secret",
};

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: isWindows, ...options });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`)),
    );
  });
}

fs.rmSync(path.join(backend, "e2e.sqlite3"), { force: true });
fs.rmSync(djangoEnv.DJANGO_MEDIA_ROOT, { recursive: true, force: true });
fs.rmSync(djangoEnv.SMS_FILE_PATH, { force: true });
// A fresh database needs fresh page data too: Next.js keeps fetched data between builds.
fs.rmSync(path.join(frontend, ".next", "cache", "fetch-cache"), { recursive: true, force: true });
await run(python, ["manage.py", "migrate", "--noinput"], { cwd: backend, env: djangoEnv });
await run(python, ["manage.py", "createcachetable"], { cwd: backend, env: djangoEnv });
await run(python, ["manage.py", "seed_website"], { cwd: backend, env: djangoEnv });
// A second school, so every test also proves the schools stay apart. No shell: names keep their spaces.
await run(
  python,
  ["manage.py", "create_school", "--slug", "brightfuture", "--name", "Bright Future Academy", "--town", "Ejisu",
   "--region", "Ashanti Region", "--phone", "0201234567", "--email", "office@brightfuture.test",
   "--levels", "kg,lower_primary,upper_primary"],
  { cwd: backend, env: djangoEnv, shell: false },
);
// Test accounts at Sample School and on the platform team. No shell: names keep their spaces.
const createUser = (...args) =>
  run(python, ["manage.py", "create_user", ...args], { cwd: backend, env: djangoEnv, shell: false });
for (const [project, username] of Object.entries(accounts.staff)) {
  await createUser("--kind", "staff", "--school", "sample", "--username", username, "--name", `Esi Admin ${project}`,
    "--role", "Administrator", "--password", accounts.password, "--phone", accounts.phones.staff[project]);
}
for (const [project, username] of Object.entries(accounts.head_teachers)) {
  await createUser("--kind", "staff", "--school", "sample", "--username", username, "--name", `Kwame Head ${project}`,
    "--role", "Head Teacher", "--password", accounts.password, "--phone", accounts.phones.head_teachers[project]);
}
for (const [project, username] of Object.entries(accounts.accountants)) {
  await createUser("--kind", "staff", "--school", "sample", "--username", username, "--name", `Yaw Money ${project}`,
    "--role", "Accountant", "--password", accounts.password, "--phone", accounts.phones.accountants[project]);
}
for (const [project, phone] of Object.entries(accounts.parents)) {
  await createUser("--kind", "parent", "--school", "sample", "--username", phone, "--name", `Ama Mensah ${project}`);
}
for (const [project, username] of Object.entries(accounts.platform)) {
  await createUser("--kind", "platform", "--username", username, "--name", `Kojo Ops ${project}`,
    "--password", accounts.password, "--phone", accounts.phones.platform[project]);
}
for (const [project, username] of Object.entries(accounts.platform_admins)) {
  await createUser("--kind", "platform", "--username", username, "--name", `Ama Boss ${project}`,
    "--password", accounts.password, "--phone", accounts.phones.platform_admins[project]);
}
for (const [project, username] of Object.entries(accounts.platform_writers)) {
  await createUser("--kind", "platform", "--username", username, "--name", `Esi Writer ${project}`,
    "--role", "Platform Content", "--password", accounts.password, "--phone", accounts.phones.platform_writers[project]);
}

const django = spawn(python, ["manage.py", "runserver", "127.0.0.1:8100", "--noreload"], {
  cwd: backend,
  env: djangoEnv,
  stdio: "inherit",
});
for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    if ((await fetch(`${DJANGO}/api/health`)).ok) break;
  } catch {
    // not up yet
  }
  await sleep(500);
}

await run(npm, ["run", "build"], { cwd: frontend, env: nextEnv });
const next = spawn(npm, ["run", "start", "--", "-p", "3100"], {
  cwd: frontend,
  env: nextEnv,
  stdio: "inherit",
  shell: isWindows,
});

function stop() {
  django.kill();
  next.kill();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
