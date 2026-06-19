import type { AppRole } from "./roles";

export type SessionUser = {
  uid: string;
  email: string;
  name: string;
  role: AppRole | string;
  claims: {
    admin: boolean;
    role: AppRole | null;
  };
};

export type ManagedUser = {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
  role: AppRole | null;
};
