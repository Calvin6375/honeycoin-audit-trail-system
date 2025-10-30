import { Pool } from 'pg';
import { AuditEntry } from '../models/auditEntry';
import { db } from '../db';

export const getAudit = async (userId: string): Promise<AuditEntry[]> => {
    const query = `
        SELECT * FROM audit_entries
        WHERE user_id = $1
        ORDER BY timestamp DESC;
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows;
};