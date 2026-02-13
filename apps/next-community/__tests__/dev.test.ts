import { type ChildProcess, spawn } from "node:child_process";
import { expect, test } from "vitest";
import path from "node:path";
import treeKill from "tree-kill";
import { promisify } from "node:util";

const treeKillAsync = promisify(treeKill);

test("Next.js dev server starts", async () => {
  let devProcess: ChildProcess | null = null;
  const testPort = 10000 + Math.floor(Math.random() * 50000);

  try {
    devProcess = spawn("yarn", ["dev", "-p", String(testPort)], {
      cwd: path.resolve(__dirname, ".."),
      stdio: "pipe",
      shell: true,
    });

    let output = "";
    devProcess.stdout?.on("data", (data) => {
      output += data.toString();
    });
    devProcess.stderr?.on("data", (data) => {
      output += data.toString();
    });

    // Wait for the server to start (adjust timeout as needed)
    // Next.js 16 with Turbopack emits "Starting..." instead of "Ready in"
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for dev server to start"));
      }, 30000);

      const check = (data: Buffer) => {
        const str = data.toString();
        if (
          str.includes("Ready in") || str.includes("Starting...") ||
          str.includes("Local:")
        ) {
          clearTimeout(timeout);
          resolve();
        }
      };

      devProcess?.stdout?.on("data", check);
      devProcess?.stderr?.on("data", check);
    });

    // Check for expected output
    expect(output).toContain("Next.js 16");
    expect(output).toContain("Local:");

    // Additional checks can be added here
  } finally {
    // Ensure the dev server is killed and wait for it to fully terminate
    if (devProcess?.pid) {
      try {
        await treeKillAsync(devProcess.pid);
      } catch (error) {
        console.error("Failed to kill process:", error);
      }
    }
  }
}, 60000); // Increased timeout to account for both startup and shutdown
