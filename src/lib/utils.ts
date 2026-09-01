export function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function getOptimizedCloudinaryUrl(url: string | null | undefined, width = 400, crop = 'fill') {
  if (!url) return '';
  // Check if it's a Cloudinary URL
  if (!url.includes('res.cloudinary.com')) return url;
  
  // Don't optimize if it's already optimized or if it's not an image (e.g., pdf, raw)
  if (url.includes('/upload/w_') || url.includes('/upload/f_auto') || url.includes('/raw/upload/') || url.includes('/video/upload/')) {
    return url;
  }

  // Insert transformations after /upload/
  // Example: https://res.cloudinary.com/demo/image/upload/v1234/file.jpg
  // Becomes: https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_400,c_fill/v1234/file.jpg
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width},c_${crop}/`);
}
