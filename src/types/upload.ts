export interface UploadProgress {
    uploadId: string;
    userId: string;
    matchId?: string;
    templateId?: string;
    status: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    progress: number;
    files: Array<{
        fieldname: string;
        originalname: string;
        filename: string;
        size: number;
        mimetype: string;
        path: string;
    }>;
    startTime: string;
    lastUpdate: string;
    error?: string;
}

export interface UploadFile {
    originalName: string;
    fileName: string;
    size: number;
    mimeType: string;
    path: string;
    uploadedAt: string;
}

export interface ScreenshotUploadData {
    matchId: string;
    files: UploadFile[];
    uploadId: string;
}

export interface TemplateUploadData {
    templateName: string;
    file: UploadFile;
    uploadId: string;
}

export interface UploadResponse {
    success: boolean;
    message: string;
    data?: {
        uploadId: string;
        files: UploadFile[];
    };
    error?: string;
}

export interface UploadFile {
    originalName:string;
    fileName:string;
    size:number;
    mimeType:string;
    path:string;
    uploadedAt: string;
    r2Key?:string;
}