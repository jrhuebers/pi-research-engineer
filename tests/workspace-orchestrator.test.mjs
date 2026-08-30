import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startWorkspaceServer } from "../bin/pre-workspace.mjs";

const root = mkdtempSync(join(tmpdir(), "pre-workspace-test-"));
const bin = join(root, "bin");
const calls = join(root, "calls.log");
const allowed = join(root, "project");
const socket = join(root, "workspace.sock");
await import("node:fs/promises").then(({ mkdir, writeFile }) => Promise.all([mkdir(bin), mkdir(allowed), writeFile(join(allowed, "note.txt"), "hello")]));

const swaymsg = join(bin, "swaymsg");
writeFileSync(swaymsg, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> ${JSON.stringify(calls)}
if [[ " $* " == *" get_tree "* ]]; then
  cat <<'JSON'
{"type":"root","nodes":[{"type":"output","nodes":[{"type":"workspace","name":"pre-agent","layout":"splith","focused":true,"nodes":[{"id":42,"name":"editor","app_id":"code","focused":true,"floating":"auto_off","fullscreen_mode":0,"rect":{"x":0,"y":0,"width":800,"height":600},"nodes":[],"floating_nodes":[]}],"floating_nodes":[]}],"floating_nodes":[]}],"floating_nodes":[]}
JSON
else
  echo '[]'
fi
`);
chmodSync(swaymsg, 0o755);
const terminal = join(bin, "terminal");
writeFileSync(terminal, `#!/usr/bin/env bash\nprintf 'terminal %s\\n' "$*" >> ${JSON.stringify(calls)}\n`);
chmodSync(terminal, 0o755);
process.env.PATH = `${bin}:${process.env.PATH}`;

function rpc(payload) {
	return new Promise((resolve, reject) => {
		const client = createConnection(socket);
		let data = "";
		client.setEncoding("utf8");
		client.on("connect", () => client.write(`${JSON.stringify(payload)}\n`));
		client.on("data", (chunk) => { data += chunk; if (data.includes("\n")) { client.end(); resolve(JSON.parse(data)); } });
		client.on("error", reject);
	});
}

const server = startWorkspaceServer({ socket, swaySocket: "/tmp/fake-sway.sock", workspace: "pre-agent", allowRoots: [allowed], editor: terminal, pdfViewer: terminal, terminal });
if (!server.listening) await once(server, "listening");
try {
	const state = await rpc({ method: "state" });
	assert.equal(state.ok, true);
	assert.deepEqual(state.result.windows.map((window) => window.id), [42]);

	const focus = await rpc({ method: "focus", id: 42 });
	assert.equal(focus.ok, true);
	const forbidden = await rpc({ method: "focus", id: 7 });
	assert.equal(forbidden.ok, false);
	assert.match(forbidden.error, /not in managed workspace/);

	const file = await rpc({ method: "open_file", path: join(allowed, "note.txt") });
	assert.equal(file.ok, true);
	const outside = await rpc({ method: "open_pdf", path: "/etc/passwd" });
	assert.equal(outside.ok, false);
	assert.match(outside.error, /outside allowed roots/);

	const terminalResult = await rpc({ method: "open_terminal", argv: ["tail", "-f", "experiment.log"], title: "Logs" });
	assert.equal(terminalResult.ok, true);
	assert.deepEqual(terminalResult.result.argv, ["tail", "-f", "experiment.log"]);
	assert.match(readFileSync(calls, "utf8"), /\[con_id=42\] focus/);
	console.log("workspace orchestrator tests passed");
} finally {
	await new Promise((resolve) => server.close(resolve));
	rmSync(root, { recursive: true, force: true });
}
