/** Render user-message timestamps and one elapsed duration when Pi settles. */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatLocalTimestamp } from "../shared/local-time.ts";

const ENTRY_TYPE = "pi-research-engineer-turn-timing";

type TimingMarker = {
	kind: "user" | "turn";
	timestamp: number;
	durationMs?: number;
};

function formatDuration(durationMs: number): string {
	if (durationMs < 1_000) return `${durationMs}ms`;
	if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)}s`;
	const minutes = Math.floor(durationMs / 60_000);
	return `${minutes}m${Math.floor((durationMs % 60_000) / 1_000)}s`;
}

export default function turnTiming(pi: ExtensionAPI): void {
	let agentStartedAt: number | undefined;

	pi.registerEntryRenderer<TimingMarker>(ENTRY_TYPE, (entry, _options, theme) => {
		const marker = entry.data;
		if (!marker) return new Text("", 0, 0);
		const detail = marker.kind === "turn"
			? `turn ${formatDuration(marker.durationMs ?? 0)}`
			: "user message";
		return new Text(theme.fg("dim", `── ${formatLocalTimestamp(marker.timestamp)} · ${detail} ──`), 0, 0);
	});

	pi.on("message_end", (event) => {
		const message = event.message as { role?: unknown };
		if (message.role !== "user") return;
		pi.appendEntry<TimingMarker>(ENTRY_TYPE, { kind: "user", timestamp: Date.now() });
	});

	pi.on("agent_start", () => {
		// An agent cycle can contain many model/tool turns. Preserve the first
		// start time until Pi is truly idle again.
		agentStartedAt ??= Date.now();
	});

	pi.on("agent_settled", () => {
		const endedAt = Date.now();
		const startedAt = agentStartedAt ?? endedAt;
		agentStartedAt = undefined;
		pi.appendEntry<TimingMarker>(ENTRY_TYPE, {
			kind: "turn",
			timestamp: endedAt,
			durationMs: endedAt - startedAt,
		});
	});
}
