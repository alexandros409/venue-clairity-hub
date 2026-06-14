/* Client-only executive PDF generator (jsPDF) */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  CONSULTANT_NAME,
  PROBLEM_CATEGORIES,
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
  bsps_solution: string;
  actionable_steps?: string;
};

function wrapSteps(raw: string | undefined): string {
  if (!raw) return "—";
  return raw;
}

export async function downloadExecutiveReport(
  venueName: string,
  audits: Audit[],
  chiefDiagnosis?: string,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  registerUnicodeFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  const totalLoss = audits.reduce(
    (a, b) => a + Number(b.estimated_loss_eur || 0),
    0,
  );
  const struct = audits.filter((a) => a.diagnosis_type !== "emotion").length;
  const emo = audits.filter((a) => a.diagnosis_type !== "structure").length;
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
  doc.text("HCT — HOSPITALITY DIAGNOSTIC TOOL", margin, margin);

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
    { label: "STRUCTURAL / EMOTIONAL", value: `${struct} / ${emo}` },
  ];
  kpis.forEach((k, i) => {
    const x = margin + i * (kpiW + 10);
    doc.setDrawColor(220);
    doc.setLineWidth(0.5);
    doc.rect(x, y, kpiW, kpiH);
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.setFont(FONT_FAMILY, "normal");
    doc.text(k.label, x + 10, y + 16);
    doc.setFontSize(18);
    doc.setTextColor(13, 27, 42);
    doc.setFont(FONT_FAMILY, "bold");
    doc.text(k.value, x + 10, y + 44);
  });
  y += kpiH + 24;

  // Audit details table
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text("AUDIT DETAILS", margin, y);
  y += 8;

  const rows = audits.map((a) => [
    formatDate(a.audit_date),
    labelOf(SHIFTS, a.shift),
    labelOf(PROBLEM_CATEGORIES, a.problem_category),
    labelOf(DIAGNOSIS_TYPES, a.diagnosis_type),
    formatEUR(Number(a.estimated_loss_eur)),
    labelOf(BSPS_SOLUTIONS, a.bsps_solution).split(" — ")[0],
    wrapSteps(a.actionable_steps),
  ]);

  autoTable(doc, {
    startY: y + 4,
    head: [["Date", "Shift", "Category", "Diagnosis Type", "Financial Loss", "BSPS Solution", "Actionable Steps"]],
    body: rows.length
      ? rows
      : [["—", "—", "—", "—", "—", "—", "No audit entries in scope."]],
    styles: { font: FONT_FAMILY, fontSize: 8, cellPadding: 5, textColor: [13, 27, 42] },
    headStyles: {
      font: FONT_FAMILY,
      fillColor: [245, 245, 245],
      textColor: [120, 120, 120],
      fontStyle: "bold",
      fontSize: 7,
    },
    bodyStyles: { font: FONT_FAMILY },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 65 },
      2: { cellWidth: 100 },
      3: { cellWidth: 85 },
      4: { cellWidth: 60, halign: "right" },
      5: { cellWidth: 55, halign: "right" },
      6: { cellWidth: "auto", fontStyle: "normal" },
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
  const filename = `HCT_Executive_Report_${safe}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(filename);
}
