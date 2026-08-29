/** Render a durable timestamp and elapsed duration after every Pi turn. */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const ENTRY_TYPE = "pi-research-engineer-turn-timing";

type TimingMarker = {
	kind: "user" | "turn";
	timestamp: number;
	durationMs?: number;
};

function formatTimestamp(timestamp: number): string {
	// ISO timestamps are unambiguous across long-running and remote workflows.
	return new Date(timestamp).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

function formatDuration(durationMs: number): string {
	if (durationMs < 1_000) return `${durationMs}ms`;
	if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)}s`;
	const minutes = Math.floor(durationMs / 60_000);
	return `${minutes}m${Math.floor((durationMs % 60_000) / 1_000)}s`;
}

export default function turnTiming(pi: ExtensionAPI): void {
	const startedAtByTurn = new Map<number, number>();

	pi.registerEntryRenderer<TimingMarker>(ENTRY_TYPE, (entry, _options, theme) => {
		const marker = entry.data;
		if (!marker) return new Text("", 0, 0);
		const detail = marker.kind === "turn"
			? `turn ${formatDuration(marker.durationMs ?? 0)}`
			: "user message";
		return new Text(theme.fg("dim", `── ${formatTimestamp(marker.timestamp)} · ${detail} ──`), 0, 0);
	});

	pi.on("message_end", (event) => {
		const message = event.message as { role?: unknown };
		if (message.role !== "user") return;
		pi.appendEntry<TimingMarker>(ENTRY_TYPE, { kind: "user", timestamp: Date.now() });
	});

	pi.on("turn_start", (event) => {
		startedAtByTurn.set(event.turnIndex, Date.now());
	});

	pi.on("turn_end", (event) => {
		const endedAt = Date.now();
		const startedAt = startedAtByTurn.get(event.turnIndex) ?? endedAt;
		startedAtByTurn.delete(event.turnIndex);
		pi.appendEntry<TimingMarker>(ENTRY_TYPE, {
			kind: "turn",
			timestamp: endedAt,
			durationMs: endedAt - startedAt,
		});
	});
}
