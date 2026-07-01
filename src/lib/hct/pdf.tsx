/* Client-only executive PDF generator (jsPDF) */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  CONSULTANT_NAME,
  PROBLEM_CATEGORIES,
  FOH_IMPACT_DISCLAIMER,
  isFohImpactCategory,
  DIAGNOSIS_TYPES,
  BSPS_SOLUTIONS,
  SHIFTS,
  labelOf,
  formatEUR,
  formatDate,
} from "./constants";
import { NotoSansRegularBase64 } from "./fonts/NotoSansRegular";
import { NotoSansBoldBase64 } from "./fonts/NotoSansBold";

const FONT_FAMILY = "NotoSans";

function registerUnicodeFonts(doc: jsPDF) {
  doc.addFileToVFS("NotoSans-Regular.ttf", NotoSansRegularBase64);
  doc.addFont("NotoSans-Regular.ttf", FONT_FAMILY, "normal");
  doc.addFileToVFS("NotoSans-Bold.ttf", NotoSansBoldBase64);
  doc.addFont("NotoSans-Bold.ttf", FONT_FAMILY, "bold");
  doc.setFont(FONT_FAMILY, "normal");
}

type Audit = {
  id: string;
  audit_date: string;
  shift: string;
  problem_category: string;
  diagnosis_type: string;
  estimated_loss_eur: number | string;
  is_positive?: boolean;
  observation_type?: "negative" | "positive" | "emotional" | string;
  experience_impact?: "high" | "medium" | "low" | null;
  bsps_solution: string;
  actionable_steps?: string;
};


