export type OperationAction = "insert" | "update" | "delete" | "restore" | "export";

export type OperationLog = {
  id: string;
  action: OperationAction;
  entity: string;
  entity_id: string;
  summary: string;
  metadata?: Record<string, unknown>;
  actor_uid: string;
  actor_email: string;
  actor_name: string;
  actor_role: string;
  created_at: string;
};

export type OperationLogInput = {
  action: OperationAction;
  entity: string;
  entity_id?: string;
  summary: string;
  metadata?: Record<string, unknown>;
};
