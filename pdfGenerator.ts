import { jsPDF } from "jspdf";
import { VoiceNote } from "../types";

/**
 * Generates a clean, corporate-ready, highly polished PDF executive report of the ScribeAI note.
 * Bypasses iframe constraints, formats bilingually, and wraps lines gracefully with page-overflow handling.
 */
export function generateExecutivePdf(note: VoiceNote): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2; // 170 mm

  let y = 25; // Continuous vertical cursor

  // Helper: Force check and inject page breaks safely
  const checkSpace = (requiredHeight: number) => {
    if (y + requiredHeight > 268) {
      doc.addPage();
      y = 25; // Reset cursor with generous margin
    }
  };

  // Helper: Write stylized section headers
  const writeSectionHeader = (title: string) => {
    checkSpace(20);
    y += 4;
    
    // Indigo accent badge rect
    doc.setFillColor(79, 70, 229); // Indigo-600
    doc.rect(margin, y - 4.5, 2.5, 6, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(title, margin + 5, y - 0.2);
    y += 2;

    // Thin elegant separator line below title
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  };

  // Helper: Write multi-line text dynamically wrapping with custom line height
  const writeBlockText = (
    text: string,
    fontSize: number = 9.5,
    style: "normal" | "bold" | "italic" = "normal",
    color: [number, number, number] = [51, 65, 85], // slate-700
    lineLeading: number = 4.8
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);

    const lines: string[] = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      checkSpace(lineLeading);
      doc.text(line, margin, y);
      y += lineLeading;
    }
  };

  // ==========================================
  // PAGE 1 HEADER: MODERN HEADER BLOCK
  // ==========================================
  
  // Left Indigo thick decorative stripe
  doc.setFillColor(79, 70, 229);
  doc.rect(margin, y, 4, 18, "F");

  // Title & subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text("ScribeAI Briefing", margin + 6.5, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  
  // Clean, literal description
  doc.text("Resumen Ejecutivo y Minuta de Negocio", margin + 6.5, y + 10.5);
  y += 18;

  // Horizontal primary bar
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(1.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  // Title of the specific Note
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // slate-900
  
  // Split title if excessively long
  const rawTitle = note.title || "Grabación de Sesión ScribeAI";
  const titleLines: string[] = doc.splitTextToSize(rawTitle, contentWidth);
  for (const tLine of titleLines) {
    checkSpace(6);
    doc.text(tLine, margin, y);
    y += 5.5;
  }
  y += 1;

  // Metadata Card / Grid (Drawn inside a neat border)
  checkSpace(24);
  doc.setFillColor(248, 250, 252); // slate-50 (neutral soft white)
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.25);
  doc.rect(margin, y, contentWidth, 18, "FD");

  // Print Metadata Fields in 3 neat columns
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // Slate-500

  // Col 1: Fecha
  doc.text("FECHA DE AUDIO", margin + 5, y + 5.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(note.createdAt || new Date().toLocaleDateString(), margin + 5, y + 11.5);

  // Col 2: Idioma
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("IDIOMA RECONOCIDO", margin + 60, y + 5.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(note.transcription.language || "Bilingüe (Autodetectado)", margin + 60, y + 11.5);

  // Col 3: Duración y Oradores
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("DURACIÓN / ORADORES", margin + 115, y + 5.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);

  const mins = Math.floor(note.duration / 60);
  const secs = note.duration % 60;
  const durStr = `${mins}m ${secs}s`;
  const spkCount = note.transcription.speakers?.length || 2;
  doc.text(`${durStr} (${spkCount} participantes)`, margin + 115, y + 11.5);

  y += 24;

  // ==========================================
  // SECTION 1: RESUMEN INTELIGENTE
  // ==========================================
  writeSectionHeader("1. Resumen Ejecutivo (IA)");
  
  if (note.transcription.summary) {
    writeBlockText(note.transcription.summary, 9.5, "normal", [51, 65, 85], 4.8);
  } else {
    writeBlockText("No se dispone de un resumen de texto consolidado para esta nota.", 9.5, "italic", [148, 163, 184], 4.8);
  }
  y += 5;

  // ==========================================
  // SECTION 2: PUNTOS CLAVE Y HALLAZGOS
  // ==========================================
  writeSectionHeader("2. Puntos Clave & Hallazgos");

  const keyPoints = note.transcription.keyPoints || [];
  if (keyPoints.length > 0) {
    for (const point of keyPoints) {
      checkSpace(8);
      // Small bullet point dot
      doc.setFillColor(99, 102, 241); // Indigo bullet
      doc.circle(margin + 2.5, y - 1.2, 0.8, "F");

      // Write point text nicely indented
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85);
      
      const lines: string[] = doc.splitTextToSize(point, contentWidth - 8);
      for (let i = 0; i < lines.length; i++) {
        checkSpace(4.8);
        doc.text(lines[i], margin + 7, y);
        y += 4.8;
      }
      y += 1.5; // space behind list items
    }
  } else {
    writeBlockText("Ningún punto clave fue extraído explícitamente en el canal actual.", 9.5, "italic", [148, 163, 184], 4.8);
  }
  y += 5;

  // ==========================================
  // SECTION 3: DECISIONES ESTRATÉGICAS
  // ==========================================
  const decisions = note.transcription.decisions || [];
  if (decisions.length > 0) {
    writeSectionHeader("3. Decisiones Críticas");
    
    for (const dec of decisions) {
      // Estimate box size to handle page breaks cleanly
      const titleLines: string[] = doc.splitTextToSize(dec.title, contentWidth - 14);
      const ratLines: string[] = doc.splitTextToSize(dec.rationale, contentWidth - 14);
      const appBy = dec.approvedBy && dec.approvedBy.length > 0 ? `Aprobado por: ${dec.approvedBy.join(", ")}` : "";
      const appLines = appBy ? doc.splitTextToSize(appBy, contentWidth - 14) : [];
      
      const linesCount = titleLines.length + ratLines.length + appLines.length;
      const boxHeight = (linesCount * 4.5) + 8; // Padding

      checkSpace(boxHeight + 5);

      // Draw elegant decision card
      doc.setFillColor(255, 251, 235); // Yellow/Amber-50
      doc.setDrawColor(253, 230, 138); // Yellow/Amber-200
      doc.setLineWidth(0.25);
      doc.rect(margin, y, contentWidth, boxHeight, "FD");

      // Solid Amber-500 thick left margin bar
      doc.setFillColor(217, 119, 6); // Amber-600
      doc.rect(margin, y, 2.5, boxHeight, "F");

      let boxY = y + 5;

      // Decision Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(146, 64, 14); // Amber-800
      for (const line of titleLines) {
        doc.text(line, margin + 6, boxY);
        boxY += 4.5;
      }

      // Rationale
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(120, 113, 108); // slate-600/stone-500
      for (const line of ratLines) {
        doc.text(line, margin + 6, boxY);
        boxY += 4.2;
      }

      // Approved list (small font)
      if (appBy) {
        boxY += 1;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(92, 107, 115);
        for (const line of appLines) {
          doc.text(line, margin + 6, boxY);
          boxY += 4;
        }
      }

      y += boxHeight + 4;
    }
    y += 1;
  }

  // ==========================================
  // SECTION 4: TAREAS Y PLAN COMPROMISO
  // ==========================================
  const actionItems = note.transcription.actionItems || [];
  if (actionItems.length > 0) {
    writeSectionHeader("4. Tareas & Planes de Acción");

    for (const item of actionItems) {
      const assigneeStr = item.assignee ? ` [Encargado: ${item.assignee}]` : "";
      const fullText = `${item.completed ? " [COMPLETADA]" : " [PENDIENTE]"} ${item.text}${assigneeStr}`;
      
      const itemLines: string[] = doc.splitTextToSize(fullText, contentWidth - 10);
      const boxHeight = (itemLines.length * 4.4) + 4;

      checkSpace(boxHeight + 2);

      // Simple box row
      doc.setFillColor(item.completed ? 240 : 255, item.completed ? 253 : 255, item.completed ? 250 : 255); // emerald soft or white
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(margin, y, contentWidth, boxHeight, "FD");

      // Draw small colorful checkbox status Indicator on left side
      if (item.completed) {
        doc.setFillColor(16, 185, 129); // emerald green
        doc.rect(margin + 2.5, y + (boxHeight / 2) - 1.5, 3, 3, "F");
      } else {
        doc.setDrawColor(99, 102, 241); // indigo pending border
        doc.setLineWidth(0.5);
        doc.rect(margin + 2.5, y + (boxHeight / 2) - 1.5, 3, 3);
      }

      let rowY = y + 4.2;
      doc.setFont("helvetica", item.completed ? "normal" : "normal");
      doc.setFontSize(9);
      doc.setTextColor(item.completed ? 100 : 30, item.completed ? 116 : 41, item.completed ? 139 : 59); // slate-400 or slate-800

      for (let i = 0; i < itemLines.length; i++) {
        let textLine = itemLines[i];
        
        // Enhance assignee visuals in normal text
        doc.text(textLine, margin + 8, rowY);
        rowY += 4.4;
      }

      y += boxHeight + 2;
    }
  }

  // ==========================================
  // SECTION 5: SEGMENTOS DESTACADOS / DIÁLOGOS
  // ==========================================
  const segments = note.transcription.segments || [];
  if (segments.length > 0) {
    writeSectionHeader("5. Transmisión Clave (Extractos)");

    // Take max 5 key dialogues to keep a clean executive format
    const keySegments = segments.slice(0, 7);
    for (const seg of keySegments) {
      const prefix = `[${seg.speaker}]: `;
      const fullText = `${prefix}${seg.text}`;
      
      const wrapLines: string[] = doc.splitTextToSize(fullText, contentWidth - 4);
      const estimatedHeight = (wrapLines.length * 4.5) + 3;

      checkSpace(estimatedHeight + 2);

      // Dialogue background
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(241, 245, 249); // slate-100
      doc.setLineWidth(0.15);
      doc.rect(margin, y, contentWidth, estimatedHeight, "FD");

      let segY = y + 4;
      
      for (const line of wrapLines) {
        if (line.startsWith(prefix)) {
          // Bold speaker prefix
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8.5);
          doc.setTextColor(79, 70, 229); // indigo header
          doc.text(prefix, margin + 2, segY);
          
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(51, 65, 85);
          
          const textRest = line.slice(prefix.length);
          // Measure length of prefix to start body
          const prefixWidth = doc.getTextWidth(prefix);
          doc.text(textRest, margin + 2 + prefixWidth, segY);
        } else {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(51, 65, 85);
          doc.text(line, margin + 2, segY);
        }
        
        segY += 4.5;
      }

      y += estimatedHeight + 2.5;
    }

    if (segments.length > 7) {
      checkSpace(8);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`* Se omitieron ${segments.length - 7} segmentos adicionales de la transmisión completa en este informe ejecutivo.`, margin, y);
      y += 5;
    }
  }

  // ==========================================
  // RETROACTIVE PAGES NUMERATION AND HEADERS/FOOTERS
  // ==========================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Header strip decoration
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.2);
    doc.line(margin, 13, pageWidth - margin, 13);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text("ScribeAI Briefing Suite", margin, 10);
    
    doc.setFont("helvetica", "normal");
    doc.text("Real-Time Automated Synthesis Report", pageWidth - margin, 10, { align: "right" });

    // Footer decoration
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
    
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("Generado automáticamente por ScribeAI • Real-Time Diarization Engine", margin, pageHeight - 9.5);
    
    doc.setFont("helvetica", "normal");
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 9.5, { align: "right" });
  }

  // Save/Download output file beautifully
  const sanitizedTitle = (note.title || "resumen")
    .toLowerCase()
    .replace(/[^a-z0-5\-_]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 30);
  
  doc.save(`scribeai-resumen-ejecutivo-${sanitizedTitle}.pdf`);
}
