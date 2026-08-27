#!/usr/bin/env node

/** Start ordinary Pi inside a dedicated tmux session for this project. */

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { resolveBundledTmux } from "@rynx-ai/tmux";

const cwd = process.cwd();
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const tmuxConfig = join(packageRoot, ".tmux.conf");
const tmuxBinary = resolveBundledTmux();
if (!tmuxBinary) {
	console.error(`pi-research does not provide a bundled tmux for ${process.platform}-${process.arch}. Install on a supported platform or add a package build for this platform.`);
	process.exit(1);
}
const agentDir = process.env.PI_RESEARCH_AGENT_DIR || join(packageRoot, ".pi", "agent");
const session = process.env.PI_RESEARCH_TMUX_SESSION || "pi-research";
const stateDir = process.env.PI_RESEARCH_TMUX_STATE_DIR || join(tmpdir(), "pi-research-engineer", "tmux", session);
const piBinary = process.env.PI_RESEARCH_PI_BIN || join(packageRoot, "node_modules", ".bin", "pi");
const rawArgs = process.argv.slice(2);
const detached = rawArgs.includes("--detached");
const piArgs = rawArgs.filter((arg) => arg !== "--detached");
const outerTerminalProgram = process.env.TERM_PROGRAM;

function shellQuote(value) {
	return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

function tmuxArgs(args) {
	return ["-f", tmuxConfig, ...args];
}

function nestedClientArgs(args) {
	const socketPath = process.env.TMUX?.split(",", 1)[0];
	return [...(socketPath ? ["-S", socketPath] : []), "-f", tmuxConfig, ...args];
}

function environmentWithoutTmux() {
	const environment = { ...process.env };
	delete environment.TMUX;
	return environment;
}

function sessionExists() {
	return spawnSync(tmuxBinary, tmuxArgs(["has-session", "-t", session]), { stdio: "ignore" }).status === 0;
}

mkdirSync(stateDir, { recursive: true });
mkdirSync(agentDir, { recursive: true });
if (!sessionExists()) {
	const environment = [
		"PI_RESEARCH_TMUX=1",
		`PI_RESEARCH_TMUX_SESSION=${shellQuote(session)}`,
		`PI_RESEARCH_TMUX_STATE_DIR=${shellQuote(stateDir)}`,
		`PI_CODING_AGENT_DIR=${shellQuote(agentDir)}`,
		...(outerTerminalProgram && outerTerminalProgram !== "tmux"
			? [`TERM_PROGRAM=${shellQuote(outerTerminalProgram)}`]
			: []),
	];
	// Load this package explicitly so the isolated agent directory does not
	// need or inherit the package registration from ~/.pi/agent/settings.json.
	const commandArgs = [piBinary, "--extension", packageRoot, ...piArgs];
	const command = `exec env ${environment.join(" ")} ${commandArgs.map(shellQuote).join(" ")}`;
	const created = spawnSync(tmuxBinary, tmuxArgs([
		"new-session", "-d", "-s", session, "-n", "pi", "-c", cwd,
		command,
	]), { stdio: "inherit" });
	if (created.status !== 0) process.exit(created.status ?? 1);
}

if (detached) {
	console.log(session);
	process.exit(0);
}

// Unset TMUX for the attaching client so invoking pi-research from an existing
// tmux window creates a genuinely nested client instead of replacing the outer
// client's session. Pass the current socket explicitly so custom tmux servers
// still attach to the pi-research session created above.
const attached = spawnSync(tmuxBinary, nestedClientArgs(["attach-session", "-t", session]), {
	stdio: "inherit",
	env: environmentWithoutTmux(),
});
process.exit(attached.status ?? 0);
