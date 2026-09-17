// Shared, professionally-styled Word (.docx) report generator — mirrors
// excelExport.ts's ReportOptions/ReportTable shape so callers (e.g. the
// chatbot's report generator) can build one options object and hand it to
// either exporter. Uses the docx package, imported dynamically so it's only
// loaded client-side.

import type { ReportOptions } from "./excelExport";

const BRAND = {
    blue: "0038A8",
    blueDark: "00296B",
    gold: "FCD116",
    slate: "64748B",
    light: "F1F5F9",
    black: "1E293B",
};

function fmtDate(d: Date): string {
    return d.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

function isNum(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}

/** Prompt-free download of a Blob. */
export function triggerWordDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Build a styled .docx report and return it as a Blob. Same content model as
 * buildReportWorkbook (excelExport.ts): a title band, a meta block, then one
 * or more tables with an optional totals row.
 */
export async function buildReportDocument(opts: ReportOptions): Promise<Blob> {
    const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        Table,
        TableRow,
        TableCell,
        HeadingLevel,
        AlignmentType,
        WidthType,
        BorderStyle,
        ShadingType,
    } = await import("docx");

    const accent = opts.accent || BRAND.blue;
    const children: any[] = [];

    children.push(
        new Paragraph({
            heading: HeadingLevel.TITLE,
            shading: { type: ShadingType.SOLID, color: accent, fill: accent },
            border: {
                bottom: { style: BorderStyle.SINGLE, size: 24, color: BRAND.gold },
            },
            spacing: { before: 100, after: 100 },
            children: [
                new TextRun({
                    text: (opts.title || "CEDIMS Report").toUpperCase(),
                    bold: true,
                    color: "FFFFFF",
                    size: 32,
                }),
            ],
        }),
    );

    if (opts.subtitle) {
        children.push(
            new Paragraph({
                shading: { type: ShadingType.SOLID, color: BRAND.blueDark, fill: BRAND.blueDark },
                spacing: { after: 200 },
                children: [
                    new TextRun({ text: opts.subtitle, italics: true, color: "FFFFFF", size: 22 }),
                ],
            }),
        );
    }

    const metaRows: { label: string; value: string }[] = [
        { label: "Generated On", value: fmtDate(new Date()) },
        ...(opts.meta || []),
    ];
    for (const m of metaRows) {
        children.push(
            new Paragraph({
                spacing: { after: 60 },
                children: [
                    new TextRun({ text: `${m.label}:  `, bold: true, color: BRAND.slate, size: 20 }),
                    new TextRun({ text: m.value, bold: true, color: BRAND.black, size: 20 }),
                ],
            }),
        );
    }
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));

    let hadTable = false;
    for (const table of opts.tables) {
        if (!table.headers?.length || table.rows.length === 0) continue;
        hadTable = true;

        if (table.title) {
            children.push(
                new Paragraph({
                    spacing: { before: 200, after: 100 },
                    children: [
                        new TextRun({ text: table.title.toUpperCase(), bold: true, color: accent, size: 24 }),
                    ],
                }),
            );
        }

        const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" };
        const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

        const headerRow = new TableRow({
            tableHeader: true,
            children: table.headers.map(
                (h) =>
                    new TableCell({
                        shading: { type: ShadingType.SOLID, color: BRAND.blueDark, fill: BRAND.blueDark },
                        borders,
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 18 })],
                            }),
                        ],
                    }),
            ),
        });

        const dataRows = table.rows.map(
            (r, ri) =>
                new TableRow({
                    children: r.map(
                        (val) =>
                            new TableCell({
                                shading:
                                    ri % 2 === 1
                                        ? { type: ShadingType.SOLID, color: BRAND.light, fill: BRAND.light }
                                        : undefined,
                                borders,
                                children: [
                                    new Paragraph({
                                        alignment: isNum(val) ? AlignmentType.RIGHT : AlignmentType.LEFT,
                                        children: [
                                            new TextRun({
                                                text: val == null ? "" : String(val),
                                                color: BRAND.black,
                                                size: 18,
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                    ),
                }),
        );

        const rows = [headerRow, ...dataRows];

        if (table.totalsRow) {
            rows.push(
                new TableRow({
                    children: table.totalsRow.map(
                        (val) =>
                            new TableCell({
                                shading: { type: ShadingType.SOLID, color: BRAND.gold, fill: BRAND.gold },
                                borders,
                                children: [
                                    new Paragraph({
                                        children: [
                                            new TextRun({
                                                text: val == null ? "" : String(val),
                                                bold: true,
                                                color: BRAND.black,
                                                size: 18,
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                    ),
                }),
            );
        }

        children.push(
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows,
            }),
        );
        children.push(new Paragraph({ text: "", spacing: { after: 300 } }));
    }

    if (!hadTable) {
        children.push(
            new Paragraph({
                children: [
                    new TextRun({ text: "No data available to export.", italics: true, color: BRAND.slate }),
                ],
            }),
        );
    }

    const doc = new Document({
        sections: [{ children }],
    });

    return Packer.toBlob(doc);
}

/**
 * High-level helper: build a styled report document and immediately download
 * it, returning a humanized summary message for toast/chat feedback.
 */
export async function exportStyledWord(opts: ReportOptions): Promise<string> {
    const blob = await buildReportDocument(opts);
    triggerWordDownload(blob, opts.fileName);
    const totalRows = opts.tables.reduce((acc, t) => acc + t.rows.length, 0);
    return `Exported ${totalRows} record${totalRows === 1 ? "" : "s"} as ${opts.fileName}`;
}
