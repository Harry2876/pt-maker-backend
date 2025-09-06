import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// Basic auth middleware for Swagger docs
export const swaggerBasicAuth = (req: Request, res: Response, next: NextFunction) => {
    // Check if Swagger is enabled
    if (process.env.ENABLE_SWAGGER !== 'true') {
        return res.status(404).json({ error: 'Documentation not available' });
    }

    // Get auth header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Swagger Documentation"');
        return res.status(401).json({ 
            error: 'Authentication required',
            message: 'Please provide username and password to access API documentation'
        });
    }

    // Decode basic auth
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');

    // Verify credentials
    const validUsername = process.env.SWAGGER_USERNAME;
    const validPassword = process.env.SWAGGER_PASSWORD;

    if (username === validUsername && password === validPassword) {
        logger.info(`Swagger documentation accessed by: ${username} from IP: ${req.ip}`);
        return next();
    } else {
        logger.warn(`Unauthorized Swagger access attempt from IP: ${req.ip} with username: ${username}`);
        res.setHeader('WWW-Authenticate', 'Basic realm="Swagger Documentation"');
        return res.status(401).json({ 
            error: 'Invalid credentials',
            message: 'Username or password is incorrect'
        });
    }
};