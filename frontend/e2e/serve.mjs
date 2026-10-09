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
const DJANGO = "http://127.0.0.1:8100";

const djangoEnv = {
  ...process.env,
  DATABASE_URL: "sqlite:///e2e.sqlite3",
  DJANGO_MEDIA_ROOT: path.join(backend, "e2e-media"),
  DJANGO_DEBUG: "true",
  DJANGO_SECRET_KEY: "e2e-only-secret-key-0123456789abcdefghijklmnopqrstuvwxyz",
  DJANGO_ALLOWED_HOSTS: "127.0.0.1,localhost",
};
const nextEnv = { ...process.env, DJANGO_ORIGIN: DJANGO, SITE_URL: "http://127.0.0.1:3100" };

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
await run(python, ["manage.py", "migrate", "--noinput"], { cwd: backend, env: djangoEnv });
await run(python, ["manage.py", "createcachetable"], { cwd: backend, env: djangoEnv });
await run(python, ["manage.py", "seed_website"], { cwd: backend, env: djangoEnv });

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
