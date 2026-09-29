/** Rôles d'un compte (spec §1.1). */
export type Role = "super_admin" | "admin" | "enseignant";

export const ROLES = ["super_admin", "admin", "enseignant"] as const satisfies readonly Role[];

export const LIBELLES_ROLE: Record<Role, string> = {
  super_admin: "Super-admin",
  admin: "Admin",
  enseignant: "Enseignant",
};
