// One-off CJS generator (kept runnable per script-persistence rule): require() is the
// correct syntax here since package.json has no "type":"module". Not app code.
/* eslint-disable @typescript-eslint/no-require-imports */
// Mudaala API Security & Test Coverage Report — docx generator (skill: docx, route: create, scene: report)
// Cover: Recipe R1 (Pure Paragraph Left) + DM-1 palette (report + tech industry, per selectCoverRecipe)
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, NumberFormat, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, SectionType, TableLayoutType,
  TableOfContents, PageBreak, LevelFormat,
} = require("docx");
const fs = require("fs");
const D = require("./report-data.js");

// ── Palette DM-1 (Deep Cyan) — design-system.md ──
const P = {
  bg: "162235", accent: "37DCF2",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  table: { headerBg: "1B6B7A", headerText: "FFFFFF", accentLine: "1B6B7A", innerLine: "C8DDE2", surface: "EDF3F5" },
  primary: "1B6B7A", // heading brand color on white pages (darkened accent per high-saturation override rule)
};

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

function safeText(v, ph) {
  if (v === undefined || v === null || v === "" || String(v) === "NaN" || String(v) === "undefined") return ph || "-";
  return String(v);
}

// ── calcTitleLayout (design-system.md) — char width adapted for Latin text (pt*11 twips vs CJK pt*20) ──
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([...",.;:!?", ..."-_/", ..." \t"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += last;
  }
  return lines;
}
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 11; // Latin average (bold Arial)
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) { lines = splitTitleLines(title, charsPerLine(minPt)); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}
function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const safeRemaining = Math.max(usableHeight - contentHeight, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ── Recipe R1: Pure Paragraph Cover (Left-Aligned) — design-system.md ──
function buildCoverR1(config) {
  const PAL = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: PAL.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PAL.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: PAL.accent, font: { ascii: "Arial", eastAsia: "SimHei" }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: PAL.cover.titleColor, font: { ascii: "Arial", eastAsia: "SimHei" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 800, line: 312 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: PAL.cover.subtitleColor, font: { ascii: "Arial", eastAsia: "Microsoft YaHei" } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: PAL.cover.metaColor, font: { ascii: "Arial", eastAsia: "Microsoft YaHei" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: PAL.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: PAL.cover.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: PAL.cover.footerColor, font: { ascii: "Arial" } }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: PAL.bg }, borders: noBorders,
        verticalAlign: "top",
        children,
      })],
    })],
  })];
}

// ── Body builders (Profile A formal, English) ──
const F = { ascii: "Times New Roman", eastAsia: "SimSun" };
const MONO = { ascii: "Courier New", eastAsia: "SimSun" };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER,
    spacing: { before: 360, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 32, color: P.primary, font: F })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, size: 30, color: P.primary, font: F })],
  });
}
function body(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120, ...(opts.spacing || {}) },
    children: [new TextRun({ text: safeText(text), size: 24, color: "000000", font: F })],
  });
}
function bodyRuns(runs, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120, ...(opts.spacing || {}) },
    children: runs,
  });
}
function r(text, o = {}) { return new TextRun({ text: safeText(text), size: o.size || 24, bold: !!o.bold, italics: !!o.i, color: o.color || "000000", font: o.mono ? MONO : F }); }
function numbered(text, ref) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    alignment: AlignmentType.LEFT,
    spacing: { line: 312, after: 80 },
    children: [new TextRun({ text: safeText(text), size: 24, color: "000000", font: F })],
  });
}
let tableCounter = 0;
function tableCaption(text) {
  tableCounter += 1;
  return new Paragraph({
    keepNext: true, spacing: { before: 160, after: 80, line: 312 },
    children: [new TextRun({ text: "Table " + tableCounter + ": " + text, bold: true, size: 21, color: "000000", font: F })],
  });
}
function cellPara(content, o = {}) {
  const runs = Array.isArray(content) ? content : [r(content, { size: o.size || 18, bold: o.bold, mono: o.mono, color: o.color })];
  return new Paragraph({ alignment: o.align || AlignmentType.LEFT, spacing: { line: 276 }, children: runs });
}
function dataTable(headers, widths, rows, opts = {}) {
  const size = opts.size || 18;
  const headerRow = new TableRow({
    tableHeader: true, cantSplit: true,
    children: headers.map((htext, i) => new TableCell({
      children: [cellPara([r(htext, { size, bold: true, color: P.table.headerText })])],
      shading: { type: ShadingType.CLEAR, fill: P.table.headerBg },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      width: { size: widths[i], type: WidthType.PERCENTAGE },
    })),
  });
  const dataRows = rows.map((row, ri) => new TableRow({
    cantSplit: true,
    children: row.map((cell, ci) => {
      const o = { size, ...(opts.cellOpts ? (opts.cellOpts(ri, ci, cell) || {}) : {}) };
      const shading = opts.zebra && ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: P.table.surface } : undefined;
      return new TableCell({
        children: [cellPara(cell, o)],
        shading,
        margins: { top: 50, bottom: 50, left: 100, right: 100 },
        width: { size: widths[ci], type: WidthType.PERCENTAGE },
      });
    }),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 8, color: P.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: P.table.accentLine },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine },
      insideVertical: NB,
    },
    rows: [headerRow, ...dataRows],
  });
}

module.exports = { P, buildCoverR1, h1, h2, body, bodyRuns, r, numbered, tableCaption, dataTable, cellPara, safeText, F, MONO, Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber, NumberFormat, AlignmentType, HeadingLevel, SectionType, TableOfContents, PageBreak, LevelFormat, fs, D };
