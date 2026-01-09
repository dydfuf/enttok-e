import type { Extension } from "@codemirror/state";
import { ViewPlugin, Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { ViewUpdate, DecorationSet } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { resolveAssetUrl } from "@/lib/vault-paths";

// Checkbox Widget for task lists
class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.checked;
    checkbox.className = "cm-md-checkbox";
    checkbox.setAttribute("aria-label", this.checked ? "Completed task" : "Incomplete task");

    // Handle click to toggle checkbox
    checkbox.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = this.pos;
      const newChar = this.checked ? " " : "x";
      view.dispatch({
        changes: { from: pos, to: pos + 1, insert: newChar }
      });
    });

    return checkbox;
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.pos === this.pos;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class ListMarkerWidget extends WidgetType {
  constructor(readonly marker: string, readonly ordered: boolean) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = this.ordered
      ? "cm-md-list-bullet cm-md-list-bullet-ordered"
      : "cm-md-list-bullet cm-md-list-bullet-unordered";
    span.textContent = this.ordered ? this.marker : "\u2022";
    return span;
  }

  eq(other: ListMarkerWidget): boolean {
    return other.marker === this.marker && other.ordered === this.ordered;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly width?: number,
    readonly height?: number
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-md-image";

    const image = document.createElement("img");
    image.src = this.src;
    image.alt = this.alt;
    image.loading = "lazy";
    if (this.width) {
      image.style.width = `${this.width}px`;
    }
    if (this.height) {
      image.style.height = `${this.height}px`;
    }

    wrapper.appendChild(image);
    return wrapper;
  }

  eq(other: ImageWidget): boolean {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.width === this.width &&
      other.height === this.height
    );
  }
}

class HorizontalRuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement("hr");
    hr.className = "cm-md-hr";
    return hr;
  }

  eq(): boolean {
    return true;
  }
}

class CalloutTitleWidget extends WidgetType {
  constructor(readonly type: string, readonly title: string | null) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = `cm-md-callout-title cm-md-callout-${this.type}`;
    const typeLabel =
      this.type.length > 0
        ? `${this.type[0].toUpperCase()}${this.type.slice(1)}`
        : "Note";
    wrapper.textContent = this.title
      ? `${typeLabel}: ${this.title}`
      : typeLabel;
    return wrapper;
  }

  eq(other: CalloutTitleWidget): boolean {
    return other.type === this.type && other.title === this.title;
  }
}

// Check if cursor is within a given range (inclusive)
export function isCursorInRange(view: EditorView, from: number, to: number): boolean {
  const { state } = view;
  const selection = state.selection.main;

  // Check if any part of the selection overlaps with the range
  // or if cursor (when no selection) is within the range
  return (selection.from <= to && selection.to >= from);
}

// Check if the line containing the range has cursor
export function isLineWithCursor(view: EditorView, pos: number): boolean {
  const { state } = view;
  const line = state.doc.lineAt(pos);
  const selection = state.selection.main;

  return (selection.from <= line.to && selection.to >= line.from);
}

// Decoration classes for hidden markers
export const hiddenMarkerDecoration = Decoration.mark({ class: "cm-md-hidden" });

// Style decorations for rendered elements
export const boldDecoration = Decoration.mark({ class: "cm-md-bold" });
export const italicDecoration = Decoration.mark({ class: "cm-md-italic" });
export const codeDecoration = Decoration.mark({ class: "cm-md-code" });
export const linkDecoration = Decoration.mark({ class: "cm-md-link" });
export const strikethroughDecoration = Decoration.mark({ class: "cm-md-strikethrough" });
export const highlightDecoration = Decoration.mark({ class: "cm-md-highlight" });
export const subscriptDecoration = Decoration.mark({ class: "cm-md-subscript" });
export const superscriptDecoration = Decoration.mark({ class: "cm-md-superscript" });
export const footnoteDecoration = Decoration.mark({ class: "cm-md-footnote" });
export const mathDecoration = Decoration.mark({ class: "cm-md-math" });

// Heading decorations
export const heading1Decoration = Decoration.mark({ class: "cm-md-heading cm-md-heading-1" });
export const heading2Decoration = Decoration.mark({ class: "cm-md-heading cm-md-heading-2" });
export const heading3Decoration = Decoration.mark({ class: "cm-md-heading cm-md-heading-3" });
export const heading4Decoration = Decoration.mark({ class: "cm-md-heading cm-md-heading-4" });
export const heading5Decoration = Decoration.mark({ class: "cm-md-heading cm-md-heading-5" });
export const heading6Decoration = Decoration.mark({ class: "cm-md-heading cm-md-heading-6" });

export const quoteDecoration = Decoration.mark({ class: "cm-md-quote" });
export const listMarkerDecoration = Decoration.mark({ class: "cm-md-list-marker" });
export const codeBlockDecoration = Decoration.mark({ class: "cm-md-code-block" });
export const tableDecoration = Decoration.mark({ class: "cm-md-table" });
export const mathBlockLineDecoration = Decoration.line({ class: "cm-md-math-block-line" });
export const codeBlockLineDecoration = Decoration.line({ class: "cm-md-code-block-line" });
export const tableLineDecoration = Decoration.line({ class: "cm-md-table-line" });

// Task list decorations
export const taskTextCheckedDecoration = Decoration.mark({ class: "cm-md-task-checked" });

const BARE_URL_REGEX =
  /(?:https?:\/\/|www\.|mailto:|obsidian:\/\/)[^\s<>()]+/gi;
