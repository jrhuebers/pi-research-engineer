#!/usr/bin/env node

/** Start ordinary Pi inside a dedicated tmux session for this project. */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const cwd = process.cwd();
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const tmuxConfig = join(cwd, ".tmux.conf");
const session = process.env.PI_RESEARCH_TMUX_SESSION || "pi-research";
const stateDir = process.env.PI_RESEARCH_TMUX_STATE_DIR || join(tmpdir(), "pi-research-engineer", "tmux", session);
const piBinary = process.env.PI_RESEARCH_PI_BIN || join(packageRoot, "node_modules", ".bin", "pi");
const rawArgs = process.argv.slice(2);
const detached = rawArgs.includes("--detached");
const piArgs = rawArgs.filter((arg) => arg !== "--detached");

function shellQuote(value) {
	return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

function tmuxArgs(args) {
	return ["-f", tmuxConfig, ...args];
}

function sessionExists() {
	return spawnSync("tmux", tmuxArgs(["has-session", "-t", session]), { stdio: "ignore" }).status === 0;
}

mkdirSync(stateDir, { recursive: true });
if (!sessionExists()) {
	const command = `exec env PI_RESEARCH_TMUX=1 PI_RESEARCH_TMUX_SESSION=${shellQuote(session)} PI_RESEARCH_TMUX_STATE_DIR=${shellQuote(stateDir)} ${[piBinary, ...piArgs].map(shellQuote).join(" ")}`;
	const created = spawnSync("tmux", tmuxArgs([
		"new-session", "-d", "-s", session, "-n", "pi", "-c", cwd,
		command,
	]), { stdio: "inherit" });
	if (created.status !== 0) process.exit(created.status ?? 1);
}

if (detached) {
	console.log(session);
	process.exit(0);
}

if (process.env.TMUX) {
	// Avoid a nested tmux client. The current client can switch back with its
	// normal session chooser or `tmux switch-client`.
	execFileSync("tmux", tmuxArgs(["switch-client", "-t", session]), { stdio: "inherit" });
} else {
	const attached = spawnSync("tmux", tmuxArgs(["attach-session", "-t", session]), { stdio: "inherit" });
	process.exit(attached.status ?? 0);
}
