#!/usr/bin/env node

/**
 * Local-only, newline-delimited JSON controller for one Sway workspace.
 *
 * The process must run inside the isolated Linux VM / nested Sway session.
 * It binds to the Sway IPC socket selected at startup and accepts connections
 * only through a mode-0600 Unix socket. Do not run it against a host desktop.
 */

import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const MAX_REQUEST_BYTES = 64 * 1024;

function usage() {
	console.error(`Usage: pre-workspace [options]

Run inside the isolated Sway VM:
  --socket PATH             API Unix socket (default: $XDG_RUNTIME_DIR/pre-workspace.sock)
  --sway-socket PATH        Sway IPC socket (default: $SWAYSOCK)
  --workspace NAME          Managed workspace (default: pre-agent)
  --allow-root PATH         Permitted file/PDF root; repeatable (default: current directory)
  --editor PROGRAM          Editor executable (default: code)
  --pdf-viewer PROGRAM      PDF viewer executable (default: zathura)
  --terminal PROGRAM        Terminal executable (default: foot)
  --help`);
}

function parseArgs(argv) {
	const runtime = process.env.XDG_RUNTIME_DIR;
	const config = {
		socket: runtime ? `${runtime}/pre-workspace.sock` : "/tmp/pre-workspace.sock",
		swaySocket: process.env.SWAYSOCK,
		workspace: "pre-agent",
		allowRoots: [],
		editor: "code",
		pdfViewer: "zathura",
		terminal: "foot",
	};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--help") { usage(); process.exit(0); }
		if (!arg.startsWith("--")) throw new Error(`unknown argument: ${arg}`);
		const value = argv[++i];
		if (!value) throw new Error(`${arg} requires a value`);
		switch (arg) {
			case "--socket": config.socket = value; break;
			case "--sway-socket": config.swaySocket = value; break;
			case "--workspace": config.workspace = value; break;
			case "--allow-root": config.allowRoots.push(resolve(value)); break;
			case "--editor": config.editor = value; break;
			case "--pdf-viewer": config.pdfViewer = value; break;
			case "--terminal": config.terminal = value; break;
			default: throw new Error(`unknown argument: ${arg}`);
		}
	}
	if (!config.swaySocket) throw new Error("SWAYSOCK is required; start this inside the isolated Sway session");
	if (!/^[A-Za-z0-9_.:-]+$/.test(config.workspace)) throw new Error("workspace must contain only letters, digits, _, ., :, or -");
	if (config.allowRoots.length === 0) config.allowRoots.push(process.cwd());
	return config;
}

function run(program, args, options = {}) {
	const result = spawnSync(program, args, { encoding: "utf8", ...options });
	if (result.error) throw new Error(`${program}: ${result.error.message}`);
	if (result.status !== 0) throw new Error(`${program} exited ${result.status}: ${(result.stderr || result.stdout).trim()}`);
	return result.stdout;
}

function sway(config, command) {
	return run("swaymsg", ["-s", config.swaySocket, command]);
}

function tree(config) {
	return JSON.parse(run("swaymsg", ["-s", config.swaySocket, "-r", "-t", "get_tree"]));
}

function findWorkspace(node, workspace) {
	if (node.type === "workspace" && node.name === workspace) return node;
	for (const child of [...(node.nodes ?? []), ...(node.floating_nodes ?? [])]) {
		const found = findWorkspace(child, workspace);
		if (found) return found;
	}
	return undefined;
}

function collectWindows(node, out = []) {
	for (const child of [...(node.nodes ?? []), ...(node.floating_nodes ?? [])]) {
		if (child.app_id || child.window || child.window_properties?.class) {
			out.push({
				id: child.id,
				name: child.name ?? "",
				appId: child.app_id ?? child.window_properties?.class ?? null,
				focused: Boolean(child.focused),
				floating: child.floating ?? "auto_off",
				fullscreen: Boolean(child.fullscreen_mode),
				rect: child.rect,
			});
		}
		collectWindows(child, out);
	}
	return out;
}

function workspaceState(config) {
	const current = findWorkspace(tree(config), config.workspace);
	return {
		workspace: config.workspace,
		exists: Boolean(current),
		layout: current?.layout ?? null,
		focused: Boolean(current?.focused),
		windows: current ? collectWindows(current) : [],
	};
}

function ensureWorkspace(config) {
	sway(config, `workspace ${config.workspace}`);
	const state = workspaceState(config);
	if (!state.exists) throw new Error(`Sway did not create workspace ${config.workspace}`);
	return state;
}