const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g;
const WIKI_EMBED_REGEX = /!\[\[([^\]]+)\]\]/g;
const FOOTNOTE_REF_REGEX = /\[\^([^\]]+)\]/g;
const FOOTNOTE_DEF_REGEX = /^(\s*)\[\^([^\]]+)\]:\s*/;
const TASK_LIST_REGEX = /^(\s*)([-*+]|\d+[.)])\s\[([^\]])\]\s/;
const INLINE_MATH_REGEX = /\$([^$]+?)\$/g;
const COMMENT_MARKER = "%%";
const MATH_BLOCK_DELIMITER = "$$";
const HIGHLIGHT_MARKER = "==";
const LINK_CONTAINER_NODES = new Set(["Link", "Image", "Autolink", "URL"]);
const INLINE_DECORATION_SKIP_NODES = new Set([
  "InlineCode",
  "CodeText",
  "FencedCode",
  "CodeBlock",
  "HTMLBlock",
  "Link",
  "Image",
  "Autolink",
  "URL",
]);
const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "heic",
  "heif",
]);
const CALLOUT_LINE_DECORATIONS = new Map<string, Decoration>();

// Type for decoration builder
type DecorationBuilder = {
  add: (from: number, to: number, deco: Decoration) => void;
  addWidget: (pos: number, widget: WidgetType, side?: number) => void;
  addLine: (pos: number, deco: Decoration) => void;
};

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function isInsideNodes(node: SyntaxNode | null, names: Set<string>): boolean {
  let current: SyntaxNode | null = node;
  while (current) {
    if (names.has(current.name)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function shouldSkipInlineDecoration(node: SyntaxNode | null): boolean {
  return isInsideNodes(node, INLINE_DECORATION_SKIP_NODES);
}

function parseImageAlt(rawAlt: string): {
  alt: string;
  width?: number;
  height?: number;
} {
  const trimmed = rawAlt.trim();
  if (!trimmed) {
    return { alt: "" };
  }
  const pipeIndex = trimmed.lastIndexOf("|");
  if (pipeIndex === -1) {
    return { alt: trimmed };
  }
  const sizePart = trimmed.slice(pipeIndex + 1).trim();
  const sizeMatch = sizePart.match(/^(\d+)(x(\d+))?$/i);
  if (!sizeMatch) {
    return { alt: trimmed };
  }
  const width = Number(sizeMatch[1]);
  const height = sizeMatch[3] ? Number(sizeMatch[3]) : undefined;
  const alt = trimmed.slice(0, pipeIndex).trim();
  return { alt, width, height };
}

type WikiLinkParts = {
  target: string;
  display: string;
  width?: number;
  height?: number;
};

function parseWikiLinkParts(raw: string): WikiLinkParts | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const pipeIndex = trimmed.indexOf("|");
  if (pipeIndex === -1) {
    return { target: trimmed, display: trimmed };
  }
  const target = trimmed.slice(0, pipeIndex).trim();
  const suffix = trimmed.slice(pipeIndex + 1).trim();
  if (!suffix) {
    return { target, display: target };
  }
  const sizeMatch = suffix.match(/^(\d+)(x(\d+))?$/i);
  if (sizeMatch) {
    return {
      target,
      display: target,
      width: Number(sizeMatch[1]),
      height: sizeMatch[3] ? Number(sizeMatch[3]) : undefined,
    };
  }
  return { target, display: suffix };
}

function isImagePath(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  const withoutAnchor = trimmed.split("#")[0].split("^")[0];
  const extension = withoutAnchor.split(".").pop()?.toLowerCase();
  if (!extension) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(extension);
}

function stripWikiAnchor(raw: string): string {
  return raw.split("#")[0].split("^")[0].trim();
}

function normalizeCalloutType(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || "note";
}

function getCalloutLineDecoration(type: string): Decoration {
  const normalized = normalizeCalloutType(type);
  const cached = CALLOUT_LINE_DECORATIONS.get(normalized);
  if (cached) {
    return cached;
  }
  const deco = Decoration.line({
    class: `cm-md-callout-line cm-md-callout-${normalized}`,
  });
  CALLOUT_LINE_DECORATIONS.set(normalized, deco);
  return deco;
}

// Process inline emphasis (bold, italic)
function processEmphasis(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from, to } = node;
  const text = view.state.doc.sliceString(from, to);

  // Skip if cursor is in range
  if (isLineWithCursor(view, from)) return;

  // Detect emphasis type
  const isBold = text.startsWith("**") || text.startsWith("__");
  const starCount = isBold ? 2 : 1;

  if (isBold) {
    // Hide opening markers
    builder.add(from, from + starCount, hiddenMarkerDecoration);
    // Apply bold style
    builder.add(from + starCount, to - starCount, boldDecoration);
    // Hide closing markers
    builder.add(to - starCount, to, hiddenMarkerDecoration);
  } else {
    // Hide opening marker
    builder.add(from, from + starCount, hiddenMarkerDecoration);
    // Apply italic style
    builder.add(from + starCount, to - starCount, italicDecoration);
    // Hide closing marker
    builder.add(to - starCount, to, hiddenMarkerDecoration);
  }
}

type ImageMatch = {
  alt: string;
  url: string;
  width?: number;
  height?: number;
};

function parseImageMarkdown(text: string): ImageMatch | null {
  const match = text.match(/^!\[([^\]]*)\]\(([^)]*)\)$/);
  if (!match) {
    return null;
  }
  const altInfo = parseImageAlt(match[1]);
  const alt = altInfo.alt;
  let url = match[2].trim();
  if (!url) {
    return null;
  }
  if (url.startsWith("<") && url.endsWith(">")) {
    url = url.slice(1, -1).trim();
  }
  const titleMatch = url.match(/^(\S+)\s+['"].*['"]$/);
  if (titleMatch) {
    url = titleMatch[1];
  }
  if (!url) {
    return null;
  }
  return { alt, url, width: altInfo.width, height: altInfo.height };
}

function processImage(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from, to } = node;

  if (isLineWithCursor(view, from)) return;

  const text = view.state.doc.sliceString(from, to);
  const parsed = parseImageMarkdown(text);
  if (!parsed) {
    return;
  }

  const notePath = view.dom.dataset.filePath || null;
  const resolvedSrc = resolveAssetUrl(notePath, parsed.url);
  if (!resolvedSrc) {
    return;
  }

  builder.add(from, to, hiddenMarkerDecoration);
  builder.addWidget(
    from,
    new ImageWidget(resolvedSrc, parsed.alt, parsed.width, parsed.height),
    1
  );
}

