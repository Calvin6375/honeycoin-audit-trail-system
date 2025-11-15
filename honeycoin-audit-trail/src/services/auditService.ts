import { AuditEntry } from '../models/auditEntry';
import { query } from '../db';

export const getAudit = async (userId: string): Promise<AuditEntry[]> => {
    const sql = `
        SELECT * FROM audit_entries
        WHERE user_id = ?
        ORDER BY timestamp DESC;
    `;

    const result = await query(sql, [userId]);
    return result.rows.map((row: any) => ({
        id: row.id,
        action: row.action,
        timestamp: row.timestamp,
        userId: row.user_id
    }));
};