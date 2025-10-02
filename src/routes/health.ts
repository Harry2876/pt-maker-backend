import { Router } from 'express';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Health
 *     description: System health monitoring
 */

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: |
 *       Returns the health status of the API server including uptime, environment, and basic system information.
 *       
 *       **Features:**
 *       - Server uptime monitoring
 *       - Environment detection
 *       - Timestamp for health check
 *       - API version information
 *       - No authentication required
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is healthy and operational
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "OK"
 *                   description: "Health status indicator"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-01T12:00:00.000Z"
 *                   description: "ISO timestamp of health check"
 *                 uptime:
 *                   type: number
 *                   example: 123.456
 *                   description: "Server uptime in seconds"
 *                 environment:
 *                   type: string
 *                   example: "production"
 *                   description: "Current environment (development/production)"
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                   description: "API version number"
 *             examples:
 *               healthy_response:
 *                 summary: Healthy server response
 *                 value:
 *                   status: "OK"
 *                   timestamp: "2024-01-01T12:00:00.000Z"
 *                   uptime: 3600.25
 *                   environment: "production"
 *                   version: "1.0.0"
 *       500:
 *         description: Server error during health check
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ERROR"
 *                 message:
 *                   type: string
 *                   example: "Health check failed"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 error:
 *                   type: string
 *                   example: "Internal server error details"
 */
router.get('/health', (req, res) => {
  try {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0'
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;