// Process inline code
function processInlineCode(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from, to } = node;

  if (isLineWithCursor(view, from)) return;

  const text = view.state.doc.sliceString(from, to);
  const match = text.match(/^(`+)([\s\S]*?)\1$/);
  if (!match) {
    return;
  }
  const markerLength = match[1].length;
  const contentStart = from + markerLength;
  const contentEnd = to - markerLength;
  if (contentEnd <= contentStart) {
    return;
  }

  // Hide opening backticks
  builder.add(from, contentStart, hiddenMarkerDecoration);
  // Apply code style
  builder.add(contentStart, contentEnd, codeDecoration);
  // Hide closing backticks
  builder.add(contentEnd, to, hiddenMarkerDecoration);
}

// Process links
function processLink(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from, to } = node;
  const text = view.state.doc.sliceString(from, to);
  const isActiveLine = isLineWithCursor(view, from);

  // Parse link: [text](url)
  const match = text.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
  if (!match) return;

  const linkTextLength = match[1].length;

  // Apply link style to text
  builder.add(from + 1, from + 1 + linkTextLength, linkDecoration);

  if (!isActiveLine) {
    // Hide [
    builder.add(from, from + 1, hiddenMarkerDecoration);
    // Hide ](url)
    builder.add(from + 1 + linkTextLength, to, hiddenMarkerDecoration);
  }
}

function processAutolink(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from, to } = node;
  const text = view.state.doc.sliceString(from, to);
  const isActiveLine = isLineWithCursor(view, from);

  if (text.startsWith("<") && text.endsWith(">") && text.length > 2) {
    builder.add(from + 1, to - 1, linkDecoration);
    if (!isActiveLine) {
      builder.add(from, from + 1, hiddenMarkerDecoration);
      builder.add(to - 1, to, hiddenMarkerDecoration);
    }
    return;
  }

  builder.add(from, to, linkDecoration);
}

// Process strikethrough
function processStrikethrough(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from, to } = node;

  if (isLineWithCursor(view, from)) return;

  // Hide opening ~~
  builder.add(from, from + 2, hiddenMarkerDecoration);
  // Apply strikethrough style
  builder.add(from + 2, to - 2, strikethroughDecoration);
  // Hide closing ~~
  builder.add(to - 2, to, hiddenMarkerDecoration);
}

// Process headings
function processHeading(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder,
  level: number
) {
  const { from } = node;
  const line = view.state.doc.lineAt(from);

  if (isLineWithCursor(view, from)) return;

  // Find the heading mark (# symbols)
  const lineText = view.state.doc.sliceString(line.from, line.to);
  const markMatch = lineText.match(/^(#{1,6})\s/);

  if (markMatch) {
    const markLength = markMatch[1].length + 1; // # symbols + space

    // Hide the # marks and space
    builder.add(line.from, line.from + markLength, hiddenMarkerDecoration);

    // Apply heading style to content
    const headingDecos = [
      heading1Decoration,
      heading2Decoration,
      heading3Decoration,
      heading4Decoration,
      heading5Decoration,
      heading6Decoration,
    ];
    builder.add(line.from + markLength, line.to, headingDecos[level - 1] || heading1Decoration);
  }
}

// Process blockquotes
function processBlockquote(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from, to } = node;
  if (isCursorInRange(view, from, to)) return;

  const doc = view.state.doc;
  let line = doc.lineAt(from);
  const firstLine = line;
  const endLine = doc.lineAt(to);

  const firstLineText = firstLine.text;
  const calloutMatch = firstLineText.match(
    /^>\s*\[!([^\]]+)\]([+-])?\s*(.*)$/
  );
  const calloutType = calloutMatch ? normalizeCalloutType(calloutMatch[1]) : null;
  const calloutTitle = calloutMatch
    ? calloutMatch[3]?.trim() || null
    : null;

  while (true) {
    const lineText = line.text;
    const match = lineText.match(/^>\s?/);
    if (match) {
      builder.add(line.from, line.from + match[0].length, hiddenMarkerDecoration);
      builder.add(line.from + match[0].length, line.to, quoteDecoration);
      if (calloutType) {
        builder.addLine(line.from, getCalloutLineDecoration(calloutType));
      }
    }

    if (line.number === endLine.number) {
      break;
    }
    line = doc.line(line.number + 1);
  }

  if (calloutType) {
    builder.add(firstLine.from, firstLine.to, hiddenMarkerDecoration);
    builder.addWidget(
      firstLine.from,
      new CalloutTitleWidget(calloutType, calloutTitle),
      1
    );
  }
}

// Process list items
function processListItem(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from } = node;
  const line = view.state.doc.lineAt(from);

  if (isLineWithCursor(view, from)) return;

  const lineText = view.state.doc.sliceString(line.from, line.to);

  if (TASK_LIST_REGEX.test(lineText)) {
    return;
  }

  // Match unordered list markers (-, *, +) or ordered list markers (1., 2., 1))
  const match = lineText.match(/^(\s*)([-*+]|\d+[.)])\s/);

  if (match) {
    const indentLength = match[1].length;
    const markerLength = match[2].length + 1; // marker + space
    const markerFrom = line.from + indentLength;
    const markerTo = markerFrom + markerLength;

    if (isLineWithCursor(view, from)) {
      builder.add(markerFrom, markerTo, listMarkerDecoration);
      return;
    }

    const isOrdered = /^\d/.test(match[2]);
    const widget = new ListMarkerWidget(match[2], isOrdered);
    builder.add(
      markerFrom,
      markerTo,
      Decoration.replace({ widget, inclusive: false })
    );
  }
}

// Process task list items (checkboxes)
function processTaskList(
  view: EditorView,
  tree: ReturnType<typeof syntaxTree>,
  builder: DecorationBuilder
) {
  const doc = view.state.doc;

  // Iterate through all lines to find task list items
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;
    const node = tree.resolveInner(line.from, 1);
    if (shouldSkipInlineDecoration(node)) {
      continue;
    }

    // Match task list pattern for any list marker and any task symbol
    const match = lineText.match(TASK_LIST_REGEX);

    if (match) {
      if (isLineWithCursor(view, line.from)) continue;

      const indentLength = match[1].length;
      const markerLength = match[2].length; // - or * or + or 1.
      const isChecked = match[3] !== " ";

      // Position of the character inside [ ]
      const checkboxCharPos = line.from + indentLength + markerLength + 2; // "- [" = 3 chars

      // Hide the list marker and checkbox syntax: "- [ ] " or "- [x] "
      const syntaxEnd = line.from + indentLength + markerLength + 5; // marker + " [x] "
      builder.add(line.from + indentLength, syntaxEnd, hiddenMarkerDecoration);

      // Add checkbox widget
      builder.addWidget(
        line.from + indentLength,
        new CheckboxWidget(isChecked, checkboxCharPos),
        1
      );

      // If checked, apply strikethrough style to the text
      if (isChecked && syntaxEnd < line.to) {
        builder.add(syntaxEnd, line.to, taskTextCheckedDecoration);
      }
    }
  }
}

function processSubSuper(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder,
  decoration: Decoration
) {
  const { from, to } = node;
  if (isLineWithCursor(view, from)) return;
  if (to - from <= 2) return;

  builder.add(from, from + 1, hiddenMarkerDecoration);
  builder.add(from + 1, to - 1, decoration);
  builder.add(to - 1, to, hiddenMarkerDecoration);
}

function processSetextHeading(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder,
  level: number
) {
  const doc = view.state.doc;
  const line = doc.lineAt(node.from);
  const underlineLine =
    line.number < doc.lines ? doc.line(line.number + 1) : null;

  if (isLineWithCursor(view, line.from)) return;
  if (underlineLine && isLineWithCursor(view, underlineLine.from)) return;

  const headingDecos = [
    heading1Decoration,
    heading2Decoration,
  ];
  builder.add(line.from, line.to, headingDecos[level - 1] || heading1Decoration);

  if (underlineLine) {
    if (underlineLine.from < node.to) {
      builder.add(underlineLine.from, underlineLine.to, hiddenMarkerDecoration);
    }
  }
}

function processHorizontalRule(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const line = view.state.doc.lineAt(node.from);
  if (isLineWithCursor(view, line.from)) return;

  builder.add(line.from, line.to, hiddenMarkerDecoration);
  builder.addWidget(line.from, new HorizontalRuleWidget(), 1);
}

function isFenceLine(text: string): boolean {
  return /^\s*(`{3,}|~{3,})/.test(text);
}

