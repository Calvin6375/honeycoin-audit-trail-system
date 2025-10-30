export interface AuditEntry {
    id: string;
    action: string;
    timestamp: Date;
    userId: string;
}