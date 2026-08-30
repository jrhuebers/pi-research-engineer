/** Control an explicitly forwarded local Sway workspace through its Unix socket. */

import { createConnection } from "node:net";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_RESPONSE_BYTES = 256 * 1024;

type WorkspaceResponse = { ok: true; result: unknown } | { ok: false; error: string };

function request(socketPath: string, payload: Record<string, unknown>): Promise<WorkspaceResponse> {
	return new Promise((resolve, reject) => {
		const socket = createConnection(socketPath);
		let response = "";
		const timeout = setTimeout(() => {
			socket.destroy();
			reject(new Error("workspace controller did not respond within 10 seconds"));
		}, 10_000);
		socket.setEncoding("utf8");
		socket.once("connect", () => socket.write(`${JSON.stringify(payload)}\n`));
		socket.on("data", (chunk) => {
			response += chunk;
			if (Buffer.byteLength(response) > MAX_RESPONSE_BYTES) {
				socket.destroy();
				reject(new Error("workspace controller response exceeds 256 KiB"));
				return;
			}
			const newline = response.indexOf("\n");
			if (newline < 0) return;
			clearTimeout(timeout);
			socket.end();
			try { resolve(JSON.parse(response.slice(0, newline)) as WorkspaceResponse); }
			catch { reject(new Error("workspace controller returned invalid JSON")); }
		});
		socket.once("error", (error) => { clearTimeout(timeout); reject(new Error(`workspace controller unavailable at ${socketPath}: ${error.message}`)); });
	});
}

export default function workspace(pi: ExtensionAPI): void {
	const socketPath = process.env.PRE_WORKSPACE_SOCKET;
	// The remote agent only receives this capability when an operator has
	// deliberately created an SSH Unix-socket forward to the local VM.
	if (!socketPath) return;

	pi.registerTool({
		name: "workspace",
		label: "Local Sway Workspace",
		description: "Control the explicitly forwarded, isolated local Sway workspace. It cannot control the remote host or the user’s normal desktop.",
		promptSnippet: "Control the forwarded isolated local Sway workspace",
		promptGuidelines: [
			"Use workspace only for the explicitly forwarded local Sway VM; state returns JSON, not screenshots.",
			"Open only project files within the local controller's configured allowed roots.",
		],
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("state"), Type.Literal("workspace"), Type.Literal("focus"), Type.Literal("split"),
				Type.Literal("open_file"), Type.Literal("open_pdf"), Type.Literal("open_terminal"),
			]),
			id: Type.Optional(Type.Integer({ minimum: 1, description: "Managed workspace container ID for focus or split." })),
			direction: Type.Optional(Type.Union([Type.Literal("horizontal"), Type.Literal("vertical")])),
			path: Type.Optional(Type.String({ description: "Allowed local project path for open_file or open_pdf." })),
			argv: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: "Optional command argv for open_terminal; no shell parsing is performed." })),
			title: Type.Optional(Type.String({ description: "Optional terminal window title." })),
		}),
		async execute(_toolCallId, raw) {
			const params = raw as { action: string; id?: number; direction?: string; path?: string; argv?: string[]; title?: string };
			const method = params.action;
			const payload: Record<string, unknown> = { method };
			if (params.id !== undefined) payload.id = params.id;
			if (params.direction !== undefined) payload.direction = params.direction;
			if (params.path !== undefined) payload.path = params.path;
			if (params.argv !== undefined) payload.argv = params.argv;
			if (params.title !== undefined) payload.title = params.title;
			const response = await request(socketPath, payload);
			if (!response.ok) throw new Error(response.error);
			return { content: [{ type: "text", text: JSON.stringify(response.result, null, 2) }], details: response.result };
		},
	});
}
