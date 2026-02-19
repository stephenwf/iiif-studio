import { convertPresentation2 } from "@iiif/parser/presentation-2";
import {
	normalize,
	serialize,
	serializeConfigPresentation3,
	serializeConfigPresentation4,
	upgradeToPresentation4,
} from "@iiif/parser/presentation-4";
import { useMemo, useState } from "react";
import ReactDiffViewer from "react-diff-viewer-continued";
import { validatePresentation4 } from "@iiif/parser/presentation-4/validator";

type Workspace = "upgrade" | "validate";
type ConversionMode = "2to3" | "3to4" | "4to3";
type ValidationMode = "tolerant" | "strict";

type ValidationReport = ReturnType<typeof validatePresentation4>;
type ValidationIssue = ValidationReport["issues"][number];
type SeverityFilter = "all" | ValidationIssue["severity"];

type PathIndex = {
	exact: Map<string, ValidationIssue[]>;
	total: Map<string, number>;
};

const sampleV2 = {
	"@context": "http://iiif.io/api/presentation/2/context.json",
	"@id": "https://example.org/iiif/book/manifest",
	"@type": "sc:Manifest",
	label: "A compact v2 manifest",
	sequences: [
		{
			"@id": "https://example.org/iiif/book/sequence/normal",
			"@type": "sc:Sequence",
			canvases: [
				{
					"@id": "https://example.org/iiif/book/canvas/1",
					"@type": "sc:Canvas",
					label: "Page 1",
					width: 1200,
					height: 1800,
					images: [
						{
							"@id": "https://example.org/iiif/book/annotation/1",
							"@type": "oa:Annotation",
							motivation: "sc:painting",
							on: "https://example.org/iiif/book/canvas/1",
							resource: {
								"@id":
									"https://example.org/iiif/book/page-1/full/full/0/default.jpg",
								"@type": "dctypes:Image",
								format: "image/jpeg",
								width: 1200,
								height: 1800,
							},
						},
					],
				},
			],
		},
	],
};

const sampleV3 = {
	"@context": "http://iiif.io/api/presentation/3/context.json",
	id: "https://preview.iiif.io/cookbook/v4/recipe/0002-mvm-audio/manifest.json",
	type: "Manifest",
	label: {
		en: ["Simplest Audio Example (IIIF Presentation v3)"],
	},
	items: [
		{
			id: "https://preview.iiif.io/cookbook/v4/recipe/0002-mvm-audio/canvas",
			type: "Canvas",
			duration: 1985.024,
			items: [
				{
					id: "https://preview.iiif.io/cookbook/v4/recipe/0002-mvm-audio/canvas/page",
					type: "AnnotationPage",
					items: [
						{
							id: "https://preview.iiif.io/cookbook/v4/recipe/0002-mvm-audio/canvas/page/annotation",
							type: "Annotation",
							motivation: "painting",
							body: {
								id: "https://fixtures.iiif.io/audio/indiana/mahler-symphony-3/CD1/medium/128Kbps.mp4",
								type: "Sound",
								format: "audio/mp4",
								duration: 1985.024,
							},
							target:
								"https://preview.iiif.io/cookbook/v4/recipe/0002-mvm-audio/canvas",
						},
					],
				},
			],
		},
	],
};

const sampleV4 = {
	"@context": "http://iiif.io/api/presentation/4/context.json",
	id: "https://preview.iiif.io/cookbook/v4/recipe/0002-mvm-audio/v4/manifest.json",
	type: "Manifest",
	label: {
		en: ["Simplest Audio Example (IIIF Presentation v4)"],
	},
	items: [
		{
			id: "https://preview.iiif.io/cookbook/v4/recipe/0002-mvm-audio/v4/timeline",
			type: "Timeline",
			duration: 1985.024,
			items: [
				{
					id: "https://preview.iiif.io/cookbook/v4/recipe/0002-mvm-audio/v4/timeline/page",
					type: "AnnotationPage",
					items: [
						{
							id: "https://preview.iiif.io/cookbook/v4/recipe/0002-mvm-audio/v4/timeline/page/annotation",
							type: "Annotation",
							motivation: "painting",
							body: {
								id: "https://fixtures.iiif.io/audio/indiana/mahler-symphony-3/CD1/medium/128Kbps.mp4",
								type: "Sound",
								format: "audio/mp4",
								duration: 1985.024,
							},
							target:
								"https://preview.iiif.io/cookbook/v4/recipe/0002-mvm-audio/v4/timeline",
						},
					],
				},
			],
		},
	],
};

