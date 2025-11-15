import { Router } from 'express';
import { AuditController } from '../controllers/auditController';

const router = Router();
const auditController = new AuditController();

// Base path for this router is /api/audit, so this becomes GET /api/audit/:userId
router.get('/:userId', auditController.getAudit.bind(auditController));

export default router;
