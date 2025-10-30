import { Request, Response } from 'express';
import { AuditRepository } from '../repositories/auditRepository';

export class AuditController {
    private auditRepository: AuditRepository;

    constructor() {
        this.auditRepository = new AuditRepository();
    }

    public async getAudit(req: Request, res: Response): Promise<void> {
        const userId = req.params.userId;

        try {
            const auditEntries = await this.auditRepository.getAuditEntries(userId);
            res.status(200).json(auditEntries);
        } catch (error) {
            console.error('Error retrieving audit data:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
}