const sampleValidationUrl =
	"https://iiif.io/api/cookbook/recipe/0001-mvm-image/manifest.json";

const conversionModes: Array<{
	id: ConversionMode;
	label: string;
	hint: string;
}> = [
	{
		id: "2to3",
		label: "2 -> 3",
		hint: "Upgrade Presentation API 2 to 3",
	},
	{
		id: "3to4",
		label: "3 -> 4",
		hint: "Upgrade Presentation API 3 to 4",
	},
	{
		id: "4to3",
		label: "4 -> 3",
		hint: "Downgrade Presentation API 4 to 3",
	},
];

const severityRank: Record<ValidationIssue["severity"], number> = {
	error: 0,
	warning: 1,
	info: 2,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown parse error";
		throw new Error(`Invalid JSON: ${message}`);
	}
}

function ensureResourceRef(resource: { id?: string; type?: string }): {
	id: string;
	type: string;
} {
	if (!resource.id || !resource.type) {
		throw new Error(
			"Unable to resolve root IIIF resource (missing id/type after normalization).",
		);
	}
	return { id: resource.id, type: resource.type };
}

function serializeToPresentation4(input: unknown): unknown {
	const upgraded = upgradeToPresentation4(input);
	const normalized = normalize(upgraded);
	const resource = ensureResourceRef(normalized.resource);

	return serialize<unknown>(
		{
			entities: normalized.entities,
			mapping: normalized.mapping,
			requests: {},
		},
		resource,
		serializeConfigPresentation4,
	);
}

function serializeToPresentation3(input: unknown): unknown {
	const upgraded = upgradeToPresentation4(input);
	const normalized = normalize(upgraded);
	const resource = ensureResourceRef(normalized.resource);

	return serialize<unknown>(
		{
			entities: normalized.entities,
			mapping: normalized.mapping,
			requests: {},
		},
		resource,
		serializeConfigPresentation3,
	);
}

function sampleForMode(mode: ConversionMode): unknown {
	switch (mode) {
		case "2to3":
			return sampleV2;
		case "3to4":
			return sampleV3;
		case "4to3":
			return sampleV4;
	}
}

function getTypeLabel(resource: unknown): string {
	if (!isRecord(resource)) {
		return "Unknown";
	}

	const type = resource.type || resource["@type"];
	if (typeof type === "string") {
		return type;
	}

	if (Array.isArray(type) && typeof type[0] === "string") {
		return type[0];
	}

	return "Unknown";
}

function expandIssuePath(path: string): string[] {
	if (!path || path[0] !== "$") {
		return [];
	}

	const parentPaths = ["$"];
	const parts = path.slice(1).match(/\.[^.[\]]+|\[\d+\]/g) || [];
	let current = "$";

	for (const part of parts) {
		current += part;
		parentPaths.push(current);
	}

	if (parentPaths[parentPaths.length - 1] !== path) {
		parentPaths.push(path);
	}

	return parentPaths;
}

function buildPathIndex(issues: ValidationIssue[]): PathIndex {
	const exact = new Map<string, ValidationIssue[]>();
	const total = new Map<string, number>();

	for (const issue of issues) {
		const exactList = exact.get(issue.path) || [];
		exactList.push(issue);
		exact.set(issue.path, exactList);

		for (const parent of expandIssuePath(issue.path)) {
			total.set(parent, (total.get(parent) || 0) + 1);
		}
	}

	return { exact, total };
}

