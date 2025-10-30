import { Router } from 'express';
import { AuditController } from '../controllers/auditController';

const router = Router();
const auditController = new AuditController();

router.get('/api/audit/:userId', auditController.getAudit.bind(auditController));

export default router;