function processCodeBlock(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from, to } = node;
  if (isCursorInRange(view, from, to)) return;

  const doc = view.state.doc;
  const startLine = doc.lineAt(from);
  let line = startLine;
  const endLine = doc.lineAt(to);
  const isFenced = node.name === "FencedCode";

  while (true) {
    const fence =
      isFenced &&
      (line.number === startLine.number || line.number === endLine.number);
    if (fence && isFenceLine(line.text)) {
      builder.add(line.from, line.to, hiddenMarkerDecoration);
    } else {
      builder.add(line.from, line.to, codeBlockDecoration);
      builder.addLine(line.from, codeBlockLineDecoration);
    }

    if (line.number === endLine.number) {
      break;
    }
    line = doc.line(line.number + 1);
  }
}

function processTable(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from, to } = node;
  if (isCursorInRange(view, from, to)) return;

  const doc = view.state.doc;
  let line = doc.lineAt(from);
  const endLine = doc.lineAt(to);

  while (true) {
    builder.add(line.from, line.to, tableDecoration);
    builder.addLine(line.from, tableLineDecoration);
    if (!isLineWithCursor(view, line.from)) {
      for (let i = 0; i < line.text.length; i++) {
        if (line.text[i] === "|" && !isEscaped(line.text, i)) {
          builder.add(line.from + i, line.from + i + 1, hiddenMarkerDecoration);
        }
      }
    }

    if (line.number === endLine.number) {
      break;
    }
    line = doc.line(line.number + 1);
  }
}

