import { AuditEntry } from '../models/auditEntry';
import { query } from '../db';

export class AuditRepository {

    async saveAuditEntry(entry: AuditEntry): Promise<void> {
        const sql = `
            INSERT INTO audit_entries (id, action, timestamp, user_id)
            VALUES (?, ?, ?, ?)
        `;
        const values = [entry.id, entry.action, entry.timestamp, entry.userId];
        await query(sql, values);
    }

    async getAuditEntries(userId: string): Promise<AuditEntry[]> {
        const sql = `
            SELECT * FROM audit_entries WHERE user_id = ?
        `;
        const { rows } = await query(sql, [userId]);
        return rows.map((row: any) => ({
            id: row.id,
            action: row.action,
            timestamp: row.timestamp,
            userId: row.user_id
        }));
    }
}