"use client";

import type { OptionRecord, SchoolCourseRecord } from "../shared/options";
import type { CurrentCycleConfig } from "../shared/current-cycle";
import type { OperationLog, OperationLogInput } from "../shared/operation-log";
import type { PayoutRecord, PayoutRecordInput } from "../shared/payout-record";
import type { Student, StudentInput } from "../shared/student";
import type { ManagedUser, SessionUser } from "../shared/user";

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || `Request failed with status ${response.status}.`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
}

export type AppInitialData = {
  user: SessionUser;
  currentCycle: CurrentCycleConfig;
  stats: {
    studentsTotal: number;
    claimed: number;
    payrollCandidates: number;
  };
  students: Student[];
  trash: Student[];
  payoutRecords: PayoutRecord[];
  operationLogs: OperationLog[];
  options: {
    barangays: OptionRecord[];
    schools: OptionRecord[];
    courses: OptionRecord[];
    batches: OptionRecord[];
    schoolCourses: SchoolCourseRecord[];
  };
};

export type StudentPage = {
  students: Student[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
  total: number;
};

export type StudentPageFilters = {
  query?: string;
  school?: string;
  barangay?: string;
  batch?: string;
  status?: string;
  requirementsTab?: "not-renewal" | "renewal";
  payrollTab?: "new" | "renewal";
  cycle?: {
    cycle_key: string;
    school_year: string;
    sem_number: number;
  };
};

export function getCurrentCycleConfig() {
  return request<{ currentCycle: CurrentCycleConfig }>("/api/system-config/current-cycle").then((data) => data.currentCycle);
}

export function saveCurrentCycleConfig(input: {
  school_year: string;
  sem_number: number;
  status: CurrentCycleConfig["status"];
}) {
  return request<{ currentCycle: CurrentCycleConfig }>("/api/system-config/current-cycle", {
    method: "PATCH",
    body: JSON.stringify({ currentCycle: input })
  }).then((data) => data.currentCycle);
}

export function getStudents() {
  return request<{ students: Student[] }>("/api/students").then((data) => data.students);
}

export function getStudentPage({
  cursor,
  limit = 75,
  filters
}: {
  cursor?: string | null;
  limit?: number;
  filters?: StudentPageFilters;
} = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  if (filters?.query) params.set("query", filters.query);
  if (filters?.school) params.set("school", filters.school);
  if (filters?.barangay) params.set("barangay", filters.barangay);
  if (filters?.batch && filters.batch !== "all") params.set("batch", filters.batch);
  if (filters?.status && filters.status !== "all") params.set("status", filters.status);
  if (filters?.requirementsTab) params.set("requirementsTab", filters.requirementsTab);
  if (filters?.payrollTab) params.set("payrollTab", filters.payrollTab);
  if (filters?.cycle?.cycle_key) {
    params.set("cycleKey", filters.cycle.cycle_key);
    params.set("schoolYear", filters.cycle.school_year);
    params.set("semNumber", String(filters.cycle.sem_number));
  }

  return request<StudentPage>(`/api/students?${params.toString()}`);
}

export function createStudent(student: StudentInput) {
  return request<{ student: Student }>("/api/students", {
    method: "POST",
    body: JSON.stringify({ student })
  }).then((data) => data.student);
}

export function updateStudent(studentId: string, student: StudentInput) {
  return request<{ student: Student }>(`/api/students/${studentId}`, {
    method: "PATCH",
    body: JSON.stringify({ student })
  }).then((data) => data.student);
}

export function getTrash() {
  return request<{ trash: Student[] }>("/api/trash").then((data) => data.trash);
}

export function moveStudentToTrash(studentId: string) {
  return request<{ student: Student }>(`/api/students/${studentId}`, {
    method: "DELETE"
  }).then((data) => data.student);
}

export function restoreStudent(studentId: string) {
  return request<{ student: Student }>(`/api/trash/${studentId}/restore`, {
    method: "POST"
  }).then((data) => data.student);
}

export function deleteTrashStudent(studentId: string) {
  return request<{ deleted: true }>(`/api/trash/${studentId}`, {
    method: "DELETE"
  });
}

export function getPayoutRecords() {
  return request<{ payoutRecords: PayoutRecord[] }>("/api/payout-records").then((data) => data.payoutRecords);
}

export function savePayoutRecord(record: PayoutRecordInput) {
  return request<{ payoutRecord: PayoutRecord }>("/api/payout-records", {
    method: "POST",
    body: JSON.stringify({ payoutRecord: record })
  }).then((data) => data.payoutRecord);
}

export function getOperationLogs() {
  return request<{ operationLogs: OperationLog[] }>("/api/operation-logs").then((data) => data.operationLogs);
}

export function saveOperationLog(operationLog: OperationLogInput) {
  return request<{ operationLog: OperationLog }>("/api/operation-logs", {
    method: "POST",
    body: JSON.stringify({ operationLog })
  }).then((data) => data.operationLog);
}

export function listManagedUsers() {
  return request<{ users: ManagedUser[] }>("/api/users").then((data) => data.users);
}

export function createManagedUser(user: {
  email: string;
  password: string;
  displayName?: string;
  role: string;
}) {
  return request<{ user: ManagedUser }>("/api/users", {
    method: "POST",
    body: JSON.stringify(user)
  }).then((data) => data.user);
}

export function updateManagedUser(uid: string, input: { displayName?: string; password?: string }) {
  return request<{ user: ManagedUser }>(`/api/users/${uid}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  }).then((data) => data.user);
}

export function deleteManagedUser(uid: string) {
  return request<{ deleted: true }>(`/api/users/${uid}`, { method: "DELETE" });
}

export function getOptions(collection: "barangays" | "schools" | "courses" | "batches") {
  return request<{ records: OptionRecord[] }>(`/api/options/${collection}`).then((data) => data.records);
}

export function saveOption(
  collection: "barangays" | "schools" | "courses" | "batches",
  record: Partial<OptionRecord>
) {
  return request<{ record: OptionRecord }>(`/api/options/${collection}`, {
    method: "POST",
    body: JSON.stringify({ record })
  }).then((data) => data.record);
}

export function deleteOption(
  collection: "barangays" | "schools" | "courses" | "batches",
  id: string
) {
  return request<{ deleted: true }>(`/api/options/${collection}/${id}`, {
    method: "DELETE"
  });
}

export function getSchoolCourses() {
  return request<{ schoolCourses: SchoolCourseRecord[] }>("/api/school-courses").then(
    (data) => data.schoolCourses
  );
}

export function saveSchoolCourse(schoolCourse: Partial<SchoolCourseRecord>) {
  return request<{ schoolCourse: SchoolCourseRecord }>("/api/school-courses", {
    method: "POST",
    body: JSON.stringify({ schoolCourse })
  }).then((data) => data.schoolCourse);
}

export function deleteSchoolCourse(id: string) {
  return request<{ deleted: true }>(`/api/school-courses/${id}`, {
    method: "DELETE"
  });
}

export function importBatchWorkbookOptions() {
  return request<{
    skipped: boolean;
    barangaysCreated: number;
    schoolsCreated: number;
    batchesCreated: number;
    source: string;
  }>("/api/import/batch-options", {
    method: "POST"
  });
}

export function seedFirestoreFromBundledJson() {
  return request<{
    students: number;
    trash: number;
    schoolCourses: number;
    payoutRecords: number;
    schools: number;
    courses: number;
  }>("/api/seed/firestore", {
    method: "POST"
  });
}
