/* Client-only executive PDF generator */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import {
  CONSULTANT_NAME,
  PROBLEM_CATEGORIES,
  BSPS_SOLUTIONS,
  SHIFTS,
  labelOf,
  formatEUR,
  formatDate,
} from "./constants";

type Audit = {
  id: string;
  audit_date: string;
  shift: string;
  bottleneck: string;
  problem_category: string;
  diagnosis_type: string;
  estimated_loss_eur: number;
  bsps_solution: string;
};

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9, color: "#0D1B2A", fontFamily: "Helvetica" },
  band: {
    borderBottomWidth: 2,
    borderBottomColor: "#C9A84C",
    paddingBottom: 12,
    marginBottom: 18,
  },
  brand: { fontSize: 9, letterSpacing: 2, color: "#666" },
  title: { fontSize: 18, marginTop: 6, fontFamily: "Helvetica-Bold" },
  metaRow: { flexDirection: "row", marginTop: 10, gap: 24 },
  metaLabel: { fontSize: 7, letterSpacing: 1.5, color: "#888", textTransform: "uppercase" },
  metaValue: { fontSize: 10, marginTop: 2, fontFamily: "Helvetica-Bold" },
  sectionTitle: {
    fontSize: 9,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#888",
    marginTop: 18,
    marginBottom: 8,
  },
  kpiRow: { flexDirection: "row", gap: 10 },
  kpi: { flex: 1, borderWidth: 0.5, borderColor: "#ddd", padding: 12 },
  kpiLabel: { fontSize: 7, letterSpacing: 1.5, color: "#888", textTransform: "uppercase" },
  kpiValue: { fontSize: 20, marginTop: 6, fontFamily: "Helvetica-Bold" },
  table: { marginTop: 6, borderTopWidth: 0.5, borderColor: "#ddd" },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: "#eee",
    paddingVertical: 6,
  },
  th: { fontSize: 7, color: "#888", textTransform: "uppercase", letterSpacing: 1 },
  cDate: { width: 60 },
  cShift: { width: 70 },
  cBottle: { flex: 1, paddingRight: 6 },
  cCat: { width: 110 },
  cLoss: { width: 60, textAlign: "right" },
  cBsps: { width: 60, textAlign: "right" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#888",
  },
});

function ExecReport({
  venueName,
  audits,
}: {
  venueName: string;
  audits: Audit[];
}) {
  const totalLoss = audits.reduce((a, b) => a + Number(b.estimated_loss_eur || 0), 0);
  const struct = audits.filter((a) => a.diagnosis_type !== "emotion").length;
  const emo = audits.filter((a) => a.diagnosis_type !== "structure").length;
  const dates = audits.map((a) => a.audit_date).sort();
  const range =
    dates.length === 0
      ? "—"
      : dates[0] === dates[dates.length - 1]
        ? formatDate(dates[0])
        : `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.brand}>HCT — HOSPITALITY DIAGNOSTIC TOOL</Text>
          <Text style={s.title}>Executive Audit Report</Text>
          <View style={s.metaRow}>
            <View>
              <Text style={s.metaLabel}>Consultant</Text>
              <Text style={s.metaValue}>{CONSULTANT_NAME}</Text>
            </View>
            <View>
              <Text style={s.metaLabel}>Venue</Text>
              <Text style={s.metaValue}>{venueName}</Text>
            </View>
            <View>
              <Text style={s.metaLabel}>Audit Period</Text>
              <Text style={s.metaValue}>{range}</Text>
            </View>
          </View>
        </View>

        <Text style={s.sectionTitle}>Executive Summary</Text>
        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Total Observations</Text>
            <Text style={s.kpiValue}>{audits.length}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Audited Financial Loss</Text>
            <Text style={s.kpiValue}>{formatEUR(totalLoss)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Structural / Emotional</Text>
            <Text style={s.kpiValue}>
              {struct} / {emo}
            </Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Audit Details</Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.cDate]}>Date</Text>
            <Text style={[s.th, s.cShift]}>Shift</Text>
            <Text style={[s.th, s.cBottle]}>Bottleneck</Text>
            <Text style={[s.th, s.cCat]}>Category</Text>
            <Text style={[s.th, s.cLoss]}>Loss</Text>
            <Text style={[s.th, s.cBsps]}>BSPS</Text>
          </View>
          {audits.map((a) => (
            <View key={a.id} style={s.tr} wrap={false}>
              <Text style={s.cDate}>{formatDate(a.audit_date)}</Text>
              <Text style={s.cShift}>{labelOf(SHIFTS, a.shift)}</Text>
              <Text style={s.cBottle}>{a.bottleneck}</Text>
              <Text style={s.cCat}>{labelOf(PROBLEM_CATEGORIES, a.problem_category)}</Text>
              <Text style={s.cLoss}>{formatEUR(Number(a.estimated_loss_eur))}</Text>
              <Text style={s.cBsps}>{labelOf(BSPS_SOLUTIONS, a.bsps_solution).split(" — ")[0]}</Text>
            </View>
          ))}
          {audits.length === 0 && (
            <View style={s.tr}>
              <Text style={{ color: "#888" }}>No audit entries in scope.</Text>
            </View>
          )}
        </View>

        <View style={s.footer} fixed>
          <Text>Confidential — prepared by {CONSULTANT_NAME}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export async function downloadExecutiveReport(venueName: string, audits: Audit[]) {
  const blob = await pdf(<ExecReport venueName={venueName} audits={audits} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = venueName.replace(/[^a-z0-9-_]+/gi, "_");
  a.href = url;
  a.download = `HCT_Executive_Report_${safe}_${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
