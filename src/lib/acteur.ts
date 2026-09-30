import { erreurs } from "./erreurs";
import type { PorteeMcp } from "./regles-mcp";
import type { Role } from "./roles";

export { LIBELLES_ROLE, ROLES, type Role } from "./roles";

/**
 * Utilisateur connecté, double authentification validée. Chaque service le reçoit en
 * premier paramètre et vérifie lui-même ses droits (spec §2).
 */
export type ActeurUtilisateur = {
  type: "utilisateur";
  id: string;
  /** Identifiant de la ligne `session_connexion` (déconnexion) ; null pour un appel MCP. */
  sessionId: string | null;
  /**
   * Jeton d'un appel MCP (décision D2 du plan du lot 8) : les services limitent alors l'acteur aux
   * brouillons de QCM et aux noms des classes. Absent pour une session de l'interface.
   */
  jetonMcp?: { id: string; portee: PorteeMcp };
  email: string;
  nom: string;
  prenom: string;
  role: Role;
};

/** Lève ACCES_REFUSE si le rôle de l'acteur n'est pas dans `roles`. */
export function exigerRole(acteur: ActeurUtilisateur, roles: readonly Role[]): void {
  if (!roles.includes(acteur.role)) throw erreurs.accesRefuse();
}

/** Admin ou super-admin : accès à l'administration des comptes. */
export function estAdministrateur(role: Role): boolean {
  return role === "admin" || role === "super_admin";
}

/**
 * L'acteur peut-il gérer un compte ou une invitation de rôle `cible` ? Le super-admin gère
 * tous les comptes ; l'admin, les seuls comptes enseignants (spec §5).
 */
export function peutGererRole(acteur: ActeurUtilisateur, cible: Role): boolean {
  if (acteur.role === "super_admin") return true;
  return acteur.role === "admin" && cible === "enseignant";
}
