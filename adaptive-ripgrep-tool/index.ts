import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const configPath = fileURLToPath(new URL("./config.json", import.meta.url));
const DEFAULT_MAX_DETAIL_CHARACTERS = 12_000;
const DEFAULT_MAX_DETAIL_LINES = 100;
const DEFAULT_MAX_SUMMARY_FILES = 200;

type Config = {
	maxDetailCharacters: number;
	maxDetailLines: number;
	maxSummaryFiles: number;
};

type SearchParams = {
	pattern: string;
	paths?: string[];
	globs?: string[];
	case_sensitive?: boolean;
	fixed_string?: boolean;
	word_regexp?: boolean;
	context_lines?: number;
	only_matching?: boolean;
	include_hidden?: boolean;
	no_ignore?: boolean;
};

type RunResult = {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	truncated: boolean;
};

type FileSummary = {
	path: string;
	matches: number;
	lines: number | undefined;
	characters: number | undefined;
};

function positiveInteger(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function loadConfig(): Config {
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(configPath, "utf8"));
	} catch (error) {
		throw new Error(`could not read ${configPath}: ${(error as Error).message}`);
	}
	const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
	return {
		maxDetailCharacters: positiveInteger(value.max_detail_characters, DEFAULT_MAX_DETAIL_CHARACTERS),
		maxDetailLines: positiveInteger(value.max_detail_lines, DEFAULT_MAX_DETAIL_LINES),
		maxSummaryFiles: positiveInteger(value.max_summary_files, DEFAULT_MAX_SUMMARY_FILES),
	};
}

function characterCount(text: string): number {
	return Array.from(text).length;
}

function takeCharacters(text: string, count: number): string {
	return Array.from(text).slice(0, count).join("");
}

function formatQuantity(value: number | undefined): string {
	if (value === undefined) return "?";
	const absolute = Math.abs(value);
	if (absolute < 1_000) return value.toLocaleString();
	if (absolute < 10_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
	if (absolute < 1_000_000) return `${Math.round(value / 1_000)}k`;
	if (absolute < 10_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	return `${Math.round(value / 1_000_000)}M`;
}

function buildArgs(params: SearchParams, detail: boolean): string[] {
	const args = ["--color=never"];
	if (detail) args.push("--line-number");
	if (params.case_sensitive === false) args.push("--ignore-case");
	if (params.fixed_string) args.push("--fixed-strings");
	if (params.word_regexp) args.push("--word-regexp");
	if (params.only_matching) args.push("--only-matching");
	if (params.include_hidden) args.push("--hidden");
	if (params.no_ignore) args.push("--no-ignore");
	if (detail && params.context_lines !== undefined && params.context_lines > 0) args.push("--context", String(params.context_lines));
	for (const glob of params.globs ?? []) args.push("--glob", glob);
	if (!detail) args.push("--count-matches", "--no-heading");
	args.push("--", params.pattern, ...(params.paths?.length ? params.paths : ["."]));
	return args;
}

function runRg(args: string[], cwd: string, outputLimit: number | undefined, signal: AbortSignal): Promise<RunResult> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn("rg", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		let truncated = false;
		let settled = false;

		const stop = () => {
			if (!settled) child.kill("SIGTERM");
		};
		if (signal.aborted) stop();
		signal.addEventListener("abort", stop, { once: true });
		child.stdout.on("data", (chunk: Buffer | string) => {
			if (truncated) return;
			stdout += chunk.toString();
			if (outputLimit !== undefined && characterCount(stdout) > outputLimit) {
				stdout = takeCharacters(stdout, outputLimit);
				truncated = true;
				child.kill("SIGTERM");
			}
		});
		child.stderr.on("data", (chunk: Buffer | string) => {
			if (characterCount(stderr) < 4_000) stderr += chunk.toString();
		});
		child.once("error", (error) => {
			if (settled) return;
			settled = true;
			signal.removeEventListener("abort", stop);
			reject(error);
		});
		child.once("close", (exitCode) => {
			if (settled) return;
			settled = true;
			signal.removeEventListener("abort", stop);
			resolvePromise({ stdout, stderr, exitCode, truncated });
		});
	});
}

function isTargetedFileList(paths: string[] | undefined, cwd: string): boolean {
	if (!paths || paths.length === 0 || paths.length > 8) return false;
	return paths.every((path) => {
		try {
			return statSync(resolve(cwd, path)).isFile();
		} catch {
			return false;
		}
	});
}

function parseCountOutput(output: string): Array<{ path: string; matches: number }> {
	const results: Array<{ path: string; matches: number }> = [];
	for (const line of output.split(/\r?\n/)) {
		const match = line.match(/^(.*):(\d+)$/);
		if (!match) continue;
		results.push({ path: match[1]!, matches: Number(match[2]) });
	}
	return results;
}

function fileStats(filePath: string, cwd: string): { lines: number; characters: number } | undefined {
	try {
		const text = readFileSync(isAbsolute(filePath) ? filePath : resolve(cwd, filePath), "utf8");
		const lines = text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length - (/(?:\r\n|\r|\n)$/.test(text) ? 1 : 0);
		return { lines, characters: characterCount(text) };
	} catch {
		return undefined;
	}
}

function displayPath(filePath: string, cwd: string): string {
	if (!isAbsolute(filePath)) return filePath;
	const relativePath = relative(cwd, filePath);
	return relativePath && !relativePath.startsWith("../") ? relativePath : filePath;
}