function processHighlightsInRange(
  view: EditorView,
  tree: ReturnType<typeof syntaxTree>,
  builder: DecorationBuilder,
  from: number,
  to: number
) {
  let line = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);

  while (true) {
    if (!isLineWithCursor(view, line.from)) {
      let index = 0;
      while (index < line.text.length) {
        const start = line.text.indexOf(HIGHLIGHT_MARKER, index);
        if (start === -1) {
          break;
        }
        if (isEscaped(line.text, start)) {
          index = start + HIGHLIGHT_MARKER.length;
          continue;
        }
        const end = line.text.indexOf(HIGHLIGHT_MARKER, start + 2);
        if (end === -1) {
          break;
        }
        if (isEscaped(line.text, end)) {
          index = end + HIGHLIGHT_MARKER.length;
          continue;
        }
        const contentStart = line.from + start + 2;
        const contentEnd = line.from + end;
        if (contentEnd > contentStart) {
          const node = tree.resolveInner(contentStart, 1);
          if (!shouldSkipInlineDecoration(node)) {
            builder.add(line.from + start, line.from + start + 2, hiddenMarkerDecoration);
            builder.add(contentStart, contentEnd, highlightDecoration);
            builder.add(line.from + end, line.from + end + 2, hiddenMarkerDecoration);
          }
        }
        index = end + 2;
      }
    }

    if (line.number === endLine.number) {
      break;
    }
    line = view.state.doc.line(line.number + 1);
  }
}

function processInlineMathInRange(
  view: EditorView,
  tree: ReturnType<typeof syntaxTree>,
  builder: DecorationBuilder,
  from: number,
  to: number
) {
  let line = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);

  while (true) {
    if (!isLineWithCursor(view, line.from)) {
      if (line.text.trim() === MATH_BLOCK_DELIMITER) {
        if (line.number === endLine.number) {
          break;
        }
        line = view.state.doc.line(line.number + 1);
        continue;
      }
      for (const match of line.text.matchAll(INLINE_MATH_REGEX)) {
        const index = match.index ?? 0;
        if (isEscaped(line.text, index)) {
          continue;
        }
        const start = line.from + index;
        const end = start + match[0].length;
        const contentStart = start + 1;
        const contentEnd = end - 1;
        if (contentEnd <= contentStart) {
          continue;
        }
        const node = tree.resolveInner(contentStart, 1);
        if (shouldSkipInlineDecoration(node)) {
          continue;
        }
        builder.add(start, start + 1, hiddenMarkerDecoration);
        builder.add(contentStart, contentEnd, mathDecoration);
        builder.add(end - 1, end, hiddenMarkerDecoration);
      }
    }

    if (line.number === endLine.number) {
      break;
    }
    line = view.state.doc.line(line.number + 1);
  }
}

function processFootnotesInRange(
  view: EditorView,
  tree: ReturnType<typeof syntaxTree>,
  builder: DecorationBuilder,
  from: number,
  to: number
) {
  let line = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);

  while (true) {
    const lineText = line.text;
    const hasCursor = isLineWithCursor(view, line.from);
    const lineNode = tree.resolveInner(line.from, 1);
    if (shouldSkipInlineDecoration(lineNode)) {
      if (line.number === endLine.number) {
        break;
      }
      line = view.state.doc.line(line.number + 1);
      continue;
    }

    const defMatch = lineText.match(FOOTNOTE_DEF_REGEX);
    if (defMatch && !hasCursor) {
      const indentLength = defMatch[1].length;
      const markerStart = line.from + indentLength;
      const markerEnd = line.from + defMatch[0].length;
      builder.add(markerStart, markerEnd, hiddenMarkerDecoration);
    }

    for (const match of lineText.matchAll(FOOTNOTE_REF_REGEX)) {
      const index = match.index ?? 0;
      if (isEscaped(lineText, index)) {
        continue;
      }
      const start = line.from + index;
      const end = start + match[0].length;
      const labelStart = start + 2;
      const labelEnd = end - 1;
      if (labelEnd <= labelStart || hasCursor) {
        continue;
      }
      const node = tree.resolveInner(labelStart, 1);
      if (shouldSkipInlineDecoration(node)) {
        continue;
      }
      builder.add(start, start + 2, hiddenMarkerDecoration);
      builder.add(labelStart, labelEnd, footnoteDecoration);
      builder.add(labelEnd, end, hiddenMarkerDecoration);
    }

    if (line.number === endLine.number) {
      break;
    }
    line = view.state.doc.line(line.number + 1);
  }
}

