"use client";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

type PayrollStudent = {
  student_id?: string;
  full_name?: string;
  student_number?: string;
  barangay?: string;
  address?: string;
  phone_number?: string;
  school_address?: string;
  school_course?: string;
  year_level?: string;
  batch?: string;
  status?: string;
  renewed?: boolean;
  claimed?: boolean;
};

export type PayrollExportMetadata = {
  date_of_filing: string;
  school_year: string;
  sem_number: string;
};

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ZIP_MIME_TYPE = "application/zip";
const PAYROLL_MAX_STUDENTS = 15;
const PAYROLL_MARKER_ROW = 16;
const PAYROLL_END_MARKER = "X-X-X-X";
const PAYROLL_EXCEL_START_ROW = 10;
const PAYROLL_EXCEL_END_ROW = 24;
const PAYROLL_DEFAULT_AMOUNT = 5000;

function payrollTemplateUrl(template: "word" | "excel") {
  return new URL(`./api/payroll-templates/${template}`, window.location.href).toString();
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function chunkStudents(students: PayrollStudent[]) {
  const chunks: PayrollStudent[][] = [];
  for (let index = 0; index < students.length; index += PAYROLL_MAX_STUDENTS) {
    chunks.push(students.slice(index, index + PAYROLL_MAX_STUDENTS));
  }
  return chunks;
}

function formatLongDate(value?: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function formatSemester(value?: string) {
  const semester = Number.parseInt(value || "", 10);
  if (!Number.isFinite(semester)) return value || "";
  const suffix = semester === 1 ? "st" : semester === 2 ? "nd" : semester === 3 ? "rd" : "th";
  return `${semester}${suffix} Semester`.toUpperCase();
}

function buildPayrollWordData(students: PayrollStudent[], metadata: Record<string, string> = {}) {
  const data: Record<string, unknown> = {
    generated_at: new Date().toLocaleString(),
    date_of_filing: formatLongDate(metadata.date_of_filing),
    school_year: metadata.school_year || "",
    sem_number: formatSemester(metadata.sem_number),
    selected_count: students.length,
    students: students.map((student, index) => ({
      no: index + 1,
      student_id: student.student_id || "",
      full_name: student.full_name || "",
      student_number: student.student_number || "",
      barangay: student.barangay || "",
      address: student.address || "",
      phone_number: student.phone_number || "",
      school: student.school_address || "",
      school_address: student.school_address || "",
      course: student.school_course || "",
      school_course: student.school_course || "",
      year_level: student.year_level || "",
      batch: student.batch || "",
      status: student.status || "",
      renewed: student.renewed ? "Yes" : "No",
      claimed: student.claimed ? "Yes" : "No"
    }))
  };

  for (let row = 1; row <= PAYROLL_MARKER_ROW; row += 1) {
    data[`student_${row}_fname`] = "";
    data[`student_${row}_name`] = "";
    data[`student_${row}_year_level`] = "";
    data[`student_${row}_school`] = "";
  }

  students.forEach((student, index) => {
    const row = index + 1;
    data[`student_${row}_fname`] = student.full_name || "";
    data[`student_${row}_name`] = student.full_name || "";
    data[`student_${row}_year_level`] = student.year_level || "";
    data[`student_${row}_school`] = student.school_address || "";
  });

  const markerRow = Math.min(students.length + 1, PAYROLL_MARKER_ROW);
  data[`student_${markerRow}_fname`] = PAYROLL_END_MARKER;
  data[`student_${markerRow}_name`] = PAYROLL_END_MARKER;

  return data;
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cellPattern(address: string) {
  return new RegExp(`<c\\b(?=[^>]*\\br="${address}")[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
}

function cellAttributes(cellXml: string, address: string) {
  const openingTag = cellXml.slice(0, cellXml.indexOf(">") + 1);
  if (!openingTag) {
    throw new Error(`Unable to update Excel template cell ${address}.`);
  }
  return openingTag
    .replace(/^<c\b/, "")
    .replace(/\/?>$/, "")
    .replace(/\s+t="[^"]*"/, "");
}

function replaceCellXml(sheetXml: string, address: string, value: string | number) {
  const pattern = cellPattern(address);
  const current = sheetXml.match(pattern)?.[0];
  if (!current) {
    throw new Error(`Payroll Excel template is missing expected cell ${address}.`);
  }
  const attrs = cellAttributes(current, address);
  if (value === "") {
    return sheetXml.replace(pattern, `<c${attrs}/>`);
  }
  if (typeof value === "number") {
    return sheetXml.replace(pattern, `<c${attrs}><v>${value}</v></c>`);
  }
  return sheetXml.replace(
    pattern,
    `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
  );
}

function fillPayrollExcelSheetXml(sheetXml: string, students: PayrollStudent[], sheetNumber: number, totalSheets: number) {
  let xml = replaceCellXml(sheetXml, "O3", `Sheet ${sheetNumber} of ${totalSheets} Sheets`);

  for (let row = PAYROLL_EXCEL_START_ROW; row <= PAYROLL_EXCEL_END_ROW + 1; row += 1) {
    xml = replaceCellXml(xml, `B${row}`, "");
    if (row <= PAYROLL_EXCEL_END_ROW) {
      xml = replaceCellXml(xml, `E${row}`, "");
      xml = replaceCellXml(xml, `J${row}`, "");
    }
  }

  students.forEach((student, index) => {
    const row = PAYROLL_EXCEL_START_ROW + index;
    xml = replaceCellXml(xml, `B${row}`, student.full_name || "");
    xml = replaceCellXml(xml, `E${row}`, PAYROLL_DEFAULT_AMOUNT);
    xml = replaceCellXml(xml, `J${row}`, PAYROLL_DEFAULT_AMOUNT);
  });

  const markerRow = PAYROLL_EXCEL_START_ROW + students.length;
  xml = replaceCellXml(xml, `B${markerRow}`, PAYROLL_END_MARKER);
  xml = replaceCellXml(xml, "J25", students.length * PAYROLL_DEFAULT_AMOUNT);
  return xml;
}

async function buildPayrollWordBlob(students: PayrollStudent[], metadata: PayrollExportMetadata) {
  const response = await fetch(payrollTemplateUrl("word"), {
    credentials: "same-origin",
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Unable to load Word template: ${response.status} ${response.statusText}`);
  }

  const zip = new PizZip(await response.arrayBuffer());
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true
  });

  doc.render(buildPayrollWordData(students, metadata));

  return doc.getZip().generate({
    type: "blob",
    mimeType: DOCX_MIME_TYPE
  });
}

async function buildPayrollExcelBlob(students: PayrollStudent[], sheetNumber: number, totalSheets: number) {
  const response = await fetch(payrollTemplateUrl("excel"), {
    credentials: "same-origin",
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Unable to load Excel template: ${response.status} ${response.statusText}`);
  }

  const zip = new PizZip(await response.arrayBuffer());
  const sheetPath = "xl/worksheets/sheet1.xml";
  const sheet = zip.file(sheetPath);
  if (!sheet) {
    throw new Error("Payroll Excel template is missing the first worksheet.");
  }

  zip.file(sheetPath, fillPayrollExcelSheetXml(sheet.asText(), students, sheetNumber, totalSheets));
  return zip.generate({
    type: "blob",
    mimeType: XLSX_MIME_TYPE,
    compression: "DEFLATE"
  });
}

export async function exportPayrollFiles(
  students: PayrollStudent[],
  metadata: PayrollExportMetadata,
  filenamePrefix = "payroll"
) {
  if (!students.length) {
    throw new Error("Select at least one student before exporting payroll files.");
  }

  const groups = chunkStudents(students);
  const archive = new PizZip();

  for (const [index, group] of groups.entries()) {
    const part = String(index + 1).padStart(2, "0");
    const [wordBlob, excelBlob] = await Promise.all([
      buildPayrollWordBlob(group, metadata),
      buildPayrollExcelBlob(group, index + 1, groups.length)
    ]);

    archive.file(`${filenamePrefix}/group-${part}/${filenamePrefix}-group-${part}.docx`, await wordBlob.arrayBuffer());
    archive.file(`${filenamePrefix}/group-${part}/${filenamePrefix}-group-${part}.xlsx`, await excelBlob.arrayBuffer());
  }

  const zipBlob = archive.generate({
    type: "blob",
    mimeType: ZIP_MIME_TYPE,
    compression: "DEFLATE"
  });
  downloadBlob(`${filenamePrefix}-${groups.length}-groups.zip`, zipBlob);

  return groups.length;
}
