import express from 'express';
import multer from 'multer';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { TeamLogoPresetController } from '../controllers/teamLogoPresetController';
import {
    createPresetSchema,
    updatePresetSchema,
    presetParamsSchema,
    presetEntryParamsSchema,
    addEntryBodySchema,
    assignPresetEntrySchema,
    suggestLogosSchema,
} from '../validations/teamLogoPresetValidation';

const logoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Invalid file type. Allowed: jpeg, png, webp'));
        }
        cb(null, true);
    },
});

/**
 * @swagger
 * tags:
 *   - name: Team Logo Presets
 *     description: |
 *       Manage reusable team logo collections (presets).
 *       A preset holds up to 25 entries, each with a team name and an uploaded logo.
 *       Entries have unique IDs even when team names are duplicated.
 *       Presets are private per user — other users cannot see or use them.
 *
 *       **Workflow:**
 *       1. `POST /logo-presets` — create a named preset (e.g. "BGMI Pro League S2")
 *       2. `POST /logo-presets/{presetId}/entries` — add entries with team name + logo image
 *       3. `POST /logo-presets/suggest` — suggest matching entries for a list of team names
 *       4. `POST /quick-pt/matches/{id}/slots/{slotId}/preset` — assign an entry to a match slot
 */

const teamLogoPresetRouter = express.Router();

teamLogoPresetRouter.use(authenticateUser);

/**
 * @swagger
 * /api/v1/quick-pt/logo-presets:
 *   post:
 *     tags: [Team Logo Presets]
 *     summary: Create a new team logo preset
 *     description: Creates an empty named preset. Add entries via POST /{presetId}/entries.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Display name for the preset
 *                 example: "BGMI Pro League Season 2"
 *     responses:
 *       201:
 *         description: Preset created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Preset created" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string, example: "BGMI Pro League Season 2" }
 *                     userId: { type: string }
 *                     entriesCount: { type: integer, example: 0 }
 *                     createdAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *   get:
 *     tags: [Team Logo Presets]
 *     summary: List all presets owned by the authenticated user
 *     description: Returns all presets with entry count. Entries are not included; use GET /{presetId} for full detail.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Presets retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       name: { type: string }
 *                       entriesCount: { type: integer }
 *                       createdAt: { type: string, format: date-time }
 *                       updatedAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized
 */
teamLogoPresetRouter.post('/', validateRequest(createPresetSchema), TeamLogoPresetController.createPreset);
teamLogoPresetRouter.get('/', TeamLogoPresetController.listPresets);

/**
 * @swagger
 * /api/v1/quick-pt/logo-presets/{presetId}:
 *   get:
 *     tags: [Team Logo Presets]
 *     summary: Get a single preset with all its entries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: presetId
 *         required: true
 *         schema:
 *           type: string
 *         description: Preset ID
 *     responses:
 *       200:
 *         description: Preset with entries retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                     userId: { type: string }
 *                     entries:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, description: "Unique entry ID — use this when assigning to a slot" }
 *                           teamName: { type: string, example: "Team Soul" }
 *                           logoStorageUrl: { type: string, description: "Raw R2/CDN URL (Python generation)" }
 *                           previewUrl: { type: string, description: "Signed /files/ preview URL" }
 *                           signedUrl: { type: string }
 *                           signedLogoUrl: { type: string, description: "Deprecated alias of previewUrl" }
 *                           expiresAt: { type: string, format: date-time }
 *                           previewUrlExpiresInSeconds: { type: integer }
 *                           createdAt: { type: string, format: date-time }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       404:
 *         description: Preset not found
 *       401:
 *         description: Unauthorized
 *   patch:
 *     tags: [Team Logo Presets]
 *     summary: Rename a preset
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: presetId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 example: "BGMI Pro League Season 3"
 *     responses:
 *       200:
 *         description: Preset renamed
 *       404:
 *         description: Preset not found
 *       401:
 *         description: Unauthorized
 *   delete:
 *     tags: [Team Logo Presets]
 *     summary: Delete a preset and all its entries
 *     description: Also removes all uploaded logos from R2 storage. Slot assignments using this preset's entries are unlinked.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: presetId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Preset deleted
 *       404:
 *         description: Preset not found
 *       401:
 *         description: Unauthorized
 */
teamLogoPresetRouter.get('/:presetId', validateRequest(presetParamsSchema, 'params'), TeamLogoPresetController.getPreset);
teamLogoPresetRouter.put('/:presetId', validateRequest(presetParamsSchema, 'params'), validateRequest(updatePresetSchema), TeamLogoPresetController.updatePreset);
teamLogoPresetRouter.delete('/:presetId', validateRequest(presetParamsSchema, 'params'), TeamLogoPresetController.deletePreset);

