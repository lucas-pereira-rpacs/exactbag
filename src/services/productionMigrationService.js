const { execFile } = require("child_process");
const path = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

async function runProductionMigrations() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const prismaCli = require.resolve("prisma/build/index.js");
  const projectRoot = path.resolve(__dirname, "../..");

  console.log("[ServerInit] Applying pending Prisma migrations...");
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [prismaCli, "migrate", "deploy"],
    {
      cwd: projectRoot,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.warn(stderr.trim());
  console.log("[ServerInit] Prisma migrations are up to date.");
}

module.exports = { runProductionMigrations };
