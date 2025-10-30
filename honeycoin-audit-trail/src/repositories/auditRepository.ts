import { Pool } from 'pg';
import { AuditEntry } from '../models/auditEntry';
import db from '../db';

export class AuditRepository {
    private pool: Pool;

    constructor() {
        this.pool = db;
    }

    async saveAuditEntry(entry: AuditEntry): Promise<void> {
        const query = `
            INSERT INTO audit_entries (id, action, timestamp, user_id)
            VALUES ($1, $2, $3, $4)
        `;
        const values = [entry.id, entry.action, entry.timestamp, entry.userId];
        await this.pool.query(query, values);
    }

    async getAuditEntries(userId: string): Promise<AuditEntry[]> {
        const query = `
            SELECT * FROM audit_entries WHERE user_id = $1
        `;
        const { rows } = await this.pool.query(query, [userId]);
        return rows.map(row => ({
            id: row.id,
            action: row.action,
            timestamp: row.timestamp,
            userId: row.user_id
        }));
    }
}