export async function downloadExecutiveReport(
  venueName: string,
  audits: Audit[],
  chiefDiagnosis?: string,
  economics?: { covers: number; revenue_ceiling: number; max_total_loss: number } | null,
  severity?: { level: "good" | "moderate" | "critical"; label: string; loss_pct_of_ceiling: number; positive_observations: number; negative_observations: number } | null,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  registerUnicodeFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const tableWidth = pageWidth - margin * 2;
  const col6Width = tableWidth - (55 + 65 + 100 + 85 + 60 + 55);

  const obsTypeOf = (a: Audit): "negative" | "positive" | "emotional" => {
    if (a.observation_type === "positive" || a.observation_type === "emotional" || a.observation_type === "negative") {
      return a.observation_type;
    }
    return a.is_positive ? "positive" : "negative";
  };
  const totalLoss = audits.reduce(
    (acc, b) => acc + (obsTypeOf(b) === "negative" ? Number(b.estimated_loss_eur || 0) : 0),
    0,
  );
  const structural = audits.filter((a) => obsTypeOf(a) === "negative").length;
  const emotional = audits.filter((a) => obsTypeOf(a) === "positive").length;
  const experiential = audits.filter((a) => obsTypeOf(a) === "emotional").length;
  const dates = audits.map((a) => a.audit_date).sort();
  const range =
    dates.length === 0
      ? "—"
      : dates[0] === dates[dates.length - 1]
        ? formatDate(dates[0])
        : `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`;

  // Header band
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("SDT — SERVICE DIAGNOSTIC TOOL", margin, margin);

  doc.setFontSize(18);
  doc.setTextColor(13, 27, 42);
  doc.setFont(FONT_FAMILY, "bold");
  doc.text("Executive Audit Report", margin, margin + 22);

  // Gold rule
  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(1.2);
  doc.line(margin, margin + 32, pageWidth - margin, margin + 32);

  // Meta row
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text("CONSULTANT", margin, margin + 50);
  doc.text("VENUE", margin + 180, margin + 50);
  doc.text("AUDIT PERIOD", margin + 360, margin + 50);

  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(10);
  doc.setTextColor(13, 27, 42);
  doc.text(CONSULTANT_NAME, margin, margin + 64);
  doc.text(venueName, margin + 180, margin + 64);
  doc.text(range, margin + 360, margin + 64);

  // KPI section
  let y = margin + 96;
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text("EXECUTIVE SUMMARY", margin, y);
  y += 10;

  const kpiW = (pageWidth - margin * 2 - 20) / 3;
  const kpiH = 64;
  const kpis = [
    { label: "TOTAL OBSERVATIONS", value: String(audits.length) },
    { label: "AUDITED FINANCIAL LOSS", value: formatEUR(totalLoss) },
    {
      label: "STRUCTURAL / EMOTIONAL / EXPERIENTIAL",
      value: `${structural} / ${emotional} / ${experiential}`,
    },
  ];
  kpis.forEach((k, i) => {
    const x = margin + i * (kpiW + 10);
    doc.setDrawColor(220);
    doc.setLineWidth(0.5);
    doc.rect(x, y, kpiW, kpiH);
    doc.setFontSize(6);
    doc.setTextColor(140);
    doc.setFont(FONT_FAMILY, "normal");
    doc.text(k.label, x + 10, y + 16);
    doc.setFontSize(i === 2 ? 15 : 18);
    doc.setTextColor(13, 27, 42);
    doc.setFont(FONT_FAMILY, "bold");
    doc.text(k.value, x + 10, y + 44);
  });
  y += kpiH + 16;

  if (severity) {
    const palette: Record<string, [number, number, number]> = {
      good: [22, 101, 52],
      moderate: [161, 98, 7],
      critical: [153, 27, 27],
    };
    const fill: Record<string, [number, number, number]> = {
      good: [236, 253, 245],
      moderate: [255, 247, 237],
      critical: [254, 242, 242],
    };
    const c = palette[severity.level];
    const f = fill[severity.level];
    const bw = pageWidth - margin * 2;
    const bh = 46;
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setFillColor(f[0], f[1], f[2]);
    doc.setLineWidth(0.8);
    doc.rect(margin, y, bw, bh, "FD");
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.setFont(FONT_FAMILY, "normal");
    doc.text("OVERALL SEVERITY", margin + 12, y + 14);
    doc.setFont(FONT_FAMILY, "bold");
    doc.setFontSize(16);
    doc.setTextColor(c[0], c[1], c[2]);
    doc.text(severity.label.toUpperCase(), margin + 12, y + 34);
    doc.setFont(FONT_FAMILY, "normal");
    doc.setFontSize(9);
    doc.setTextColor(60);
    const meta = `Loss ${Math.round(severity.loss_pct_of_ceiling)} % of cap   ·   ${severity.positive_observations} positive / ${severity.negative_observations} negative observations`;
    doc.text(meta, margin + 152, y + 30);
    y += bh + 16;
  }


  if (economics) {
    doc.setFont(FONT_FAMILY, "normal");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text("VENUE ECONOMICS", margin, y);
    y += 12;
    doc.setFont(FONT_FAMILY, "normal");
    doc.setFontSize(9);
    doc.setTextColor(13, 27, 42);
    const capPct = economics.revenue_ceiling > 0
      ? Math.round((economics.max_total_loss / economics.revenue_ceiling) * 100)
      : 0;
    const line = `Covers / shift: ${economics.covers}   ·   Revenue ceiling: ${formatEUR(Math.round(economics.revenue_ceiling))}   ·   Max loss (${capPct} %): ${formatEUR(Math.round(economics.max_total_loss))}`;
    doc.text(line, margin, y);
    y += 18;
  } else {
    y += 8;
  }

  // Chief Diagnosis (AI-generated narrative)
  if (chiefDiagnosis && chiefDiagnosis.trim()) {
    doc.setFont(FONT_FAMILY, "normal");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text("CHIEF DIAGNOSIS", margin, y);
    y += 10;

    const innerW = pageWidth - margin * 2;
    const padX = 14;
    const padY = 14;
    doc.setFont(FONT_FAMILY, "normal");
    doc.setFontSize(10);
    doc.setTextColor(13, 27, 42);
    const lines = doc.splitTextToSize(chiefDiagnosis.trim(), innerW - padX * 2) as string[];
    const lineH = 14;
    const boxH = padY * 2 + lines.length * lineH;

    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.8);
    doc.setFillColor(252, 249, 240);
    doc.rect(margin, y, innerW, boxH, "FD");

    doc.text(lines, margin + padX, y + padY + 10);
    y += boxH + 24;
  }



  // Audit details table
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text("AUDIT DETAILS", margin, y);
  y += 8;

  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(8);

  // Normalize actionable steps: collapse whitespace, keep as a single string
  // so autoTable handles wrapping without injecting commas or hyphenating words.
  const cleanSteps = (s?: string) =>
    (s ?? "").replace(/\s+/g, " ").trim();

  const rows = audits.map((a) => [
    formatDate(a.audit_date),
    labelOf(SHIFTS, a.shift || "") || "—",
    (labelOf(PROBLEM_CATEGORIES, a.problem_category || "") || "—") +
      (isFohImpactCategory(a.problem_category) ? `\n${FOH_IMPACT_DISCLAIMER}` : ""),
    labelOf(DIAGNOSIS_TYPES, a.diagnosis_type || "") || "—",
    a.is_positive ? "Positive Observation" : formatEUR(Number(a.estimated_loss_eur ?? 0)),
    (labelOf(BSPS_SOLUTIONS, a.bsps_solution || "") || "").split(" — ")[0] || "—",
    cleanSteps(a.actionable_steps) || "—",
  ]);

  autoTable(doc, {
    startY: y + 4,
    head: [["Date", "Shift", "Category", "Diagnosis Type", "Financial Loss", "BSPS Solution", "Actionable Steps"]],
    body: rows.length
      ? rows
      : [["—", "—", "—", "—", "—", "—", "No audit entries in scope."]],
    styles: {
      font: FONT_FAMILY,
      fontSize: 8,
      cellPadding: 5,
      textColor: [13, 27, 42],
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      font: FONT_FAMILY,
      fillColor: [245, 245, 245],
      textColor: [120, 120, 120],
      fontStyle: "bold",
      fontSize: 7,
    },
    bodyStyles: {
      font: FONT_FAMILY,
      overflow: "linebreak",
      valign: "top",
    },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 65 },
      2: { cellWidth: 100 },
      3: { cellWidth: 85 },
      4: { cellWidth: 60, halign: "right" },
      5: { cellWidth: 55, halign: "right" },
      6: { cellWidth: col6Width, fontStyle: "normal" },
    },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(140);
      doc.text(
        `Confidential — prepared by ${CONSULTANT_NAME}`,
        margin,
        pageHeight - 20,
      );
      const pageNum = doc.getNumberOfPages();
      doc.text(
        `${doc.getCurrentPageInfo().pageNumber} / ${pageNum}`,
        pageWidth - margin,
        pageHeight - 20,
        { align: "right" },
      );
    },
  });

  const safe = venueName.replace(/[^a-z0-9-_]+/gi, "_");
  const filename = `SDT_Executive_Report_${safe}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(filename);
}
