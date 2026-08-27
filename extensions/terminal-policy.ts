/** Preserve Apple Terminal's native modifier fallback while Pi runs in tmux. */

import { execFileSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function restoreOuterTerminalProgram(): void {
	if (
		process.platform !== "darwin" ||
		process.env.PI_RESEARCH_TMUX !== "1" ||
		process.env.TERM_PROGRAM !== "tmux"
	) return;

	try {
		const tmuxBinary = process.env.PI_RESEARCH_TMUX_BIN;
		const tmuxSocket = process.env.PI_RESEARCH_TMUX_SOCKET;
		if (!tmuxBinary || !tmuxSocket) return;
		const setting = execFileSync(tmuxBinary, ["-L", tmuxSocket, "show-environment", "-g", "TERM_PROGRAM"], {
			encoding: "utf8",
		}).trim();
		const outerTerminal = setting.startsWith("TERM_PROGRAM=")
			? setting.slice("TERM_PROGRAM=".length)
			: undefined;
		if (outerTerminal === "Apple_Terminal") {
			// pi-tui checks this dynamically when a plain Return arrives and uses
			// its native macOS helper to distinguish Shift+Enter.
			process.env.TERM_PROGRAM = outerTerminal;
		}
	} catch {
		// Keep tmux's environment unchanged if the outer terminal is unknown.
	}
}

export default function terminalPolicy(_pi: ExtensionAPI): void {
	restoreOuterTerminalProgram();
}
