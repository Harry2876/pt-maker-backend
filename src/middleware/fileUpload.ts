import multer from "multer";
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from "crypto";
import path from "path";
import fs from 'fs/promises';
import redis from "../config/redis";
import logger from "../utils/logger";


//following filenaming timestamp_uuid_originalname

interface UploadProgress {
    uploadId: string;
    userId: string;
    matchId?: string;
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

//file type validation using magic numbers
const ALLOWED_MIME_TYPES = {
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'image/webp': [0x52, 0x49, 0x46, 0x46],
}

const FILE_LIMITS = {
    SCREENSHOT: {
        maxFiles: 10,
        maxSize: 10 * 1024 * 1024, //10 mb
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp']
    },
    TEMPLATE: {
        maxFiles: 1,
        maxSize: 15 * 1024 * 1024, // 15 mb
        allowedTypes: ['image/jpeg', 'image/png']
    }
};

//storage configuration with dynamic paths
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            const uploadType = req.body.uploadType || 'screenshot';
            const userId = req.user!.id;
            const matchId = req.params.id;

            let uploadPath: string;

            if (uploadType === 'template') {
                uploadPath = path.join('uploads', 'templates', 'custom', userId);
            } else {
                uploadPath = path.join('uploads', 'screenshots', matchId);
            }

            //create directory if it doesnt exist
            await fs.mkdir(uploadPath, { recursive: true });
            cb(null, uploadPath);
        } catch (error) {
            cb(error as Error, '');
            logger.error(`Error creating upload directory: ${error}`);
        }
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const uuid = randomUUID().slice(0, 8);
        const sanitized = file.originalname
            .replace(/[^a-zA-Z0-9.-]/g, '-')
            .replace(/-+/g, '-')
            .toLowerCase();

        const filename = `${timestamp}_${uuid}_${sanitized}`;
        cb(null, filename);
    }
});

//file filter with magic number validation
const fileFilter = (uploadType: 'screenshot' | 'template') => {
    return async (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        try {
            const limits = FILE_LIMITS[uploadType.toUpperCase() as keyof typeof FILE_LIMITS];

            //check MIME type
            if (!limits.allowedTypes.includes(file.mimetype)) {
                return cb(new Error(`Invalid file type. Allowed: ${limits.allowedTypes.join(', ')}`));
            }

            // TODO: Add magic number validation here when file buffer is available
            // This would be done in a separate validation step after upload

            cb(null, true);
        } catch (error) {
            cb(error as Error);
        }
    };
};

//progress tracking middleware
export const trackUploadProgress = (uploadType: 'screenshot' | 'template') => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void>=> {
        try {
            const userId = req.user!.id;
            const uploadId = randomUUID();

            //check for concurrent uploads
            const activeUpload = await redis.get(`upload:active:${userId}`);

            if (activeUpload) {
                res.status(429).json({
                    success: false,
                    message: 'upload already in progress. Please wait for current one to finish',
                    activeUploadId: activeUpload
                });
                return;
            }

            //initialize upload tracking
            const progress: UploadProgress = {
                uploadId,
                userId,
                matchId: req.params.id,
                status: 'UPLOADING',
                progress: 0,
                files: [],
                startTime: new Date().toISOString(),
                lastUpdate: new Date().toISOString()
            };

            //store in redis with ttl
            await redis.setObject(`upload:progress:${uploadId}`, progress, 3600); // 1 hour ttl
            await redis.set(`upload:active:${userId}`, uploadId, 3600);

            //attach to request for later use
            req.uploadId = uploadId;
            req.uploadType = uploadType;

            logger.info(`Upload tracking initialized`, { uploadId, userId, matchId: req.params.id });
            next();
        } catch (error) {
            logger.error(`Error initializing upload tracking: ${error}`);
            res.status(500).json({
                success: false,
                message: 'Failed to initialize upload tracking'
            });
            return;
        }
    };
};

//main upload middleware factory
export const createUploadMiddleware = (uploadType: 'screenshot' | 'template') => {
    const limits = FILE_LIMITS[uploadType.toUpperCase() as keyof typeof FILE_LIMITS];

    const upload = multer({
        storage,
        fileFilter: fileFilter(uploadType),
        limits: {
            fileSize: limits.maxSize,
            files: limits.maxFiles
        }
    });

    const fieldName = uploadType === 'screenshot' ? 'screenshots' : 'template';
    const multerMiddleware = uploadType === 'screenshot'
        ? upload.array(fieldName, limits.maxFiles)
        : upload.single(fieldName);

    return [
        trackUploadProgress(uploadType),
        multerMiddleware,
        handleUploadComplete
    ];
};

