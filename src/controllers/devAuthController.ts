import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import prisma from '../config/database';
import redis from '../config/redis';
import { env } from '../config/env';
import { ResponseHelper } from '../utils/responseHelper';
import logger from '../utils/logger';

const DEV_USER_PHONE = '+910000000001';
const DEV_USER_USERNAME = 'dev_test_user';
const DEV_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export class DevAuthController {
    static getDevToken = async (req: Request, res: Response) => {
        // Hard block in production — belt-and-suspenders on top of the route guard
        if (env.NODE_ENV === 'production') {
            return res.status(404).json({ error: 'Not found' });
        }

        try {
            // Find or seed the dedicated dev test user
            let devUser = await prisma.user.findUnique({
                where: { phoneNumber: DEV_USER_PHONE },
                select: { id: true, phoneNumber: true, username: true, fullName: true, organization: true },
            });

            if (!devUser) {
                const passwordHash = await bcrypt.hash('DevTest@1234', 12);
                devUser = await prisma.user.create({
                    data: {
                        phoneNumber: DEV_USER_PHONE,
                        username: DEV_USER_USERNAME,
                        fullName: 'Dev Test User',
                        organization: 'Dev Team',
                        passwordHash,
                    },
                    select: { id: true, phoneNumber: true, username: true, fullName: true, organization: true },
                });
                logger.info('✅ Dev test user created');
            }

            const now = Math.floor(Date.now() / 1000);
            const sessionId = `dev-session-${Date.now()}`;

            const tokenPayload = {
                userId: devUser.id,
                phoneNumber: devUser.phoneNumber,
                sessionId,
                jti: `${sessionId}-access`,
                type: 'access',
                iat: now,
                exp: now + DEV_TOKEN_TTL_SECONDS,
            };

            const accessToken = jwt.sign(tokenPayload, env.JWT_SECRET!);

            // Store in Redis so verifySessionToken can validate it (same as regular login)
            await redis.setObject(`access_token:${accessToken}`, tokenPayload, DEV_TOKEN_TTL_SECONDS);

            const expiresAt = new Date((now + DEV_TOKEN_TTL_SECONDS) * 1000).toISOString();
            logger.info(`🔑 Dev token issued for ${devUser.username}, expires ${expiresAt}`);

            return res.json(ResponseHelper.success('Dev token generated', {
                accessToken,
                expiresIn: DEV_TOKEN_TTL_SECONDS,
                expiresAt,
                tokenType: 'Bearer',
                user: {
                    id: devUser.id,
                    phoneNumber: devUser.phoneNumber,
                    username: devUser.username,
                    fullName: devUser.fullName,
                },
                usage: 'Add header: Authorization: Bearer <accessToken>',
                tip: 'Copy this token into DOCS_TEST_TOKEN in .env to pre-fill it in Scalar docs.',
            }));
        } catch (error) {
            logger.error('Dev token generation error:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to generate dev token'));
        }
    };
}
