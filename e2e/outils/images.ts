/** Image des parcours de bout en bout, fabriquée par sharp (dépendance de l'application). */
import sharp from "sharp";

export async function imagePng(): Promise<Buffer> {
  return sharp({ create: { width: 320, height: 200, channels: 3, background: "#2344c4" } })
    .png()
    .toBuffer();
}