/**
 * @swagger
 * /api/v1/quick-pt/logo-presets/{presetId}/entries:
 *   post:
 *     tags: [Team Logo Presets]
 *     summary: Add a team + logo entry to a preset
 *     description: |
 *       Uploads a logo image to R2 (stored under `logos/presets/{presetId}/{entryId}.{ext}`) and
 *       creates a new `TeamLogoPresetEntry` in the preset.
 *
 *       - Each preset supports up to **25 entries**.
 *       - Team names **can be duplicated** — entries are differentiated by their unique ID.
 *       - Use the returned `entry.id` when assigning to a match slot.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: presetId
 *         required: true
 *         schema:
 *           type: string
 *         description: Preset ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [logo, teamName]
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Logo image (JPEG, PNG, or WebP — max 5 MB)
 *               teamName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Display name for this team entry
 *                 example: "Team Soul"
 *     responses:
 *       201:
 *         description: Entry added to preset
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Entry added to preset" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, description: "Use this ID to assign entry to a slot" }
 *                     teamName: { type: string, example: "Team Soul" }
 *                     logoStorageUrl: { type: string, description: "Raw R2/CDN URL (Python generation)" }
 *                     fileId: { type: string }
 *                     previewUrl: { type: string, description: "Signed /files/ preview URL" }
 *                     signedUrl: { type: string }
 *                     signedLogoUrl: { type: string, description: "Deprecated alias of previewUrl" }
 *                     expiresAt: { type: string, format: date-time }
 *                     previewUrlExpiresInSeconds: { type: integer }
 *                     presetId: { type: string }
 *                     createdAt: { type: string, format: date-time }
 *       400:
 *         description: No file uploaded, invalid file type, or preset is full (25 entries)
 *       404:
 *         description: Preset not found
 *       401:
 *         description: Unauthorized
 */
teamLogoPresetRouter.post(
    '/:presetId/entries',
    validateRequest(presetParamsSchema, 'params'),
    logoUpload.single('logo'),
    validateRequest(addEntryBodySchema),
    TeamLogoPresetController.addEntry
);

/**
 * @swagger
 * /api/v1/quick-pt/logo-presets/{presetId}/entries/{entryId}:
 *   delete:
 *     tags: [Team Logo Presets]
 *     summary: Delete an entry from a preset
 *     description: Removes the entry and deletes its logo from R2. Any slot assignments using this entry are unlinked.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: presetId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema:
 *           type: string
 *         description: Entry ID (returned when the entry was created)
 *     responses:
 *       200:
 *         description: Entry deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Entry deleted" }
 *       404:
 *         description: Preset or entry not found
 *       401:
 *         description: Unauthorized
 */
teamLogoPresetRouter.delete(
    '/:presetId/entries/:entryId',
    validateRequest(presetEntryParamsSchema, 'params'),
    TeamLogoPresetController.deleteEntry
);

/**
 * @swagger
 * /api/v1/quick-pt/logo-presets/suggest:
 *   post:
 *     tags: [Team Logo Presets]
 *     summary: Suggest matching preset entries for a list of team names
 *     description: |
 *       Searches the authenticated user's presets for entries whose `teamName` **exactly matches**
 *       one of the provided team names (case-insensitive).
 *
 *       Returns grouped suggestions so the client can let the user choose which entry to assign.
 *       This is **suggestion-only** — no automatic assignment happens.
 *
 *       Typical usage: after a match's slots are uploaded, send all slot team names here, then
 *       let the user pick which entry logo to use per slot.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [teamNames]
 *             properties:
 *               teamNames:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 25
 *                 items:
 *                   type: string
 *                   minLength: 1
 *                   maxLength: 100
 *                 description: Team names to look up across all user presets
 *                 example: ["Team Soul", "GODL", "OR Esports", "TSM"]
 *     responses:
 *       200:
 *         description: Suggestions returned (empty array if no matches found)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   description: One item per queried team name that has at least one matching entry
 *                   items:
 *                     type: object
 *                     properties:
 *                       teamName:
 *                         type: string
 *                         example: "Team Soul"
 *                       matches:
 *                         type: array
 *                         description: All preset entries with this team name (across all presets)
 *                         items:
 *                           type: object
 *                           properties:
 *                             entryId: { type: string }
 *                             teamName: { type: string }
 *                             presetId: { type: string }
 *                             presetName: { type: string, example: "BGMI Pro League S2" }
 *                             logoStorageUrl: { type: string }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
teamLogoPresetRouter.post('/suggest', validateRequest(suggestLogosSchema), TeamLogoPresetController.suggestLogos);

export default teamLogoPresetRouter;
