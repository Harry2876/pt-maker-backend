import bcrypt from 'bcrypt';
import logger from '../utils/logger';

export class PasswordService {
    private static readonly SALT_ROUNDS = 12; // Higher security

    static async hashPassword(password: string): Promise<string> {
        try {
            const salt = await bcrypt.genSalt(this.SALT_ROUNDS);
            const hashedPassword = await bcrypt.hash(password, salt);
            logger.info('Password hashed successfully');
            return hashedPassword;
        } catch (error) {
            logger.error('Error hashing password:', error);
            throw new Error('Failed to hash password');
        }
    }

    static async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
        try {
            const isValid = await bcrypt.compare(password, hashedPassword);
            logger.info(`Password verification: ${isValid ? 'success' : 'failed'}`);
            return isValid;
        } catch (error) {
            logger.error('Error verifying password:', error);
            throw new Error('Failed to verify password');
        }
    }
}