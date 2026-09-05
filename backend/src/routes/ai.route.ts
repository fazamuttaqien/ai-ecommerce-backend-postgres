import { Router } from 'express';

import { aiChatController } from '../controllers/ai.controller';

const aiRoutes: Router = Router();

// Public read-only product discovery; authentication is intentionally not required.
aiRoutes.post('/chat', aiChatController);

export default aiRoutes;
