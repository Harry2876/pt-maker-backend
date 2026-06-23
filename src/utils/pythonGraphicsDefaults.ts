/** Default options for Python POST /api/v1/standings|team-list|top-10-rankings/generate */
export const DEFAULT_PYTHON_IMAGE_OPTIONS = {
    upload_to_r2: true,
    compress_image: false,
    image_quality: 95,
    render_scale: 0,
} as const;

/** Slot-list curl uses upload_to_r2 + render_scale only; compress_image/image_quality are harmless extras */
export const DEFAULT_SLOT_LIST_OPTIONS = {
    upload_to_r2: true,
    compress_image: false,
    render_scale: 0,
} as const;
