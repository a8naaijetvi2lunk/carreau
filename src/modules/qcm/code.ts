/**
 * Coloration du code des questions (spec §3.1 et §11.1 ; décision D13 du plan du lot 3) : shiki côté
 * serveur, moteur d'expressions régulières JavaScript (pas de WebAssembly), thème aux couleurs de la
 * maquette. Le résultat est une liste de jetons { texte, couleur } que React affiche comme du texte :
 * aucun HTML n'est jamais produit ni injecté.
 */
import "server-only";
import c from "@shikijs/langs/c";
import cpp from "@shikijs/langs/cpp";
import csharp from "@shikijs/langs/csharp";
import css from "@shikijs/langs/css";
import html from "@shikijs/langs/html";
import java from "@shikijs/langs/java";
import javascript from "@shikijs/langs/javascript";
import json from "@shikijs/langs/json";
import php from "@shikijs/langs/php";
import python from "@shikijs/langs/python";
import shellscript from "@shikijs/langs/shellscript";
import sql from "@shikijs/langs/sql";
import typescript from "@shikijs/langs/typescript";
import { createHighlighterCoreSync, type HighlighterCore, type ThemeRegistrationRaw } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { LangageCode } from "@/lib/regles-qcm";
import type { JetonCode } from "@/lib/vue-question";

/** Couleur du texte non coloré, sur le fond #1B1D23 des blocs de code (maquette « Question avec code »). */
export const COULEUR_TEXTE_CODE = "#E9E6DF";

const NOM_THEME = "carreau";

const THEME_CARREAU: ThemeRegistrationRaw = {
  name: NOM_THEME,
  type: "dark",
  colors: { "editor.foreground": COULEUR_TEXTE_CODE, "editor.background": "#1B1D23" },
  settings: [
    { settings: { foreground: COULEUR_TEXTE_CODE, background: "#1B1D23" } },
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#9AA1AD" } },
    {
      scope: [
        "keyword",
        "storage",
        "storage.type",
        "storage.modifier",
        "keyword.control",
        "keyword.operator.new",
        "keyword.operator.expression",
        "keyword.operator.logical.python",
        "entity.name.tag",
        "support.type.property-name",
      ],
      settings: { foreground: "#8FB3FF" },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call.generic",
        "entity.name.type",
        "entity.name.class",
        "support.class",
        "entity.other.attribute-name",
      ],
      settings: { foreground: "#F2D58A" },
    },
    {
      scope: ["constant.numeric", "constant.language", "constant.character", "support.constant"],
      settings: { foreground: "#F0B37E" },
    },
    {
      scope: ["string", "string.quoted", "punctuation.definition.string"],
      settings: { foreground: "#A8D5A2" },
    },
  ],
};

/** Identifiant shiki de chaque langage de la liste blanche (« texte » n'est pas coloré). */
const LANGAGES_SHIKI: Record<Exclude<LangageCode, "texte">, string> = {
  python: "python",
  javascript: "javascript",
  typescript: "typescript",
  java: "java",
  c: "c",
  cpp: "cpp",
  csharp: "csharp",
  php: "php",
  sql: "sql",
  html: "html",
  css: "css",
  bash: "shellscript",
  json: "json",
};

let surligneurCree: HighlighterCore | undefined;

/** Surligneur créé au premier usage (grammaires compilées une fois par processus), jamais au chargement. */
function surligneur(): HighlighterCore {
  surligneurCree ??= createHighlighterCoreSync({
    themes: [THEME_CARREAU],
    langs: [c, cpp, csharp, css, html, java, javascript, json, php, python, shellscript, sql, typescript],
    engine: createJavaScriptRegexEngine(),
  });
  return surligneurCree;
}

/** Code découpé en lignes de jetons colorés ; une ligne vide n'a aucun jeton. */
export function colorerCode(langage: LangageCode, source: string): JetonCode[][] {
  const texte = source.replace(/\r\n?/g, "\n");
  if (langage === "texte") {
    return texte
      .split("\n")
      .map((ligne) => (ligne === "" ? [] : [{ texte: ligne, couleur: COULEUR_TEXTE_CODE }]));
  }
  const { tokens } = surligneur().codeToTokens(texte, { lang: LANGAGES_SHIKI[langage], theme: NOM_THEME });
  return tokens.map((ligne) =>
    ligne.map((jeton) => ({ texte: jeton.content, couleur: jeton.color ?? COULEUR_TEXTE_CODE })),
  );
}
