/** Keep the web profile focused on search and page retrieval. */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DISABLED_TOOLS = new Set(["source_check"]);

function applyToolPolicy(pi: ExtensionAPI): void {
	const active = pi.getActiveTools();
	if (active.some((name) => DISABLED_TOOLS.has(name))) {
		pi.setActiveTools(active.filter((name) => !DISABLED_TOOLS.has(name)));
	}
}

export default function toolPolicy(pi: ExtensionAPI): void {
	// All package extensions register their tools before session_start fires.
	pi.on("session_start", () => applyToolPolicy(pi));
	// Also defend against an extension reload or another extension re-enabling one.
	pi.on("before_agent_start", () => applyToolPolicy(pi));
}
