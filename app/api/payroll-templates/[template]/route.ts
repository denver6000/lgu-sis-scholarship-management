import path from "node:path";
import { constants as fsConstants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { requireSessionUserForApi } from "../../../lib/server/auth";
import { HttpError, jsonError } from "../../../lib/shared/http";

const TEMPLATE_DEFINITIONS = {
  word: {
    filename: "PAYROLL_WORD_TEMPLATE.docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  },
  excel: {
    filename: "PAYROLL_TEMPLATE.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }
} as const;

async function resolveTemplatePath(filename: string) {
  const candidates = [
    path.join(process.cwd(), "public", "templates", filename),
    path.join(process.cwd(), ".next", "standalone", "public", "templates", filename)
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.R_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new HttpError(404, `Payroll template "${filename}" could not be found on the server.`);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ template: string }> }
) {
  try {
    await requireSessionUserForApi();

    const { template } = await context.params;
    const definition =
      template === "word" || template === "excel"
        ? TEMPLATE_DEFINITIONS[template]
        : null;

    if (!definition) {
      throw new HttpError(404, "Payroll template endpoint was not found.");
    }

    const templatePath = await resolveTemplatePath(definition.filename);
    const file = await readFile(templatePath);

    return new Response(file, {
      status: 200,
      headers: {
        "Content-Type": definition.contentType,
        "Content-Disposition": `inline; filename="${definition.filename}"`,
        "Cache-Control": "private, no-store, max-age=0"
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
