/**
 * Set a research-engineering-friendly default for pi-patty-bg-tasks.
 * Explicit tool-call timeouts always win.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const FOREGROUND_TIMEOUT_SECONDS = 30;

export default function backgroundPolicy(pi: ExtensionAPI): void {
	pi.on("tool_call", (event) => {
		if (event.toolName !== "bash") return;
		if (typeof event.input.timeout !== "number") {
			event.input.timeout = FOREGROUND_TIMEOUT_SECONDS;
		}
	});
}