function strongestSeverity(
	issues: ValidationIssue[],
): ValidationIssue["severity"] | null {
	if (!issues.length) {
		return null;
	}

	return (
		[...issues].sort(
			(a, b) => severityRank[a.severity] - severityRank[b.severity],
		)[0]?.severity || null
	);
}

function cssSeverity(severity: ValidationIssue["severity"] | null): string {
	switch (severity) {
		case "error":
			return "sev-error";
		case "warning":
			return "sev-warning";
		case "info":
			return "sev-info";
		default:
			return "sev-neutral";
	}
}

function keyPath(parent: string, key: string): string {
	return `${parent}.${key}`;
}

function formatPrimitive(value: unknown): string {
	if (typeof value === "string") {
		return JSON.stringify(value);
	}

	if (value === null) {
		return "null";
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	return JSON.stringify(value);
}

type JsonTreeProps = {
	value: unknown;
	path: string;
	depth: number;
	label?: string;
	index: PathIndex;
};

function JsonTreeNode({ value, path, depth, label, index }: JsonTreeProps) {
	const exactIssues = index.exact.get(path) || [];
	const issueCount = index.total.get(path) || 0;
	const severity = strongestSeverity(exactIssues);
	const severityClass = cssSeverity(severity);
	const indent = { paddingLeft: `${depth * 1.1}rem` };

	const labelPart = label ? (
		<>
			<span className="json-key">"{label}"</span>
			<span className="json-punctuation">: </span>
		</>
	) : null;

	if (Array.isArray(value)) {
		return (
			<details className="json-block" open>
				<summary
					className={`json-line ${exactIssues.length ? "line-has-issues" : ""}`}
					style={indent}
				>
					{labelPart}
					<span className="json-punctuation">[</span>
					<span className="json-meta">{value.length} items</span>
					{issueCount > 0 ? (
						<span className={`issue-pill ${severityClass}`}>{issueCount}</span>
					) : null}
				</summary>

				{exactIssues.length > 0 ? (
					<div
						className="inline-issues"
						style={{ paddingLeft: `${(depth + 1) * 1.1}rem` }}
					>
						{exactIssues.map((issue, idx) => (
							<div
								key={`${path}-issue-${idx}`}
								className={`inline-issue ${cssSeverity(issue.severity)}`}
							>
								<code>{issue.code}</code>: {issue.message}
							</div>
						))}
					</div>
				) : null}

				{value.map((item, idx) => (
					<JsonTreeNode
						key={`${path}[${idx}]`}
						value={item}
						path={`${path}[${idx}]`}
						depth={depth + 1}
						index={index}
					/>
				))}

				<div className="json-line" style={indent}>
					<span className="json-punctuation">]</span>
				</div>
			</details>
		);
	}

	if (isRecord(value)) {
		const entries = Object.entries(value);

		return (
			<details className="json-block" open>
				<summary
					className={`json-line ${exactIssues.length ? "line-has-issues" : ""}`}
					style={indent}
				>
					{labelPart}
					<span className="json-punctuation">{"{"}</span>
					<span className="json-meta">{entries.length} properties</span>
					{issueCount > 0 ? (
						<span className={`issue-pill ${severityClass}`}>{issueCount}</span>
					) : null}
				</summary>

				{exactIssues.length > 0 ? (
					<div
						className="inline-issues"
						style={{ paddingLeft: `${(depth + 1) * 1.1}rem` }}
					>
						{exactIssues.map((issue, idx) => (
							<div
								key={`${path}-issue-${idx}`}
								className={`inline-issue ${cssSeverity(issue.severity)}`}
							>
								<code>{issue.code}</code>: {issue.message}
							</div>
						))}
					</div>
				) : null}

				{entries.map(([entryKey, entryValue]) => (
					<JsonTreeNode
						key={keyPath(path, entryKey)}
						value={entryValue}
						path={keyPath(path, entryKey)}
						depth={depth + 1}
						label={entryKey}
						index={index}
					/>
				))}

				<div className="json-line" style={indent}>
					<span className="json-punctuation">{"}"}</span>
				</div>
			</details>
		);
	}

	return (
		<div
			className={`json-line ${exactIssues.length ? "line-has-issues" : ""}`}
			style={indent}
		>
			{labelPart}
			<span className="json-value">{formatPrimitive(value)}</span>
			{issueCount > 0 ? (
				<span className={`issue-pill ${severityClass}`}>{issueCount}</span>
			) : null}
			{exactIssues.length > 0 ? (
				<div className="inline-issues">
					{exactIssues.map((issue, idx) => (
						<div
							key={`${path}-issue-${idx}`}
							className={`inline-issue ${cssSeverity(issue.severity)}`}
						>
							<code>{issue.code}</code>: {issue.message}
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

function App() {
	const [workspace, setWorkspace] = useState<Workspace>("upgrade");
	const [conversionMode, setConversionMode] = useState<ConversionMode>("2to3");
	const [inputText, setInputText] = useState(JSON.stringify(sampleV2, null, 2));
	const [outputText, setOutputText] = useState("");
	const [diffInputText, setDiffInputText] = useState("");
	const [showDiff, setShowDiff] = useState(true);
	const [conversionError, setConversionError] = useState<string | null>(null);

	const [validationUrl, setValidationUrl] = useState(sampleValidationUrl);
	const [validationMode, setValidationMode] =
		useState<ValidationMode>("tolerant");
	const [isValidating, setIsValidating] = useState(false);
	const [validationError, setValidationError] = useState<string | null>(null);
	const [report, setReport] = useState<ValidationReport | null>(null);
	const [fetchedJson, setFetchedJson] = useState<unknown>(null);
	const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

	const filteredIssues = useMemo(() => {
		const issues = report?.issues || [];
		const bySeverity =
			severityFilter === "all"
				? issues
				: issues.filter((issue) => issue.severity === severityFilter);

		return [...bySeverity].sort((a, b) => {
			if (severityRank[a.severity] !== severityRank[b.severity]) {
				return severityRank[a.severity] - severityRank[b.severity];
			}

			if (a.path !== b.path) {
				return a.path.localeCompare(b.path);
			}

			return a.code.localeCompare(b.code);
		});
	}, [report, severityFilter]);

	const pathIndex = useMemo(
		() => buildPathIndex(report?.issues || []),
		[report],
	);

	const fetchedType = useMemo(() => getTypeLabel(fetchedJson), [fetchedJson]);

	function loadSample() {
		setInputText(JSON.stringify(sampleForMode(conversionMode), null, 2));
		setOutputText("");
		setDiffInputText("");
		setConversionError(null);
	}

	function convertInput() {
		try {
			setConversionError(null);
			const parsed = parseJson(inputText);

			const converted =
				conversionMode === "2to3"
					? convertPresentation2(parsed as never)
					: conversionMode === "3to4"
						? serializeToPresentation4(parsed)
						: serializeToPresentation3(parsed);

			setDiffInputText(JSON.stringify(parsed, null, 2));
			setOutputText(JSON.stringify(converted, null, 2));
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown conversion error";
			setConversionError(message);
		}
	}

	async function runValidation() {
		if (!validationUrl.trim()) {
			setValidationError("Please provide a manifest or collection URL.");
			return;
		}

		setIsValidating(true);
		setValidationError(null);
		setReport(null);

		try {
			const response = await fetch(validationUrl.trim());
			if (!response.ok) {
				throw new Error(`HTTP ${response.status} ${response.statusText}`);
			}

			const json = (await response.json()) as unknown;
			setFetchedJson(json);

			try {
				const nextReport = validatePresentation4(json, {
					mode: validationMode,
				});
				setReport(nextReport);
			} catch (error) {
				const maybeReport = (error as { report?: ValidationReport }).report;
				if (maybeReport) {
					setReport(maybeReport);
					setValidationError((error as Error).message);
				} else {
					throw error;
				}
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown validation error";
			setValidationError(
				`Unable to fetch/validate URL: ${message}. If this is a browser CORS issue, try a URL that sends CORS headers.`,
			);
		} finally {
			setIsValidating(false);
		}
	}

	async function copyOutput() {
		if (!outputText) {
			return;
		}

		try {
			await navigator.clipboard.writeText(outputText);
		} catch {
			setConversionError(
				"Unable to copy output to clipboard in this browser context.",
			);
		}
	}

	return (
		<div className="app-shell">
			<div className="decor decor-top" aria-hidden />
			<div className="decor decor-bottom" aria-hidden />

			<header className="hero">
				<p className="hero-kicker">IIIF parser workbench</p>
				<h1>IIIF Studio</h1>
				<p>
					Upgrade between IIIF versions and validate manifests with inline issue
					annotations mapped onto JSON paths.
				</p>
			</header>

			<div
				className="workspace-switch"
				role="tablist"
				aria-label="Workspace selector"
			>
				<button
					type="button"
					role="tab"
					aria-selected={workspace === "upgrade"}
					className={workspace === "upgrade" ? "active" : ""}
					onClick={() => setWorkspace("upgrade")}
				>
					Upgrade
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={workspace === "validate"}
					className={workspace === "validate" ? "active" : ""}
					onClick={() => setWorkspace("validate")}
				>
					Validate
				</button>
			</div>

			{workspace === "upgrade" ? (
				<section className="panel fade-in" aria-label="Upgrade workspace">
					<div className="toolbar">
						<div
							className="mode-group"
							role="radiogroup"
							aria-label="Conversion mode"
						>
							{conversionModes.map((mode) => (
								<button
									key={mode.id}
									type="button"
									role="radio"
									aria-checked={conversionMode === mode.id}
									className={conversionMode === mode.id ? "active" : ""}
									onClick={() => {
										setConversionMode(mode.id);
										setInputText(
											JSON.stringify(sampleForMode(mode.id), null, 2),
										);
										setConversionError(null);
										setOutputText("");
										setDiffInputText("");
									}}
									title={mode.hint}
								>
									{mode.label}
								</button>
							))}
						</div>

						<div className="toolbar-actions">
							<label className="toggle-check">
								<input
									type="checkbox"
									checked={showDiff}
									onChange={(event) => setShowDiff(event.target.checked)}
								/>
								Show diff
							</label>
							<button type="button" onClick={loadSample}>
								Load sample
							</button>
							<button type="button" className="cta" onClick={convertInput}>
								Convert now
							</button>
						</div>
					</div>

					{conversionError ? (
						<p className="status status-error">{conversionError}</p>
					) : null}

					<div className="editor-grid">
						<article className="editor-card">
							<div className="card-title-row">
								<h2>Input JSON</h2>
								<span>{conversionMode.replace("to", " -> ")}</span>
							</div>
							<textarea
								value={inputText}
								onChange={(event) => setInputText(event.target.value)}
								spellCheck={false}
								aria-label="Input IIIF JSON"
							/>
						</article>

						<article className="editor-card">
							<div className="card-title-row">
								<h2>Output JSON</h2>
								<button
									type="button"
									onClick={copyOutput}
									disabled={!outputText}
								>
									Copy
								</button>
							</div>
							<textarea
								value={outputText}
								readOnly
								spellCheck={false}
								aria-label="Converted output JSON"
							/>
						</article>
					</div>

					{showDiff ? (
						<article className="diff-card">
							<div className="card-title-row">
								<h2>Input {"->"} Output diff</h2>
								<span>
									{outputText
										? "Line-level JSON changes"
										: "Run conversion to see diff"}
								</span>
							</div>
							{outputText ? (
								<div className="diff-viewer-wrap">
									<ReactDiffViewer
										oldValue={diffInputText}
										newValue={outputText}
										splitView
										hideLineNumbers={false}
										leftTitle="Input"
										rightTitle="Output"
									/>
								</div>
							) : (
								<p className="status">Convert input JSON to generate a diff.</p>
							)}
						</article>
					) : null}
				</section>
			) : (
				<section className="panel fade-in" aria-label="Validation workspace">
					<div className="validate-toolbar">
						<label className="url-field">
							<span>Manifest / Collection URL</span>
							<input
								value={validationUrl}
								onChange={(event) => setValidationUrl(event.target.value)}
								placeholder="https://example.org/iiif/manifest.json"
								type="url"
							/>
						</label>

						<label className="mode-field">
							<span>Mode</span>
							<select
								value={validationMode}
								onChange={(event) =>
									setValidationMode(event.target.value as ValidationMode)
								}
							>
								<option value="tolerant">Tolerant</option>
								<option value="strict">Strict</option>
							</select>
						</label>

						<button
							type="button"
							className="cta"
							onClick={runValidation}
							disabled={isValidating}
						>
							{isValidating ? "Validating..." : "Fetch & validate"}
						</button>
					</div>

					{validationError ? (
						<p className="status status-error">{validationError}</p>
					) : null}

					{report ? (
						<>
							<div className="summary-grid">
								<article
									className={`summary-card ${report.valid ? "good" : "bad"}`}
								>
									<h3>Status</h3>
									<p>{report.valid ? "Valid" : "Invalid"}</p>
								</article>
								<article className="summary-card">
									<h3>Errors</h3>
									<p>{report.stats.errors}</p>
								</article>
								<article className="summary-card">
									<h3>Warnings</h3>
									<p>{report.stats.warnings}</p>
								</article>
								<article className="summary-card">
									<h3>Infos</h3>
									<p>{report.stats.info}</p>
								</article>
								<article className="summary-card">
									<h3>Fetched Type</h3>
									<p>{fetchedType}</p>
								</article>
							</div>

							<div className="validation-grid">
								<article className="issues-card">
									<div className="card-title-row">
										<h2>Issues</h2>
										<label className="issue-filter">
											<span>Show</span>
											<select
												value={severityFilter}
												onChange={(event) =>
													setSeverityFilter(
														event.target.value as SeverityFilter,
													)
												}
											>
												<option value="all">All</option>
												<option value="error">Errors</option>
												<option value="warning">Warnings</option>
												<option value="info">Info</option>
											</select>
										</label>
									</div>

									{filteredIssues.length === 0 ? (
										<p className="status">
											No issues match the selected filter.
										</p>
									) : (
										<ol className="issue-list">
											{filteredIssues.map((issue, idx) => (
												<li
													key={`${issue.path}-${issue.code}-${idx}`}
													className={`issue-row ${cssSeverity(issue.severity)}`}
												>
													<div className="issue-top">
														<span className="issue-severity">
															{issue.severity}
														</span>
														<code>{issue.code}</code>
													</div>
													<p>{issue.message}</p>
													<p className="issue-path">
														<code>{issue.path}</code>
													</p>
												</li>
											))}
										</ol>
									)}
								</article>

								<article className="json-card">
									<div className="card-title-row">
										<h2>Annotated JSON</h2>
										<span>Inline issue counts</span>
									</div>

									{fetchedJson ? (
										<div
											className="json-tree"
											role="tree"
											aria-label="Annotated manifest JSON"
										>
											<JsonTreeNode
												value={fetchedJson}
												path="$"
												depth={0}
												index={pathIndex}
											/>
										</div>
									) : (
										<p className="status">
											Run validation to load JSON annotations.
										</p>
									)}
								</article>
							</div>
						</>
					) : (
						<p className="status">
							Paste a URL and run validation to see report details and inline
							annotations.
						</p>
					)}
				</section>
			)}
		</div>
	);
}

export default App;
