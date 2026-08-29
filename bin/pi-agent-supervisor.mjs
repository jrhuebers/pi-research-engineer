#!/usr/bin/env node

/** Keep the Pi child observable and recover from unexpected termination. */

import { appendFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

const [piBinary, ...initialArgs] = process.argv.slice(2);
if (!piBinary) {
	console.error("usage: pi-agent-supervisor.mjs <pi-binary> [pi-args...]");
	process.exit(64);
}

const stateDir = process.env.PI_RESEARCH_TMUX_STATE_DIR;
const exitLog = stateDir ? `${stateDir}/agent-exits.log` : undefined;
const restartWindowMs = 10 * 60 * 1_000;
const maxRestartsInWindow = 5;
const restartTimes = [];
let child;
let stopping = false;

function record(message) {
	const line = `[${new Date().toString()}] ${message}\n`;
	process.stderr.write(line);
	if (exitLog) {
		try {
			mkdirSync(stateDir, { recursive: true });
			appendFileSync(exitLog, line, { mode: 0o600 });
		} catch {
			// The pane output remains useful if the diagnostic log is unavailable.
		}
	}
}

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function forwardSignal(signal) {
	stopping = true;
	if (child && child.exitCode === null && child.signalCode === null) child.kill(signal);
}

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

function runChild(args) {
	return new Promise((resolve) => {
		child = spawn(piBinary, args, { stdio: "inherit", env: process.env });
		let settled = false;
		const finish = (result) => {
			if (settled) return;
			settled = true;
			child = undefined;
			resolve(result);
		};
		child.once("error", (error) => finish({ code: null, signal: null, error }));
		child.once("exit", (code, signal) => finish({ code, signal }));
	});
}

let args = initialArgs;
while (!stopping) {
	const result = await runChild(args);
	if (stopping) break;
	if (result.code === 0 && !result.signal && !result.error) {
		record("Pi exited cleanly (code 0); supervisor stopping");
		process.exit(0);
	}

	const reason = result.error
		? `spawn error: ${result.error.message}`
		: `code=${result.code ?? "null"} signal=${result.signal ?? "none"}`;
	record(`Pi exited unexpectedly (${reason})`);

	const cutoff = Date.now() - restartWindowMs;
	while (restartTimes[0] !== undefined && restartTimes[0] < cutoff) restartTimes.shift();
	if (restartTimes.length >= maxRestartsInWindow) {
		record(`restart limit reached (${maxRestartsInWindow}/${restartWindowMs / 60_000} minutes); pausing before retry`);
		await delay(60_000);
		restartTimes.length = 0;
	}
	if (stopping) break;

	restartTimes.push(Date.now());
	const backoffMs = Math.min(60_000, 1_000 * 2 ** Math.min(restartTimes.length - 1, 6));
	record(`restarting Pi with --continue in ${backoffMs}ms`);
	await delay(backoffMs);
	if (!args.includes("--continue")) args = ["--continue", ...args];
}

if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
process.exit(0);
