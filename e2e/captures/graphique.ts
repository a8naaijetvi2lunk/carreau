/**
 * Image de l'énoncé de la question 3 des captures du README (tâche 17) : deux petits graphiques
 * côte à côte, « A » avec une courbe croissante et « B » avec une courbe en cloche. Le SVG est
 * écrit ici, converti en PNG par `sharp` (dépendance déjà utilisée par l'application).
 */
import sharp from "sharp";

const BLEU = "#2344c4";
const GRIS = "#94a3b8";
const ENCRE = "#111827";

function petitGraphique(decalageX: number, courbe: string, lettre: string): string {
  return `
    <g transform="translate(${decalageX}, 20)">
      <line x1="20" y1="280" x2="260" y2="280" stroke="${GRIS}" stroke-width="2" />
      <line x1="20" y1="280" x2="20" y2="20" stroke="${GRIS}" stroke-width="2" />
      <path d="${courbe}" fill="none" stroke="${BLEU}" stroke-width="4" stroke-linecap="round" />
      <text x="140" y="315" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="bold" fill="${ENCRE}">${lettre}</text>
    </g>`;
}

/** Courbe croissante sur tout l'intervalle (graphique A). */
const COURBE_CROISSANTE = "M 20 260 C 60 245, 100 200, 140 160 C 180 120, 220 70, 260 40";

/** Courbe en cloche : monte puis redescend (graphique B). */
const COURBE_EN_CLOCHE = "M 20 270 C 60 220, 90 60, 150 50 C 210 60, 240 220, 260 270";

export async function graphiquePng(): Promise<Buffer> {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
      <rect x="0" y="0" width="640" height="400" fill="#ffffff" />
      ${petitGraphique(20, COURBE_CROISSANTE, "A")}
      ${petitGraphique(340, COURBE_EN_CLOCHE, "B")}
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