function processWikiEmbedsInRange(
  view: EditorView,
  tree: ReturnType<typeof syntaxTree>,
  builder: DecorationBuilder,
  from: number,
  to: number
) {
  let line = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);
  const notePath = view.dom.dataset.filePath || null;

  while (true) {
    if (!isLineWithCursor(view, line.from)) {
      for (const match of line.text.matchAll(
        new RegExp(WIKI_EMBED_REGEX.source, WIKI_EMBED_REGEX.flags)
      )) {
        const index = match.index ?? 0;
        if (isEscaped(line.text, index)) {
          continue;
        }
        const raw = match[1];
        const parts = parseWikiLinkParts(raw);
        if (!parts) {
          continue;
        }
        const start = line.from + index;
        const end = start + match[0].length;
        const node = tree.resolveInner(start + 1, 1);
        if (shouldSkipInlineDecoration(node)) {
          continue;
        }
        if (isImagePath(parts.target)) {
          const resolvedSrc = resolveAssetUrl(
            notePath,
            stripWikiAnchor(parts.target)
          );
          if (!resolvedSrc) {
            continue;
          }
          builder.add(start, end, hiddenMarkerDecoration);
          builder.addWidget(
            start,
            new ImageWidget(resolvedSrc, parts.display, parts.width, parts.height),
            1
          );
        } else {
          const innerStart = start + 3;
          const innerEnd = end - 2;
          const pipeIndex = raw.indexOf("|");
          if (pipeIndex !== -1) {
            const aliasStart = innerStart + pipeIndex + 1;
            if (aliasStart < innerEnd) {
              builder.add(start, aliasStart, hiddenMarkerDecoration);
              builder.add(aliasStart, innerEnd, linkDecoration);
              builder.add(innerEnd, end, hiddenMarkerDecoration);
            }
          } else {
            builder.add(start, innerStart, hiddenMarkerDecoration);
            builder.add(innerStart, innerEnd, linkDecoration);
            builder.add(innerEnd, end, hiddenMarkerDecoration);
          }
        }
      }
    }

    if (line.number === endLine.number) {
      break;
    }
    line = view.state.doc.line(line.number + 1);
  }
}

function isInsideLinkContainer(
  node: SyntaxNode | null
): boolean {
  let current: SyntaxNode | null = node;
  while (current) {
    if (LINK_CONTAINER_NODES.has(current.name)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function processBareUrlsInRange(
  view: EditorView,
  tree: ReturnType<typeof syntaxTree>,
  builder: DecorationBuilder,
  from: number,
  to: number
) {
  let line = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);

  while (true) {
    for (const match of line.text.matchAll(
      new RegExp(BARE_URL_REGEX.source, BARE_URL_REGEX.flags)
    )) {
      const index = match.index ?? 0;
      if (isEscaped(line.text, index)) {
        continue;
      }
      const fromPos = line.from + index;
      const toPos = fromPos + match[0].length;
      if (fromPos >= toPos) {
        continue;
      }
      const node = tree.resolveInner(fromPos, 1);
      if (isInsideLinkContainer(node) || shouldSkipInlineDecoration(node)) {
        continue;
      }
      builder.add(fromPos, toPos, linkDecoration);
    }

    if (line.number === endLine.number) {
      break;
    }
    line = view.state.doc.line(line.number + 1);
  }
}

function processWikiLinksInRange(
  view: EditorView,
  tree: ReturnType<typeof syntaxTree>,
  builder: DecorationBuilder,
  from: number,
  to: number
) {
  let line = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);

  while (true) {
    if (!isLineWithCursor(view, line.from)) {
      for (const match of line.text.matchAll(
        new RegExp(WIKI_LINK_REGEX.source, WIKI_LINK_REGEX.flags)
      )) {
        const index = match.index ?? 0;
        if (index > 0 && line.text[index - 1] === "!") {
          continue;
        }
        if (isEscaped(line.text, index)) {
          continue;
        }
        const fromPos = line.from + index;
        const toPos = fromPos + match[0].length;
        if (fromPos + 2 >= toPos - 2) {
          continue;
        }
        const node = tree.resolveInner(fromPos + 2, 1);
        if (shouldSkipInlineDecoration(node)) {
          continue;
        }
        const parts = parseWikiLinkParts(match[1]);
        if (!parts) {
          continue;
        }
        const pipeIndex = match[1].indexOf("|");
        if (pipeIndex !== -1) {
          const aliasStart = fromPos + 2 + pipeIndex + 1;
          if (aliasStart < toPos - 2) {
            builder.add(fromPos, aliasStart, hiddenMarkerDecoration);
            builder.add(aliasStart, toPos - 2, linkDecoration);
            builder.add(toPos - 2, toPos, hiddenMarkerDecoration);
          }
        } else {
          builder.add(fromPos, fromPos + 2, hiddenMarkerDecoration);
          builder.add(fromPos + 2, toPos - 2, linkDecoration);
          builder.add(toPos - 2, toPos, hiddenMarkerDecoration);
        }
      }
    }

    if (line.number === endLine.number) {
      break;
    }
    line = view.state.doc.line(line.number + 1);
  }
}

function processMathBlocks(
  view: EditorView,
  tree: ReturnType<typeof syntaxTree>,
  builder: DecorationBuilder
) {
  const doc = view.state.doc;
  let inBlock = false;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;
    const node = tree.resolveInner(line.from, 1);
    if (shouldSkipInlineDecoration(node)) {
      continue;
    }

    const markerIndex = lineText.indexOf(MATH_BLOCK_DELIMITER);
    const hasMarker =
      lineText.trim() === MATH_BLOCK_DELIMITER &&
      markerIndex !== -1 &&
      !isEscaped(lineText, markerIndex);
    const hasCursor = isLineWithCursor(view, line.from);

    if (hasMarker) {
      if (!hasCursor) {
        builder.add(line.from, line.to, hiddenMarkerDecoration);
      }
      inBlock = !inBlock;
      continue;
    }

    if (inBlock && !hasCursor) {
      builder.addLine(line.from, mathBlockLineDecoration);
    }
  }
}

