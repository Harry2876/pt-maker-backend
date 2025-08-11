import db from '../config/database';
import logger from '../utils/logger';

export abstract class BaseService {
    protected db = db;
    protected logger = logger;

    protected handleError(error: any, operation: string) {
        this.logger.error(`${operation} failed:`, error);
        throw new Error(`${operation} failed: ${error.message}`);
    }
}