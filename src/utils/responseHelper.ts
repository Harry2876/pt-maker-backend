export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: {
    code: string;
    details?: string;
    timestamp: string;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
    version: string;
  };
}

export class ResponseHelper {
  static success<T>(message: string, data?: T, meta?: any): ApiResponse<T> {
    return {
      success: true,
      message,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
        ...meta
      }
    };
  }

  static error(message: string, code: string, details?: string): ApiResponse {
    return {
      success: false,
      message,
      error: {
        code,
        details,
        timestamp: new Date().toISOString()
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0'
      }
    };
  }

  static unauthorized(message: string = 'Unauthorized access', details?: string): ApiResponse {
    return this.error(message, 'UNAUTHORIZED', details);
  }

  static accountLocked(
    message: string,
    lockReason: string,
    retryAfterSeconds?: number
  ): ApiResponse<{ retryAfterSeconds?: number; lockReason: string }> {
    return {
      success: false,
      message,
      data: {
        lockReason,
        ...(retryAfterSeconds != null && { retryAfterSeconds }),
      },
      error: {
        code: 'ACCOUNT_LOCKED',
        details: lockReason,
        timestamp: new Date().toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  static validationError(message: string, details?: string): ApiResponse {
    return this.error(message, 'VALIDATION_ERROR', details);
  }

  static notFound(message: string = 'Resource not found'): ApiResponse {
    return this.error(message, 'NOT_FOUND');
  }

  static conflict(message: string): ApiResponse {
    return this.error(message, 'CONFLICT');
  }

  static serverError(message: string = 'Internal server error'): ApiResponse {
    return this.error(message, 'INTERNAL_ERROR');
  }
}