function processComments(
  view: EditorView,
  tree: ReturnType<typeof syntaxTree>,
  builder: DecorationBuilder
) {
  const doc = view.state.doc;
  let inBlock = false;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;
    const node = tree.resolveInner(line.from, 1);
    if (shouldSkipInlineDecoration(node)) {
      continue;
    }

    const hasCursor = isLineWithCursor(view, line.from);
    let index = 0;
    let closedInLine = false;

    while (index < lineText.length) {
      const markerIndex = lineText.indexOf(COMMENT_MARKER, index);
      if (markerIndex === -1) {
        break;
      }
      if (isEscaped(lineText, markerIndex)) {
        index = markerIndex + COMMENT_MARKER.length;
        continue;
      }

      if (!inBlock) {
        const closingIndex = lineText.indexOf(
          COMMENT_MARKER,
          markerIndex + COMMENT_MARKER.length
        );
        if (closingIndex !== -1 && !isEscaped(lineText, closingIndex)) {
          if (!hasCursor) {
            builder.add(
              line.from + markerIndex,
              line.from + closingIndex + COMMENT_MARKER.length,
              hiddenMarkerDecoration
            );
          }
          index = closingIndex + COMMENT_MARKER.length;
          continue;
        }

        inBlock = true;
        if (!hasCursor) {
          builder.add(line.from + markerIndex, line.to, hiddenMarkerDecoration);
        }
        break;
      }

      if (!hasCursor) {
        builder.add(
          line.from,
          line.from + markerIndex + COMMENT_MARKER.length,
          hiddenMarkerDecoration
        );
      }
      inBlock = false;
      closedInLine = true;
      index = markerIndex + COMMENT_MARKER.length;
    }

    if (inBlock && !closedInLine && !hasCursor) {
      builder.add(line.from, line.to, hiddenMarkerDecoration);
    }
  }
}

// Main ViewPlugin for live preview
class LivePreviewPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: EditorView): DecorationSet {
    const decorations: { from: number; to: number; deco: Decoration }[] = [];
    const widgets: { pos: number; widget: WidgetType; side: number }[] = [];

    const tree = syntaxTree(view.state);
    const builder: DecorationBuilder = {
      add: (from, to, deco) => {
        if (from < to) {
          decorations.push({ from, to, deco });
        }
      },
      addLine: (pos, deco) => {
        decorations.push({ from: pos, to: pos, deco });
      },
      addWidget: (pos, widget, side = 1) => {
        widgets.push({ pos, widget, side });
      },
    };

    // Iterate through visible ranges for performance
    for (const { from, to } of view.visibleRanges) {
      tree.iterate({
        from,
        to,
        enter: (node) => {
          const nodeName = node.name;

          // Process different node types
          switch (nodeName) {
            case "StrongEmphasis":
              processEmphasis(node, view, builder);
              break;
            case "Emphasis":
              processEmphasis(node, view, builder);
              break;
            case "InlineCode":
              processInlineCode(node, view, builder);
              break;
            case "Subscript":
              processSubSuper(node, view, builder, subscriptDecoration);
              break;
            case "Superscript":
              processSubSuper(node, view, builder, superscriptDecoration);
              break;
            case "Link":
              processLink(node, view, builder);
              break;
            case "Autolink":
            case "URL":
              processAutolink(node, view, builder);
              break;
            case "Image":
              processImage(node, view, builder);
              break;
            case "Strikethrough":
              processStrikethrough(node, view, builder);
              break;
            case "HorizontalRule":
              processHorizontalRule(node, view, builder);
              break;
            case "ATXHeading1":
              processHeading(node, view, builder, 1);
              break;
            case "ATXHeading2":
              processHeading(node, view, builder, 2);
              break;
            case "ATXHeading3":
              processHeading(node, view, builder, 3);
              break;
            case "ATXHeading4":
              processHeading(node, view, builder, 4);
              break;
            case "ATXHeading5":
              processHeading(node, view, builder, 5);
              break;
            case "ATXHeading6":
              processHeading(node, view, builder, 6);
              break;
            case "SetextHeading1":
              processSetextHeading(node, view, builder, 1);
              break;
            case "SetextHeading2":
              processSetextHeading(node, view, builder, 2);
              break;
            case "Blockquote":
              processBlockquote(node, view, builder);
              break;
            case "FencedCode":
            case "CodeBlock":
              processCodeBlock(node, view, builder);
              break;
            case "Table":
              processTable(node, view, builder);
              break;
            case "ListItem":
              processListItem(node, view, builder);
              break;
          }
        },
      });
      processWikiEmbedsInRange(view, tree, builder, from, to);
      processBareUrlsInRange(view, tree, builder, from, to);
      processWikiLinksInRange(view, tree, builder, from, to);
      processHighlightsInRange(view, tree, builder, from, to);
      processInlineMathInRange(view, tree, builder, from, to);
      processFootnotesInRange(view, tree, builder, from, to);
    }

    // Process task lists (checkboxes) - not part of syntax tree iteration
    processTaskList(view, tree, builder);
    processMathBlocks(view, tree, builder);
    processComments(view, tree, builder);

    // Combine mark decorations and widget decorations
    const allDecorations: { from: number; to: number; value: Decoration }[] = [];

    // Add mark decorations
    for (const d of decorations) {
      allDecorations.push({ from: d.from, to: d.to, value: d.deco });
    }

    // Add widget decorations
    for (const w of widgets) {
      allDecorations.push({
        from: w.pos,
        to: w.pos,
        value: Decoration.widget({ widget: w.widget, side: w.side }),
      });
    }

    // Sort all decorations by position
    allDecorations.sort((a, b) => a.from - b.from || a.to - b.to);

    return Decoration.set(
      allDecorations.map((d) =>
        d.from === d.to
          ? (d.value as Decoration).range(d.from)
          : d.value.range(d.from, d.to)
      ),
      true
    );
  }
}