//post upload processing
const handleUploadComplete = async (req: Request, res: Response, next: NextFunction) : Promise<void> => {
    try {
        const uploadId = req.uploadId!;
        const files = req.files as Express.Multer.File[] || (req.file ? [req.file] : []);

        if (!files || files.length === 0) {
            await cleanupFailedUpload(uploadId, req.user!.id);
            res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
            return;
        }

        //update progress
        const progress = await redis.getObject<UploadProgress>(`upload:progress:${uploadId}`);

        if (progress) {
            progress.status = 'PROCESSING';
            progress.progress = 50;
            progress.files = files.map(file => ({
                fieldname: file.fieldname,
                originalname: file.originalname,
                filename: file.filename,
                size: file.size,
                mimetype: file.mimetype,
                path: file.path
            }));
            progress.lastUpdate = new Date().toISOString();

            await redis.setObject(`upload:progress:${uploadId}`, progress, 3600);

            //broadcast progress  update ( websocket or  http pooling)
            //await broadcastProgress(progress.userId,progress);
        }

        //attach upload info to request
        req.uploadInfo = {
            uploadId,
            files: files.map(file => ({
                originalName: file.originalname,
                fileName: file.filename,
                size: file.size,
                mimeType: file.mimetype,
                path: file.path
            }))
        };
        next();
    } catch (error) {
        logger.error(`Error handling upload completion: ${error}`);
        await cleanupFailedUpload(req.uploadId!, req.user!.id, error as Error);
        res.status(500).json({
            success: false,
            message: 'Upload Processing Failed'
        });
        return;
    }
};

// Cleanup utility
const cleanupFailedUpload = async (uploadId: string, userId: string, error?: Error) => {
    try {
        const progress = await redis.getObject<UploadProgress>(`upload:progress:${uploadId}`);

        if (progress) {
            // Delete uploaded files
            for (const file of progress.files) {
                try {
                    await fs.unlink(file.path);
                } catch (unlinkError) {
                    logger.warn(`Failed to delete file ${file.path}:`, unlinkError);
                }
            }

            // Update progress with error
            progress.status = 'FAILED';
            progress.error = error?.message || 'Upload failed';
            progress.lastUpdate = new Date().toISOString();

            await redis.setObject(`upload:progress:${uploadId}`, progress, 300); // Keep for 5 minutes
        }

        // Remove active upload lock
        await redis.delete(`upload:active:${userId}`);

        logger.info(`Cleaned up failed upload: ${uploadId}`);

    } catch (cleanupError) {
        logger.error('Error during upload cleanup:', cleanupError);
    }
};

//export middleware instances
export const screenshotUpload = createUploadMiddleware('screenshot');
export const templateUpload = createUploadMiddleware('template');
//progress check endpoint middleware  
export const getUploadProgress = async (req: Request, res: Response) => {
    try {
        const { uploadId } = req.params;
        const userId = req.user!.id;

        const progress = await redis.getObject<UploadProgress>(`upload:progress:${uploadId}`);

        if (!progress || progress.userId !== userId) {
            res.status(404).json({
                success: false,
                message: 'Upload not found or access denied'
            });
            return;
        }

        // Add polling recommendations
        let pollingInterval = 2000; // Default 2 seconds

        if (progress.status === 'UPLOADING') {
            pollingInterval = 1000; // 1 second for active upload
        } else if (progress.status === 'PROCESSING') {
            pollingInterval = 3000; // 3 seconds for processing
        } else if (progress.status === 'COMPLETED' || progress.status === 'FAILED') {
            pollingInterval = -1; // Stop polling
        }

        res.json({
            success: true,
            data: progress,
            polling: {
                shouldContinue: pollingInterval > 0,
                intervalMs: pollingInterval,
                nextCheck: pollingInterval > 0 ? Date.now() + pollingInterval : null
            }
        });
    } catch (error) {
        logger.error(`Error retrieving upload progress: ${error}`);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve upload progress'
        });
    }
};

// Extend Express Request interface
declare global {
    namespace Express {
        interface Request {
            uploadId?: string;
            uploadType?: 'screenshot' | 'template';
            uploadInfo?: {
                uploadId: string;
                files: Array<{
                    originalName: string;
                    fileName: string;
                    size: number;
                    mimeType: string;
                    path: string;
                }>;
            };
        }
    }
}