function workspaceWindow(config, id) {
	if (!Number.isSafeInteger(id) || id <= 0) throw new Error("id must be a positive integer");
	const window = ensureWorkspace(config).windows.find((candidate) => candidate.id === id);
	if (!window) throw new Error(`container ${id} is not in managed workspace ${config.workspace}`);
	return window;
}

function allowedPath(config, value) {
	if (typeof value !== "string" || !value) throw new Error("path must be a non-empty string");
	const path = resolve(value);
	const allowed = config.allowRoots.some((root) => path === root || path.startsWith(`${root}/`));
	if (!allowed) throw new Error(`path is outside allowed roots: ${path}`);
	if (!existsSync(path)) throw new Error(`path does not exist: ${path}`);
	return path;
}

function launch(program, args) {
	const child = spawn(program, args, { detached: true, stdio: "ignore" });
	child.unref();
	return { pid: child.pid, program: basename(program) };
}

function requireArgv(value) {
	if (value === undefined) return [];
	if (!Array.isArray(value) || !value.every((part) => typeof part === "string" && part.length > 0)) {
		throw new Error("argv must be an array of non-empty strings");
	}
	return value;
}

function handle(config, request) {
	if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("request must be an object");
	const { method } = request;
	if (typeof method !== "string") throw new Error("method must be a string");
	switch (method) {
		case "state": return workspaceState(config);
		case "workspace": return ensureWorkspace(config);
		case "focus": {
			workspaceWindow(config, request.id);
			sway(config, `[con_id=${request.id}] focus`);
			return workspaceState(config);
		}
		case "split": {
			if (request.direction !== "horizontal" && request.direction !== "vertical") throw new Error("direction must be horizontal or vertical");
			if (request.id !== undefined) { workspaceWindow(config, request.id); sway(config, `[con_id=${request.id}] focus`); }
			else ensureWorkspace(config);
			sway(config, request.direction === "horizontal" ? "split h" : "split v");
			return workspaceState(config);
		}
		case "open_file": {
			ensureWorkspace(config);
			const path = allowedPath(config, request.path);
			return { ...launch(config.editor, [path]), path, state: workspaceState(config) };
		}
		case "open_pdf": {
			ensureWorkspace(config);
			const path = allowedPath(config, request.path);
			return { ...launch(config.pdfViewer, [path]), path, state: workspaceState(config) };
		}
		case "open_terminal": {
			ensureWorkspace(config);
			const argv = requireArgv(request.argv);
			const title = typeof request.title === "string" && request.title ? request.title : "Pre workspace";
			const args = ["--title", title, ...(argv.length ? ["-e", ...argv] : [])];
			return { ...launch(config.terminal, args), argv, state: workspaceState(config) };
		}
		default: throw new Error(`unsupported method: ${method}`);
	}
}

export function startWorkspaceServer(config) {
	// Validate the IPC endpoint before accepting requests. This prevents a
	// mistakenly configured host SWAYSOCK from becoming a controllable target.
	tree(config);
	ensureWorkspace(config);
	mkdirSync(dirname(config.socket), { recursive: true, mode: 0o700 });
	rmSync(config.socket, { force: true });
	const server = createServer((connection) => {
		let buffer = "";
		connection.setEncoding("utf8");
		connection.on("data", (chunk) => {
			buffer += chunk;
			if (Buffer.byteLength(buffer) > MAX_REQUEST_BYTES) { connection.end(JSON.stringify({ ok: false, error: "request exceeds 64 KiB" }) + "\n"); return; }
			let index;
			while ((index = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
				if (!line.trim()) continue;
				try { connection.write(JSON.stringify({ ok: true, result: handle(config, JSON.parse(line)) }) + "\n"); }
				catch (error) { connection.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) + "\n"); }
			}
		});
	});
	server.listen(config.socket, () => {
		chmodSync(config.socket, 0o600);
		console.log(JSON.stringify({ event: "ready", socket: config.socket, swaySocket: config.swaySocket, workspace: config.workspace, allowRoots: config.allowRoots }));
	});
	const stop = () => server.close(() => { rmSync(config.socket, { force: true }); process.exit(0); });
	process.on("SIGINT", stop); process.on("SIGTERM", stop);
	return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	try { startWorkspaceServer(parseArgs(process.argv.slice(2))); }
	catch (error) { console.error(`pre-workspace: ${error instanceof Error ? error.message : error}`); process.exit(1); }
}
