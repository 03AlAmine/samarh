// image-compress.service.ts
// Compresse une image côté client avant stockage.
// Redimensionne à MAX_SIZE × MAX_SIZE max, qualité QUALITY, retourne un base64.

import { Injectable } from '@angular/core';

const MAX_SIZE = 400;   // px — suffisant pour photo de profil
const QUALITY  = 0.80;  // 80 % — bon compromis taille/qualité

@Injectable({ providedIn: 'root' })
export class ImageCompressService {

  /**
   * Compresse un File image et retourne un data-URL base64.
   * Ratio préservé. Si l'image est déjà plus petite que MAX_SIZE, elle est
   * seulement réencodée en JPEG pour normaliser le format.
   */
  compress(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
      reader.onload = (ev) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Décodage de l\'image impossible'));
        img.onload = () => {
          const { width, height } = this.dimensions(img.naturalWidth, img.naturalHeight);
          const canvas = document.createElement('canvas');
          canvas.width  = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', QUALITY));
        };
        img.src = ev.target!.result as string;
      };

      reader.readAsDataURL(file);
    });
  }

  /** Calcule les nouvelles dimensions en préservant le ratio */
  private dimensions(w: number, h: number): { width: number; height: number } {
    if (w <= MAX_SIZE && h <= MAX_SIZE) return { width: w, height: h };
    if (w > h) return { width: MAX_SIZE, height: Math.round(h * MAX_SIZE / w) };
    return { width: Math.round(w * MAX_SIZE / h), height: MAX_SIZE };
  }
}
