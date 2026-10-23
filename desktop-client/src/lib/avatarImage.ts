export async function createAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Selecciona una imagen.");
  if (file.size > 10 * 1024 * 1024) throw new Error("La imagen original no puede superar 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo procesar la imagen.");
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 512, 512);
    for (const quality of [0.82, 0.72, 0.62]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 256 * 1024) {
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("No se pudo leer la imagen."));
          reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
          reader.readAsDataURL(blob);
        });
      }
    }
    throw new Error("No se pudo comprimir la imagen por debajo de 256 KB.");
  } finally {
    bitmap.close();
  }
}
