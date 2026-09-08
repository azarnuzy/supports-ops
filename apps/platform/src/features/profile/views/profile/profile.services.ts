export function validateProfile(name: string, image: string) {
  const trimmedName = name.trim();
  const trimmedImage = image.trim();

  if (!trimmedName) {
    return "Display name is required.";
  }

  if (trimmedName.length > 100) {
    return "Display name must be 100 characters or fewer.";
  }

  if (trimmedImage) {
    try {
      const url = new URL(trimmedImage);

      if (!["http:", "https:"].includes(url.protocol)) {
        return "Enter a valid http or https image URL.";
      }
    } catch {
      return "Enter a valid http or https image URL.";
    }
  }

  return null;
}
