// Development PostgreSQL on 127.0.0.1:5433, data in tools/postgres/.pgdata (spec §13).
// Runs in the foreground; Ctrl+C stops it. Creates the adss role and database on first run.
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.join(here, ".pgdata");
const port = 5433;

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres-dev-only",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"], // UTF-8 whatever the Windows code page
  onLog: () => {},
});

if (!fs.existsSync(path.join(databaseDir, "PG_VERSION"))) await pg.initialise();
await pg.start();

const client = pg.getPgClient();
await client.connect();
const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'adss'");
if (role.rowCount === 0) await client.query("CREATE ROLE adss LOGIN CREATEDB PASSWORD 'adss-dev-only'");
const database = await client.query("SELECT 1 FROM pg_database WHERE datname = 'adss'");
if (database.rowCount === 0) await client.query("CREATE DATABASE adss OWNER adss");
await client.end();

console.log(`PostgreSQL ready on 127.0.0.1:${port} (database adss). Press Ctrl+C to stop.`);

async function stop() {
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
