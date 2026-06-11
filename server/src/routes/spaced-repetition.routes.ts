import { Router } from 'express';
import { SpacedRepetitionController } from '@/controllers/spaced-repetition.controller.ts';
import { authMiddleware } from '@/middleware/auth.middleware.ts';

const router: Router = Router();

router.use(authMiddleware);

router.get('/session', SpacedRepetitionController.getSession);
router.post('/review', SpacedRepetitionController.submitReview);

export default router;
