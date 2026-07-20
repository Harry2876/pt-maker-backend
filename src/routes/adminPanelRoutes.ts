import express from 'express';
import path from 'path';

const adminPanelRouter = express.Router();
const adminDashboardDir = path.join(process.cwd(), 'public', 'admin-dashboard');

adminPanelRouter.get('/', (_req, res) => {
    res.sendFile(path.join(adminDashboardDir, 'index.html'));
});

adminPanelRouter.use(express.static(adminDashboardDir));

export default adminPanelRouter;
