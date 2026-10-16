/* Shrinks an image in the browser before upload, so logos are small and fast everywhere. */
(function () {
  const IM = (window.IM = window.IM || {});

  // resolves to { dataUrl, base64, mimeType, width, height }
  IM.resizeImage = function (file, maxW, maxH) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
        reject(new Error('Choose a PNG, JPG, WEBP or GIF image.'));
        return;
      }
      const r = new FileReader();
      r.onerror = () => reject(new Error('That file could not be read.'));
      r.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('That image could not be opened.'));
        img.onload = () => {
          const k = Math.min(1, maxW / img.width, maxH / img.height);
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k));
          c.height = Math.max(1, Math.round(img.height * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          // JPG stays JPG (smaller); everything else becomes PNG so transparency is kept
          const mimeType = /jpe?g/i.test(file.type) ? 'image/jpeg' : 'image/png';
          const dataUrl = c.toDataURL(mimeType, 0.9);
          resolve({ dataUrl, base64: dataUrl.split(',')[1], mimeType, width: c.width, height: c.height });
        };
        img.src = String(r.result);
      };
      r.readAsDataURL(file);
    });
  };
})();
