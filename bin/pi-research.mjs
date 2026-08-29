#!/usr/bin/env node

/** Start ordinary Pi inside a dedicated tmux session for this project. */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { resolveBundledTmux } from "@rynx-ai/tmux";

const cwd = process.cwd();
const canonicalCwd = realpathSync(cwd);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const tmuxConfig = join(packageRoot, ".tmux.conf");
const tmuxBinary = resolveBundledTmux();
if (!tmuxBinary) {
	console.error(`pi-research-engineer does not provide a bundled tmux for ${process.platform}-${process.arch}. Install on a supported platform or add a package build for this platform.`);
	process.exit(1);
}
const tmuxBinaryId = createHash("sha256").update(readFileSync(tmuxBinary)).digest("hex").slice(0, 12);
const tmuxSocket = process.env.PI_RESEARCH_TMUX_SOCKET || `pi-research-${tmuxBinaryId}`;
// -L namespaces the socket name, but tmux still places that socket under
// TMUX_TMPDIR. Keep the runtime socket inside this package's ignored state
// directory instead of inheriting a user-global tmux directory.
const tmuxTmpDir = process.env.PI_RESEARCH_TMUX_TMPDIR || join(packageRoot, ".pi", "tmux");
const agentDir = process.env.PI_RESEARCH_AGENT_DIR || join(packageRoot, ".pi", "agent");
const safeDirectoryName = (basename(canonicalCwd).replaceAll(/[^A-Za-z0-9_-]+/g, "-").replaceAll(/^-+|-+$/g, "") || "project").slice(0, 32);
const defaultSession = `pre-${safeDirectoryName}-${createHash("sha256").update(canonicalCwd).digest("hex").slice(0, 8)}`;
const session = process.env.PI_RESEARCH_TMUX_SESSION || defaultSession;
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
	// A dedicated socket prevents the pinned client from speaking an
	// incompatible tmux protocol to an existing system-tmux server.
	return ["-L", tmuxSocket, "-f", tmuxConfig, ...args];
}

function tmuxEnvironment() {
	return { ...process.env, TMUX_TMPDIR: tmuxTmpDir };
}

function environmentWithoutTmux() {
	const environment = tmuxEnvironment();
	delete environment.TMUX;
	return environment;
}

function sessionExists() {
	return spawnSync(tmuxBinary, tmuxArgs(["has-session", "-t", session]), {
		stdio: "ignore",
		env: tmuxEnvironment(),
	}).status === 0;
}

mkdirSync(stateDir, { recursive: true });
mkdirSync(tmuxTmpDir, { recursive: true, mode: 0o700 });
mkdirSync(agentDir, { recursive: true });
if (!sessionExists()) {
	const environment = [
		"PI_RESEARCH_TMUX=1",
		`PI_RESEARCH_TMUX_SESSION=${shellQuote(session)}`,
		`PI_RESEARCH_TMUX_STATE_DIR=${shellQuote(stateDir)}`,
		`PI_RESEARCH_TMUX_BIN=${shellQuote(tmuxBinary)}`,
		`PI_RESEARCH_TMUX_SOCKET=${shellQuote(tmuxSocket)}`,
		`PI_RESEARCH_TMUX_TMPDIR=${shellQuote(tmuxTmpDir)}`,
		`TMUX_TMPDIR=${shellQuote(tmuxTmpDir)}`,
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
		"new-session", "-d", "-s", session, "-n", "agent", "-c", cwd,
		command,
	]), { stdio: "inherit", env: tmuxEnvironment() });
	if (created.status !== 0) process.exit(created.status ?? 1);
}

if (detached) {
	console.log(session);
	process.exit(0);
}

// Unset TMUX for the attaching client so invoking pi-research-engineer from an existing
// tmux window creates a genuinely nested client instead of replacing the outer
// client's session. The dedicated -L socket still selects the bundled server.
const attached = spawnSync(tmuxBinary, tmuxArgs(["attach-session", "-t", session]), {
	stdio: "inherit",
	env: environmentWithoutTmux(),
});
process.exit(attached.status ?? 0);
