import express from 'express';

const matchRouter = express.Router();

// POST /api/v1/matches/upload
matchRouter.post('/upload', (req, res) => {
    res.json({ message: 'Upload match images - Coming soon' });
});

// GET /api/v1/matches/:id/results
matchRouter.get('/:id/results', (req, res) => {
    res.json({ message: `Get match ${req.params.id} results - Coming soon` });
});

export default matchRouter;