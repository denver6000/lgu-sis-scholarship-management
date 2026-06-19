export type CurrentCycleConfig = {
  school_year: string;
  sem_number: number;
  cycle_key: string;
  status: "open" | "locked" | "archived";
  updated_at: string;
  updated_by: string;
};

export function cycleKeyFor(schoolYear: string, semNumber: number) {
  return `${String(schoolYear || "").trim()}__${semNumber}`;
}

export function defaultCurrentCycleConfig(): CurrentCycleConfig {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const schoolYear = month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  const semNumber = month >= 6 && month <= 11 ? 1 : 2;

  return {
    school_year: schoolYear,
    sem_number: semNumber,
    cycle_key: cycleKeyFor(schoolYear, semNumber),
    status: "open",
    updated_at: now.toISOString(),
    updated_by: ""
  };
}
