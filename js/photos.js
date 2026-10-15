/*
 * Fotos zu To-Dos.
 *
 * Bilder werden vor dem Hochladen im Browser verkleinert (große Ansicht + Vorschaubild).
 * Cloud: privater Supabase-Speicher "todo-fotos", Anzeige über zeitlich begrenzte Links.
 * Testmodus: als Daten-URL direkt im Browser-Speicher (kleiner, da Platz begrenzt).
 *
 * Ein Foto-Eintrag im To-Do: { id, path, thumb }  (Cloud)  bzw.  { id, data, tdata }  (Testmodus)
 */
(function () {
  'use strict';

  const cloud = () => window.Store.mode === 'cloud';

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden (Format?)')); };
      img.src = url;
    });
  }

  // auf max. "size" Pixel (längere Seite) verkleinern → JPEG
  function scaled(img, size, quality) {
    const k = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  const toBlob = (canvas, q) => new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));

  const Photos = {
    // Datei (Kamera / Fotomediathek) → Foto-Eintrag; lädt in der Cloud sofort hoch
    async add(todoId, file) {
      const img = await loadImage(file);
      const id = window.Store.uid('f');
      if (cloud()) {
        const [full, thumb] = await Promise.all([toBlob(scaled(img, 1600, 0.82), 0.82), toBlob(scaled(img, 360, 0.72), 0.72)]);
        const path = `${todoId}/${id}.jpg`;
        const tpath = `${todoId}/${id}_t.jpg`;
        await Promise.all([Cloud.photos.upload(path, full), Cloud.photos.upload(tpath, thumb)]);
        return { id, path, thumb: tpath };
      }
      return { id, data: scaled(img, 1100, 0.7).toDataURL('image/jpeg', 0.7), tdata: scaled(img, 320, 0.7).toDataURL('image/jpeg', 0.7) };
    },

    // Links für Vorschau (thumb = true) oder große Ansicht; liefert { fotoId: url }
    async urls(photos, thumb) {
      if (!photos.length) return {};
      if (!photos.some((f) => f.path)) return Object.fromEntries(photos.map((f) => [f.id, thumb ? f.tdata || f.data : f.data || f.tdata]));
      const paths = photos.map((f) => (thumb ? f.thumb || f.path : f.path));
      const map = await Cloud.photos.urls(paths.filter(Boolean));
      return Object.fromEntries(photos.map((f, i) => [f.id, f.data ? (thumb ? f.tdata : f.data) : map[paths[i]] || '']));
    },

    // Dateien im Speicher entfernen (Foto gelöscht, To-Do gelöscht, Entwurf verworfen)
    async remove(photos) {
      const paths = photos.flatMap((f) => [f.path, f.thumb]).filter(Boolean);
      if (paths.length && window.Cloud && Cloud.enabled) await Cloud.photos.remove(paths);
    },
  };

  window.Photos = Photos;
})();
