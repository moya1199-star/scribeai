/**
 * EnhancedSummaryPanel.tsx
 * Drop-in replacement / upgrade para el tab de resumen en ScribeWorkspace.
 *
 * Características:
 *  - Resumen ejecutivo extenso con secciones expandibles
 *  - Puntos clave, decisiones, acuerdos y próximos pasos formateados
 *  - Exportación a PDF (jsPDF + autoTable) — sin backend
 *  - Diseño coherente con la paleta oscura slate de ScribeAI
 *
 * Instalación: npm install jspdf jspdf-autotable
 * Luego reemplaza o añade como tab dentro de ScribeWorkspace.tsx
 */

import React, { useState, useCallback } from "react";
import {
  FileText,
  Download,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Lightbulb,
  Users,
  Target,
  AlertTriangle,
  Clock,
  Loader2,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";

// ────────────────────────────────────────────────────────────
// TIPOS (ajusta el import según tu estructura real de tipos)
// ────────────────────────────────────────────────────────────
interface ActionItem {
  id: string;
  text: string;
  assignee?: string;
  completed: boolean;
}

interface Decision {
  id: string;
  title: string;
  rationale?: string;
  approvedBy?: string[];
}

interface TranscriptionDetail {
  language?: string;
  summary?: string;
  keyPoints?: string[];
  speakers?: string[];
  actionItems?: ActionItem[];
  decisions?: Decision[];
  metrics?: {
    totalWords?: number;
    averageSpeed?: number;
    silenceRatio?: number;
    speakerInterruptionCount?: number;
  };
  segments?: Array<{
    id: string;
    speaker: string;
    text: string;
    startTime: number;
    endTime: number;
    sentiment?: string;
  }>;
  chapters?: Array<{
    id: string;
    title: string;
    startTime: number;
    endTime: number;
    summary: string;
  }>;
}

interface VoiceNote {
  id: string;
  title: string;
  createdAt: string;
  duration?: number;
  transcription?: TranscriptionDetail;
}

interface EnhancedSummaryPanelProps {
  note: VoiceNote;
  /** Backend URL para regenerar resumen con Claude (opcional). Si no se pasa, usa datos existentes. */
  apiUrl?: string;
}

// ────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────
const formatTime = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const sentimentColor: Record<string, string> = {
  positive: "text-emerald-400",
  negative: "text-rose-400",
  critical: "text-amber-400",
  neutral: "text-slate-400",
};

// ────────────────────────────────────────────────────────────
// SUBCOMPONENTES
// ────────────────────────────────────────────────────────────
function SectionBlock({
  icon,
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-900/60 border border-slate-800/70 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/40 transition cursor-pointer"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <span className="text-indigo-400">{icon}</span>
          {title}
          {badge !== undefined && (
            <span className="text-[10px] bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 font-bold px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        )}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-slate-800/50">{children}</div>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handle}
      title="Copiar al portapapeles"
      className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-500 hover:text-slate-200 transition cursor-pointer"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// GENERADOR DE RESUMEN EXTENDIDO VÍA CLAUDE API
// ────────────────────────────────────────────────────────────
async function generateExtendedSummary(
  note: VoiceNote,
  apiUrl: string
): Promise<string> {
  const t = note.transcription;
  if (!t) return "";

  const fullText = t.segments?.map((s) => `${s.speaker}: ${s.text}`).join("\n") || t.summary || "";

  const prompt = `Eres un asistente de análisis de reuniones. Genera un resumen ejecutivo EXTENSO y detallado en español de la siguiente reunión.

TÍTULO: ${note.title}
FECHA: ${note.createdAt}
DURACIÓN: ${note.duration ? Math.floor(note.duration / 60) + " min " + (note.duration % 60) + " seg" : "no especificada"}
PARTICIPANTES: ${t.speakers?.join(", ") || "No identificados"}
IDIOMA DETECTADO: ${t.language || "Español"}

TRANSCRIPCIÓN COMPLETA:
${fullText}

PUNTOS CLAVE PREVIOS:
${t.keyPoints?.map((p, i) => `${i + 1}. ${p}`).join("\n") || "Ninguno"}

TAREAS ACORDADAS:
${t.actionItems?.map((a) => `- [${a.completed ? "x" : " "}] ${a.text}${a.assignee ? ` (${a.assignee})` : ""}`).join("\n") || "Ninguna"}

DECISIONES:
${t.decisions?.map((d) => `- ${d.title}: ${d.rationale || ""}`).join("\n") || "Ninguna"}

Genera el resumen con el siguiente formato exacto — no uses markdown, usa texto plano estructurado:

RESUMEN EJECUTIVO
[Párrafo largo (mínimo 4-5 oraciones) que capture el propósito de la reunión, los temas centrales discutidos, el tono general y los resultados más importantes]

CONTEXTO Y ANTECEDENTES
[Párrafo que describa el contexto de la reunión: ¿por qué se realizó? ¿qué problema o situación la motivó?]

TEMAS TRATADOS
[Lista numerada de los temas principales abordados, con una descripción breve de cada uno]

ACUERDOS Y RESOLUCIONES
[Lista de los compromisos, acuerdos formales o resoluciones adoptadas en la reunión]

PRÓXIMOS PASOS
[Lista ordenada de acciones concretas con responsables y plazos si fueron mencionados]

OBSERVACIONES ADICIONALES
[Párrafo con cualquier nota importante, riesgo identificado, o contexto relevante para quienes no asistieron a la reunión]`;

  const response = await fetch(`${apiUrl}/api/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, noteId: note.id }),
  });

  if (!response.ok) throw new Error("Error al generar resumen extendido");
  const data = await response.json();
  return data.summary || data.text || "";
}

// ────────────────────────────────────────────────────────────
// PDF GENERATOR
// ────────────────────────────────────────────────────────────
async function downloadAsPDF(note: VoiceNote, extendedSummary: string) {
  // Importación dinámica para no penalizar el bundle inicial
  const { default: jsPDF } = await import("jspdf");
  // @ts-ignore — jspdf-autotable se registra como plugin en el prototipo
  await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const t = note.transcription;

  const PAGE_W = 210;
  const MARGIN = 18;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  // ── Helpers de renderizado ──────────────────────────────
  const nl = (extra = 6) => {
    y += extra;
  };

  const checkPage = (needed = 10) => {
    if (y + needed > 280) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const drawH1 = (text: string) => {
    checkPage(12);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(text, MARGIN, y);
    y += 10;
  };

  const drawH2 = (text: string) => {
    checkPage(10);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81);
    doc.text(text, MARGIN, y);
    y += 7;
    // underline
    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y - 2, MARGIN + CONTENT_W, y - 2);
    y += 2;
  };

  const drawBody = (text: string, indent = 0) => {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    const lines = doc.splitTextToSize(text, CONTENT_W - indent);
    lines.forEach((line: string) => {
      checkPage(6);
      doc.text(line, MARGIN + indent, y);
      y += 5.5;
    });
  };

  const drawBullet = (text: string, bullet = "•", indent = 4) => {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    const lines = doc.splitTextToSize(text, CONTENT_W - indent - 5);
    checkPage(6);
    doc.text(bullet, MARGIN + indent, y);
    lines.forEach((line: string, i: number) => {
      checkPage(6);
      doc.text(line, MARGIN + indent + 5, y);
      y += 5.5;
    });
    if (lines.length === 0) y += 5.5;
  };

  const drawChip = (label: string, value: string) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(99, 102, 241);
    doc.text(`${label}:`, MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(value, MARGIN + doc.getTextWidth(`${label}: `), y);
    y += 5.5;
  };

  // ── CABECERA ────────────────────────────────────────────
  // Franja azul superior
  doc.setFillColor(67, 56, 202); // indigo-700
  doc.rect(0, 0, PAGE_W, 28, "F");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(199, 210, 254); // indigo-200
  doc.text("SCRIBEAI — INFORME DE REUNIÓN", MARGIN, 10);

  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(note.title, MARGIN, 20);

  // Logo tag
  doc.setFontSize(7);
  doc.setTextColor(165, 180, 252);
  doc.text("Generado automáticamente con IA", PAGE_W - MARGIN, 10, { align: "right" });

  y = 36;

  // ── METADATA ───────────────────────────────────────────
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(MARGIN, y, CONTENT_W, 22, 2, 2, "F");
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, CONTENT_W, 22, 2, 2, "S");

  y += 7;
  const metaCols = [
    ["Fecha", note.createdAt],
    ["Duración", note.duration ? formatTime(note.duration) : "—"],
    ["Idioma", t?.language || "Español"],
    ["Palabras", String(t?.metrics?.totalWords || "—")],
  ];
  const colW = CONTENT_W / metaCols.length;
  metaCols.forEach(([label, val], i) => {
    const x = MARGIN + i * colW + 4;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(148, 163, 184);
    doc.text(label.toUpperCase(), x, y);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(val, x, y + 5);
  });
  y += 20;
  nl(4);

  // ── PARTICIPANTES ──────────────────────────────────────
  if (t?.speakers?.length) {
    drawH2("Participantes");
    nl(2);
    t.speakers.forEach((s) => drawBullet(s, "-"));
    nl();
  }

  // ── RESUMEN EJECUTIVO ──────────────────────────────────
  drawH2("Resumen Ejecutivo");
  nl(2);

  if (extendedSummary) {
    // Parsear secciones del texto generado por Claude
    const sections = extendedSummary.split(/\n(?=[A-ZÁÉÍÓÚÑ\s]{4,}\n)/);
    sections.forEach((section) => {
      const lines = section.trim().split("\n");
      if (!lines.length) return;
      const heading = lines[0].trim();
      const body = lines.slice(1).join("\n").trim();

      if (heading && body) {
        checkPage(14);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(55, 65, 81);
        doc.text(heading, MARGIN, y);
        y += 6;
        drawBody(body, 0);
        nl(3);
      } else {
        drawBody(section, 0);
        nl(2);
      }
    });
  } else {
    // Fallback al summary corto existente
    drawBody(t?.summary || "Sin resumen disponible.");
    nl();

    if (t?.keyPoints?.length) {
      nl(2);
      checkPage(10);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(55, 65, 81);
      doc.text("Puntos Clave", MARGIN, y);
      y += 6;
      t.keyPoints.forEach((p) => {
        drawBullet(p);
        nl(1);
      });
    }
  }

  // ── TAREAS Y COMPROMISOS ───────────────────────────────
  if (t?.actionItems?.length) {
    nl(2);
    drawH2("Tareas y Compromisos");
    nl(2);

    // @ts-ignore
    doc.autoTable({
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["#", "Tarea", "Responsable", "Estado"]],
      body: t.actionItems.map((a, i) => [
        String(i + 1),
        a.text,
        a.assignee || "—",
        a.completed ? "✓ Completado" : "Pendiente",
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [67, 56, 202], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 90 },
        2: { cellWidth: 40 },
        3: { cellWidth: 30 },
      },
      didDrawPage: (data: any) => {
        y = data.cursor.y + 6;
      },
    });
    // @ts-ignore
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── DECISIONES ─────────────────────────────────────────
  if (t?.decisions?.length) {
    checkPage(20);
    drawH2("Decisiones Adoptadas");
    nl(2);
    t.decisions.forEach((d, i) => {
      checkPage(14);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(67, 56, 202);
      doc.text(`${i + 1}. ${d.title}`, MARGIN, y);
      y += 5.5;
      if (d.rationale) drawBody(d.rationale, 4);
      if (d.approvedBy?.length) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(148, 163, 184);
        doc.text(`Aprobado por: ${d.approvedBy.join(", ")}`, MARGIN + 4, y);
        y += 5;
      }
      nl(2);
    });
  }

  // ── CAPÍTULOS / AGENDA ─────────────────────────────────
  if (t?.chapters?.length) {
    checkPage(20);
    drawH2("Estructura de la Reunión");
    nl(2);
    t.chapters.forEach((c) => {
      checkPage(12);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(55, 65, 81);
      doc.text(`${c.title}  [${formatTime(c.startTime)} – ${formatTime(c.endTime)}]`, MARGIN, y);
      y += 5.5;
      drawBody(c.summary, 4);
      nl(2);
    });
  }

  // ── MÉTRICAS ───────────────────────────────────────────
  if (t?.metrics) {
    checkPage(30);
    drawH2("Métricas de la Sesión");
    nl(2);
    const m = t.metrics;
    const metricsData = [
      ["Total de palabras", String(m.totalWords ?? "—")],
      ["Velocidad promedio", m.averageSpeed ? `${m.averageSpeed} pal/min` : "—"],
      ["Ratio de silencio", m.silenceRatio !== undefined ? `${(m.silenceRatio * 100).toFixed(0)}%` : "—"],
      ["Interrupciones", String(m.speakerInterruptionCount ?? 0)],
    ];
    metricsData.forEach(([k, v]) => {
      drawChip(k, v);
    });
    nl();
  }

  // ── TRANSCRIPCIÓN COMPLETA ─────────────────────────────
  if (t?.segments?.length) {
    doc.addPage();
    y = MARGIN;
    drawH2("Transcripción Completa");
    nl(2);
    t.segments.forEach((seg) => {
      checkPage(18);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(99, 102, 241);
      doc.text(`${seg.speaker}  ${formatTime(seg.startTime)}–${formatTime(seg.endTime)}`, MARGIN, y);
      y += 5;
      drawBody(seg.text, 4);
      nl(3);
    });
  }

  // ── PIE DE PÁGINA ──────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(
      `ScribeAI — ${note.title} — Pág. ${i}/${pageCount}`,
      PAGE_W / 2,
      292,
      { align: "center" }
    );
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, 288, PAGE_W - MARGIN, 288);
  }

  const safeName = note.title.replace(/[^a-zA-Z0-9_\-áéíóúñÁÉÍÓÚÑ ]/g, "").slice(0, 60);
  doc.save(`ScribeAI_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ────────────────────────────────────────────────────────────
export default function EnhancedSummaryPanel({ note, apiUrl }: EnhancedSummaryPanelProps) {
  const t = note.transcription;
  const [extendedSummary, setExtendedSummary] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const handleGenerateExtended = useCallback(async () => {
    if (!apiUrl) {
      setGenError("No se proporcionó URL del backend.");
      return;
    }
    setIsGenerating(true);
    setGenError(null);
    try {
      const result = await generateExtendedSummary(note, apiUrl);
      setExtendedSummary(result);
    } catch (err: any) {
      setGenError(err.message || "Error al generar resumen.");
    } finally {
      setIsGenerating(false);
    }
  }, [note, apiUrl]);

  const handleDownloadPDF = useCallback(async () => {
    setIsDownloading(true);
    try {
      await downloadAsPDF(note, extendedSummary);
    } catch (err: any) {
      console.error("Error generando PDF:", err);
    } finally {
      setIsDownloading(false);
    }
  }, [note, extendedSummary]);

  // Texto completo para copiar
  const fullTextForCopy = [
    `REUNIÓN: ${note.title}`,
    `FECHA: ${note.createdAt}`,
    "",
    "RESUMEN:",
    extendedSummary || t?.summary || "",
    "",
    t?.keyPoints?.length ? "PUNTOS CLAVE:\n" + t.keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n") : "",
    t?.actionItems?.length
      ? "TAREAS:\n" + t.actionItems.map((a) => `- [${a.completed ? "x" : " "}] ${a.text}${a.assignee ? ` (${a.assignee})` : ""}`).join("\n")
      : "",
    t?.decisions?.length ? "DECISIONES:\n" + t.decisions.map((d) => `- ${d.title}`).join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="flex flex-col gap-4">
      {/* ── BARRA DE ACCIONES ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-slate-200">Resumen Completo</span>
          {t?.language && (
            <span className="text-[10px] bg-slate-800 border border-slate-700/50 text-slate-400 px-2 py-0.5 rounded-full font-medium">
              {t.language}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={fullTextForCopy} />
          {apiUrl && !extendedSummary && (
            <button
              onClick={handleGenerateExtended}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/35 rounded-lg transition disabled:opacity-50 cursor-pointer"
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {isGenerating ? "Generando..." : "Ampliar resumen"}
            </button>
          )}
          <button
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/35 rounded-lg transition disabled:opacity-50 cursor-pointer"
          >
            {isDownloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {isDownloading ? "Generando PDF..." : "Descargar PDF"}
          </button>
        </div>
      </div>

      {genError && (
        <div className="text-xs text-rose-400 bg-rose-950/20 border border-rose-800/40 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {genError}
        </div>
      )}

      {/* ── RESUMEN EJECUTIVO ── */}
      <SectionBlock icon={<Lightbulb className="w-4 h-4" />} title="Resumen Ejecutivo" defaultOpen>
        {extendedSummary ? (
          <div className="space-y-4 mt-2">
            {extendedSummary.split(/\n\n+/).map((block, i) => {
              const lines = block.trim().split("\n");
              const heading = lines[0].trim();
              const isHeading = /^[A-ZÁÉÍÓÚÑ\s]{4,}$/.test(heading);
              if (isHeading && lines.length > 1) {
                return (
                  <div key={i}>
                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5">
                      {heading}
                    </p>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {lines.slice(1).join(" ")}
                    </p>
                  </div>
                );
              }
              return (
                <p key={i} className="text-sm text-slate-300 leading-relaxed">
                  {block.trim()}
                </p>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-slate-300 leading-relaxed">
              {t?.summary || "Sin resumen disponible."}
            </p>
            {apiUrl && (
              <button
                onClick={handleGenerateExtended}
                disabled={isGenerating}
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {isGenerating ? "Generando resumen ampliado..." : "Generar resumen más extenso con IA →"}
              </button>
            )}
          </div>
        )}
      </SectionBlock>

      {/* ── PUNTOS CLAVE ── */}
      {t?.keyPoints?.length ? (
        <SectionBlock
          icon={<Target className="w-4 h-4" />}
          title="Puntos Clave"
          badge={t.keyPoints.length}
        >
          <ol className="mt-2 space-y-2">
            {t.keyPoints.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950/50 border border-indigo-800/40 rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-slate-300 leading-relaxed">{p}</p>
              </li>
            ))}
          </ol>
        </SectionBlock>
      ) : null}

      {/* ── TAREAS Y COMPROMISOS ── */}
      {t?.actionItems?.length ? (
        <SectionBlock
          icon={<CheckCircle2 className="w-4 h-4" />}
          title="Tareas y Compromisos"
          badge={t.actionItems.filter((a) => !a.completed).length + " pendientes"}
        >
          <div className="mt-2 space-y-2">
            {t.actionItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-3 p-2.5 rounded-lg border ${
                  item.completed
                    ? "bg-emerald-950/10 border-emerald-800/20 opacity-60"
                    : "bg-slate-800/30 border-slate-700/40"
                }`}
              >
                {item.completed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${item.completed ? "line-through text-slate-500" : "text-slate-200"}`}>
                    {item.text}
                  </p>
                  {item.assignee && (
                    <p className="text-[11px] text-indigo-400 mt-0.5 font-medium">{item.assignee}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>
      ) : null}

      {/* ── DECISIONES ── */}
      {t?.decisions?.length ? (
        <SectionBlock
          icon={<AlertTriangle className="w-4 h-4" />}
          title="Decisiones Adoptadas"
          badge={t.decisions.length}
          defaultOpen={false}
        >
          <div className="mt-2 space-y-3">
            {t.decisions.map((d) => (
              <div key={d.id} className="bg-indigo-950/20 border border-indigo-800/30 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-200">{d.title}</p>
                {d.rationale && (
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{d.rationale}</p>
                )}
                {d.approvedBy?.length ? (
                  <p className="text-[10px] text-indigo-400 mt-1.5 font-medium">
                    Aprobado por: {d.approvedBy.join(", ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </SectionBlock>
      ) : null}

      {/* ── ESTRUCTURA / CAPÍTULOS ── */}
      {t?.chapters?.length ? (
        <SectionBlock
          icon={<Clock className="w-4 h-4" />}
          title="Estructura de la Reunión"
          badge={t.chapters.length + " bloques"}
          defaultOpen={false}
        >
          <div className="mt-2 space-y-3">
            {t.chapters.map((c) => (
              <div key={c.id} className="flex gap-3">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                    {formatTime(c.startTime)}
                  </span>
                  <div className="w-px flex-1 bg-slate-700/50" />
                  <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                    {formatTime(c.endTime)}
                  </span>
                </div>
                <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-3 flex-1">
                  <p className="text-sm font-semibold text-slate-200">{c.title}</p>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{c.summary}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>
      ) : null}

      {/* ── PARTICIPANTES ── */}
      {t?.speakers?.length ? (
        <SectionBlock
          icon={<Users className="w-4 h-4" />}
          title="Participantes"
          badge={t.speakers.length}
          defaultOpen={false}
        >
          <div className="mt-2 flex flex-wrap gap-2">
            {t.speakers.map((s, i) => (
              <span
                key={i}
                className="text-xs bg-slate-800 border border-slate-700/60 text-slate-300 px-2.5 py-1 rounded-full font-medium"
              >
                {s}
              </span>
            ))}
          </div>
        </SectionBlock>
      ) : null}

      {/* ── MÉTRICAS ── */}
      {t?.metrics && (
        <SectionBlock
          icon={<FileText className="w-4 h-4" />}
          title="Métricas"
          defaultOpen={false}
        >
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Palabras", value: t.metrics.totalWords ?? "—" },
              {
                label: "Vel. promedio",
                value: t.metrics.averageSpeed ? `${t.metrics.averageSpeed} pal/min` : "—",
              },
              {
                label: "Silencio",
                value:
                  t.metrics.silenceRatio !== undefined
                    ? `${(t.metrics.silenceRatio * 100).toFixed(0)}%`
                    : "—",
              },
              { label: "Interrupciones", value: t.metrics.speakerInterruptionCount ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-3 text-center">
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{label}</p>
                <p className="text-lg font-bold text-slate-200 mt-1">{value}</p>
              </div>
            ))}
          </div>
        </SectionBlock>
      )}
    </div>
  );
}
