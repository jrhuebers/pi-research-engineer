/**
 * tmux viewer windows for work launched by Pi.
 *
 * tmux deliberately remains a viewing surface, not a process manager: the
 * background-tasks extension owns local child processes and Slurm owns
 * allocations. This avoids trying to migrate an already-running foreground
 * process into a pane, which Unix cannot
 * do. The viewer follows the authoritative job log and closes when the job exits.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ViewerKind = "local" | "slurm";

const session = process.env.PI_RESEARCH_TMUX_SESSION;
const stateRoot = process.env.PI_RESEARCH_TMUX_STATE_DIR;
const tmuxBinary = process.env.PI_RESEARCH_TMUX_BIN;
const tmuxSocket = process.env.PI_RESEARCH_TMUX_SOCKET;

function isEnabled(): boolean {
	return process.env.PI_RESEARCH_TMUX === "1" && Boolean(session && stateRoot && tmuxBinary && tmuxSocket);
}

function shellQuote(value: string): string {
	return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

function windowName(kind: ViewerKind, id: string): string {
	return kind === "local" ? `local-${id.replace(/^job-/, "")}` : `slurm-${id}`;
}

function statusPath(kind: ViewerKind, id: string): string {
	return path.join(stateRoot!, `${kind}-${id}.status`);
}

function tmux(args: string[], capture = false): string | undefined {
	try {
		const socketArgs = ["-L", tmuxSocket!, ...args];
		if (capture) {
			return execFileSync(tmuxBinary!, socketArgs, { encoding: "utf8", timeout: 5_000 }).trim();
		}
		execFileSync(tmuxBinary!, socketArgs, { stdio: "ignore", timeout: 5_000 });
		return undefined;
	} catch {
		return undefined;
	}
}

function existingWindows(): Set<string> {
	const output = tmux(["list-windows", "-t", session!, "-F", "#{window_name}"], true);
	return new Set(output?.split("\n").filter(Boolean) ?? []);
}

function viewerScript(logPath: string, statusFile: string, title: string): string {
	return [
		"set -u",
		`log=${shellQuote(logPath)}`,
		`status_file=${shellQuote(statusFile)}`,
		`title=${shellQuote(title)}`,
		"printf '%s\\n' \"=== $title ===\" \"Log: $log\"",
		"while [ ! -e \"$log\" ]; do printf '%s\\n' '[waiting for log...]'; sleep 1; done",
		"tail -n +1 -F \"$log\" &",
		"tail_pid=$!",
		"cleanup() { kill $tail_pid 2>/dev/null || true; }",
		"trap cleanup EXIT",
		"trap '' INT",
		"while :; do",
		"  status=$(cat \"$status_file\" 2>/dev/null || printf RUNNING)",
		"  case \"$status\" in",
		"    COMPLETED) sleep 0.2; printf '%s\\n' '=== completed ==='; exit 0 ;;",
		"    FAILED|CANCELLED|KILLED|TIMEOUT|TIMED_OUT) sleep 0.2; printf '%s\\n' \"=== $status ===\"; exit 1 ;;",
		"  esac",
		"  sleep 1",
		"done",
	].join("\n");
}

function ensureViewer(kind: ViewerKind, id: string, name: string, logPath: string): void {
	if (!isEnabled()) return;
	try {
		fs.mkdirSync(stateRoot!, { recursive: true });
		const statusFile = statusPath(kind, id);
		fs.writeFileSync(statusFile, "RUNNING\n");
		const nameForTmux = windowName(kind, id);
		if (existingWindows().has(nameForTmux)) return;
		const command = `exec bash -lc ${shellQuote(viewerScript(logPath, statusFile, `${kind} ${id}: ${name}`))}`;
		const windowId = tmux([
			"new-window", "-d", "-P", "-F", "#{window_id}", "-t", session!, "-n", nameForTmux,
			command,
		], true);
		if (windowId) tmux(["set-window-option", "-t", windowId, "remain-on-exit", "off"]);
	} catch {
		// A viewer is an optional human convenience; never disturb the job itself.
	}
}

function markTerminal(kind: ViewerKind, id: string, status: string): void {
	if (!isEnabled()) return;
	try {
		fs.mkdirSync(stateRoot!, { recursive: true });
		fs.writeFileSync(statusPath(kind, id), `${status.toUpperCase()}\n`);
		tmux(["kill-window", "-t", `${session}:${windowName(kind, id)}`]);
	} catch {
		// See ensureViewer: lifecycle monitoring remains authoritative.
	}
}

function textContent(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content
		.filter((part): part is { type: string; text: string } =>
			typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string",
		)
		.map((part) => part.text)
		.join("\n");
}

export default function tmuxViewers(pi: ExtensionAPI): void {
	if (!isEnabled()) return;

	pi.events.on("background-tasks:started", (event: unknown) => {
		const value = event as { id?: unknown; description?: unknown; logPath?: unknown };
		if (typeof value.id === "string" && typeof value.description === "string" && typeof value.logPath === "string") {
			ensureViewer("local", value.id, value.description, value.logPath);
		}
	});

	pi.events.on("background-tasks:finished", (event: unknown) => {
		const value = event as { id?: unknown; status?: unknown };
		if (typeof value.id === "string" && typeof value.status === "string") {
			markTerminal("local", value.id, value.status);
		}
	});

	pi.on("tool_result", (event) => {
		if (event.toolName !== "slurm_submit") return;
		const match = textContent(event.content).match(/Submitted\s+(.+?)\s+as Slurm job\s+(\d+(?:_\d+)?)[\s\S]*?log:\s*(\S+)/);
		if (match) ensureViewer("slurm", match[2], match[1].trim(), match[3]);
	});

	pi.on("message_end", (event) => {
		const message = event.message as { customType?: string; details?: unknown; content?: unknown } | undefined;
		if (!message) return;
		if (message.customType === "pi-research-engineer-slurm") {
			const details = message.details as { jobId?: unknown; status?: unknown } | undefined;
			if (typeof details?.jobId === "string" && typeof details.status === "string") {
				if (["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"].includes(details.status.toUpperCase())) {
					markTerminal("slurm", details.jobId, details.status);
				}
			}
		}
	});
}
