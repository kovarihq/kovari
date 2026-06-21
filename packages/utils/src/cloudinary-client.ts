/**
 * Pure client-safe Cloudinary URL formatters.
 * These do NOT import the Node.js `cloudinary` SDK to prevent Webpack `fs` module errors in Client Components.
 */

/**
 * Get optimized URL for an image/video
 */
export const getOptimizedUrl = (
  url: string,
  options: {
    width?: number;
    height?: number;
    quality?: number | string;
    format?: string;
    crop?: string;
    gravity?: string;
  } = {}
): string => {
  if (!url || !url.includes("cloudinary.com")) {
    return url; // Return original URL if not from Cloudinary
  }

  // CRITICAL FIX: Do not mutate signed URLs!
  if (url.includes("/s--")) {
    return url;
  }

  // Do not mutate raw (e.g. encrypted E2EE) resource URLs!
  if (url.includes("/raw/")) {
    return url;
  }

  const transformations = [];

  const finalOptions = {
    format: "auto",
    quality: "auto",
    crop: "limit",
    ...options
  };

  if (finalOptions.crop) transformations.push(`c_${finalOptions.crop}`);
  if (finalOptions.width) transformations.push(`w_${finalOptions.width}`);
  if (finalOptions.height) transformations.push(`h_${finalOptions.height}`);
  if (finalOptions.gravity) transformations.push(`g_${finalOptions.gravity}`);
  if (finalOptions.quality) transformations.push(`q_${finalOptions.quality}`);
  if (finalOptions.format) transformations.push(`f_${finalOptions.format}`);

  if (transformations.length === 0) {
    return url;
  }

  const urlParts = url.split("/");
  const uploadIndex = urlParts.findIndex((part) => part === "upload");

  if (uploadIndex !== -1) {
    urlParts.splice(uploadIndex + 1, 0, transformations.join(","));
    return urlParts.join("/");
  }

  return url;
};

export const getThumbnailUrl = (url: string, size = 150): string => {
  return getOptimizedUrl(url, {
    width: size,
    height: size,
    crop: "fill",
    gravity: "auto",
  });
};

export const getFeedImageUrl = (url: string): string => {
  return getOptimizedUrl(url, {
    width: 1080,
    crop: "limit",
    quality: "auto",
  });
};

export const getFullImageUrl = (url: string): string => {
  return getOptimizedUrl(url, {
    width: 2048,
    crop: "limit",
    quality: "auto:best",
  });
};

export const getPublicIdFromUrl = (url: string): string | null => {
  if (!url || !url.includes("cloudinary.com")) {
    return null;
  }

  try {
    const urlParts = url.split("/");
    const uploadIndex = urlParts.findIndex((part) => part === "upload");

    if (uploadIndex !== -1 && uploadIndex + 2 < urlParts.length) {
      const publicIdWithExtension = urlParts[uploadIndex + 2];
      const lastDotIndex = publicIdWithExtension.lastIndexOf(".");

      if (lastDotIndex !== -1) {
        return publicIdWithExtension.substring(0, lastDotIndex);
      }
    }
  } catch (error) {
    console.error("Error extracting public ID:", error);
  }

  return null;
};