// Create the ViewPlugin
export const livePreviewPlugin = ViewPlugin.fromClass(LivePreviewPlugin, {
  decorations: (v) => v.decorations,
});

// Live preview theme with styles
export const livePreviewTheme = EditorView.baseTheme({
  // Hidden marker style - text remains selectable but invisible
  ".cm-md-hidden": {
    color: "transparent",
    fontSize: "1px",
    letterSpacing: "-1px",
  },

  // Bold
  ".cm-md-bold": {
    fontWeight: "700",
  },

  // Italic
  ".cm-md-italic": {
    fontStyle: "italic",
  },

  // Inline code
  ".cm-md-code": {
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
    backgroundColor: "hsl(var(--muted))",
    padding: "0.125rem 0.25rem",
    borderRadius: "0.25rem",
    fontSize: "0.875em",
  },

  // Link
  ".cm-md-link": {
    color: "hsl(var(--primary))",
    textDecoration: "underline",
    cursor: "pointer",
  },

  // Strikethrough
  ".cm-md-strikethrough": {
    textDecoration: "line-through",
    opacity: "0.7",
  },

  // Highlight
  ".cm-md-highlight": {
    backgroundColor: "hsl(var(--accent) / 0.35)",
    borderRadius: "0.2rem",
    padding: "0 0.1rem",
  },

  // Subscript & superscript
  ".cm-md-subscript": {
    fontSize: "0.8em",
    verticalAlign: "sub",
  },
  ".cm-md-superscript": {
    fontSize: "0.8em",
    verticalAlign: "super",
  },

  // Footnotes
  ".cm-md-footnote": {
    fontSize: "0.75em",
    verticalAlign: "super",
    color: "hsl(var(--primary))",
  },

  // Math
  ".cm-md-math": {
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
    backgroundColor: "hsl(var(--muted))",
    padding: "0.125rem 0.25rem",
    borderRadius: "0.25rem",
    fontSize: "0.9em",
  },

  // Headings
  ".cm-md-heading": {
    fontWeight: "700",
    lineHeight: "1.3",
  },
  ".cm-md-heading-1": {
    fontSize: "2em",
  },
  ".cm-md-heading-2": {
    fontSize: "1.5em",
  },
  ".cm-md-heading-3": {
    fontSize: "1.25em",
  },
  ".cm-md-heading-4": {
    fontSize: "1.1em",
  },
  ".cm-md-heading-5": {
    fontSize: "1em",
  },
  ".cm-md-heading-6": {
    fontSize: "0.9em",
  },

  // Blockquote
  ".cm-md-quote": {
    borderLeft: "3px solid hsl(var(--border))",
    paddingLeft: "1rem",
    fontStyle: "italic",
    color: "hsl(var(--muted-foreground))",
  },

  // Callouts
  ".cm-md-callout-line": {
    backgroundColor: "hsl(var(--muted) / 0.35)",
    borderLeft: "4px solid hsl(var(--primary))",
    paddingLeft: "0.75rem",
  },
  ".cm-md-callout-title": {
    display: "block",
    fontWeight: "600",
    fontSize: "0.85em",
    color: "hsl(var(--primary))",
    margin: "0.35rem 0 0.15rem",
  },
  ".cm-md-callout-line .cm-md-quote": {
    borderLeft: "none",
    paddingLeft: "0",
    fontStyle: "normal",
    color: "hsl(var(--foreground))",
  },

  // List marker
  ".cm-md-list-marker": {
    color: "hsl(var(--primary))",
    fontWeight: "600",
  },
  ".cm-md-list-bullet": {
    display: "inline-block",
    minWidth: "1.5rem",
    textAlign: "right",
    marginRight: "0.5rem",
    color: "hsl(var(--primary))",
    fontWeight: "600",
  },
  ".cm-md-list-bullet-unordered": {
    textAlign: "center",
  },

  // Checkbox
  ".cm-md-checkbox": {
    width: "16px",
    height: "16px",
    marginRight: "8px",
    verticalAlign: "middle",
    cursor: "pointer",
    accentColor: "hsl(var(--primary))",
  },

  // Task checked text
  ".cm-md-task-checked": {
    textDecoration: "line-through",
    opacity: "0.6",
    color: "hsl(var(--muted-foreground))",
  },

  // Code blocks
  ".cm-md-code-block": {
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  },
  ".cm-md-code-block-line": {
    backgroundColor: "hsl(var(--muted) / 0.4)",
    borderRadius: "0.25rem",
    padding: "0 0.5rem",
  },

  // Tables
  ".cm-md-table": {
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  },
  ".cm-md-table-line": {
    backgroundColor: "hsl(var(--muted) / 0.25)",
    padding: "0 0.35rem",
  },

  // Math blocks
  ".cm-md-math-block-line": {
    backgroundColor: "hsl(var(--muted) / 0.3)",
    padding: "0.25rem 0.5rem",
    textAlign: "center",
    fontFamily: "ui-serif, Georgia, serif",
  },

  // Horizontal rule
  ".cm-md-hr": {
    border: "none",
    borderTop: "1px solid hsl(var(--border))",
    margin: "0.75rem 0",
  },

  ".cm-md-image": {
    display: "block",
    padding: "0.5rem 0",
  },

  ".cm-md-image img": {
    display: "block",
    maxWidth: "100%",
    height: "auto",
    borderRadius: "0.5rem",
  },
});

// Combined extension
export function livePreview(): Extension {
  return [livePreviewPlugin, livePreviewTheme];
}

export default livePreview;