function summarizeFiles(countOutput: string, cwd: string, maxFiles: number): { rows: FileSummary[]; totalMatches: number; totalFiles: number } {
	const parsed = parseCountOutput(countOutput);
	const rows = parsed
		.map(({ path, matches }) => {
			const stats = fileStats(path, cwd);
			return { path: displayPath(path, cwd), matches, lines: stats?.lines, characters: stats?.characters };
		})
		.sort((a, b) => b.matches - a.matches || (b.characters ?? 0) - (a.characters ?? 0) || a.path.localeCompare(b.path));
	return {
		rows: rows.slice(0, maxFiles),
		totalMatches: parsed.reduce((sum, row) => sum + row.matches, 0),
		totalFiles: parsed.length,
	};
}

function formatDetailed(pattern: string, output: string): string {
	const trimmed = output.trimEnd();
	return [
		"Search mode: detailed",
		`Pattern: ${pattern}`,
		trimmed || "(no matches)",
	].join("\n");
}

function formatSummary(pattern: string, summary: ReturnType<typeof summarizeFiles>, maxFiles: number): string {
	const lines = [
		"Search mode: file summary",
		`Pattern: ${pattern}`,
		`Files: ${formatQuantity(summary.totalFiles)} · Matches: ${formatQuantity(summary.totalMatches)}`,
	];
	if (summary.rows.length === 0) {
		lines.push("(no matches)");
	} else {
		for (const row of summary.rows) {
			lines.push(`${row.path} — ${formatQuantity(row.matches)} matches — ${formatQuantity(row.lines)} lines — ${formatQuantity(row.characters)} characters`);
		}
		if (summary.totalFiles > maxFiles) lines.push(`... ${formatQuantity(summary.totalFiles - maxFiles)} more files omitted`);
	}
	return lines.join("\n");
}

export default function adaptiveRipgrepTool(pi: ExtensionAPI): void {
	const config = loadConfig();

	pi.registerTool({
		name: "adaptive_ripgrep",
		label: "Adaptive Ripgrep",
		description: "Search repository file contents. Use this for all grep and ripgrep searches; small or targeted searches return normal matching lines, while large searches return compact per-file occurrence counts, line counts, and character counts.",
		promptSnippet: "adaptive_ripgrep(pattern, paths?, globs?) - search file contents with adaptive output sizing",
		promptGuidelines: [
			"Use adaptive_ripgrep for all content searches, including grep and rg searches. Do not use bash grep or bash rg for repository content searches.",
			"Use bash only for shell-specific processing or search behavior that adaptive_ripgrep does not support.",
			"For a broad search, first inspect the compact file summary, then repeat the search with selected file paths to retrieve matching lines.",
		],
		parameters: Type.Object({
			pattern: Type.String({ description: "Ripgrep regular expression, unless fixed_string is true." }),
			paths: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: "Files or directories to search. Defaults to the current working directory." })),
			globs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: "Optional ripgrep glob filters, for example *.py or !test/**." })),
			case_sensitive: Type.Optional(Type.Boolean({ description: "Match case-sensitively. Defaults to true." })),
			fixed_string: Type.Optional(Type.Boolean({ description: "Treat pattern as a literal string instead of a regular expression." })),
			word_regexp: Type.Optional(Type.Boolean({ description: "Match only whole words." })),
			context_lines: Type.Optional(Type.Integer({ minimum: 0, maximum: 10, description: "Number of context lines around each detailed match." })),
			only_matching: Type.Optional(Type.Boolean({ description: "Show only the matching text in detailed mode." })),
			include_hidden: Type.Optional(Type.Boolean({ description: "Include hidden files and directories." })),
			no_ignore: Type.Optional(Type.Boolean({ description: "Do not respect ignore files." })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const detailResult = await runRg(buildArgs(params, true), ctx.cwd, config.maxDetailCharacters, signal);
			if (detailResult.exitCode !== 0 && detailResult.exitCode !== 1 && !detailResult.truncated) {
				throw new Error(detailResult.stderr.trim() || `rg exited with code ${detailResult.exitCode ?? "unknown"}`);
			}

			const detailLines = detailResult.stdout.split(/\r?\n/).filter(Boolean).length;
			const targeted = isTargetedFileList(params.paths, ctx.cwd);
			const collapse = detailResult.truncated || (!targeted && detailLines > config.maxDetailLines);
			if (!collapse) {
				const text = formatDetailed(params.pattern, detailResult.stdout);
				return { content: [{ type: "text", text }], details: { mode: "detailed", characters: characterCount(detailResult.stdout), lines: detailLines } };
			}

			const countResult = await runRg(buildArgs(params, false), ctx.cwd, undefined, signal);
			if (countResult.exitCode !== 0 && countResult.exitCode !== 1) {
				throw new Error(countResult.stderr.trim() || `rg count exited with code ${countResult.exitCode ?? "unknown"}`);
			}
			const summary = summarizeFiles(countResult.stdout, ctx.cwd, config.maxSummaryFiles);
			const text = formatSummary(params.pattern, summary, config.maxSummaryFiles);
			return {
				content: [{ type: "text", text }],
				details: { mode: "file-summary", files: summary.totalFiles, matches: summary.totalMatches, collapsedCharacters: characterCount(detailResult.stdout) },
			};
		},
	});
}
