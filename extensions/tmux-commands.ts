/** Commands for controlling the current isolated tmux client. */

import { execFileSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const session = process.env.PI_RESEARCH_TMUX_SESSION;
const tmuxBinary = process.env.PI_RESEARCH_TMUX_BIN;
const tmuxSocket = process.env.PI_RESEARCH_TMUX_SOCKET;

function isEnabled(): boolean {
	return process.env.PI_RESEARCH_TMUX === "1" && Boolean(session && tmuxBinary && tmuxSocket);
}

function tmux(args: string[], capture = false): string | undefined {
	try {
		if (capture) {
			return execFileSync(tmuxBinary!, ["-L", tmuxSocket!, ...args], {
				encoding: "utf8",
				timeout: 5_000,
			}).trim();
		}
		execFileSync(tmuxBinary!, ["-L", tmuxSocket!, ...args], {
			stdio: "ignore",
			timeout: 5_000,
		});
		return "ok";
	} catch {
		return undefined;
	}
}

export default function tmuxCommands(pi: ExtensionAPI): void {
	if (!isEnabled()) return;

	pi.registerCommand("detach", {
		description: "Detach this terminal from the tmux session; leave Pi and jobs running",
		handler: async (_args, ctx) => {
			const pane = process.env.TMUX_PANE;
			const client = pane
				? tmux(["display-message", "-p", "-t", pane, "#{client_name}"], true)
				: undefined;
			if (!client) {
				ctx.ui.notify("Could not identify the current tmux client", "error");
				return;
			}
			if (!tmux(["detach-client", "-t", client])) {
				ctx.ui.notify("Could not detach from the tmux session", "error");
			}
		},
	});
}
