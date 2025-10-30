import { AuditEntry } from '../src/models/auditEntry';
import { AuditRepository } from '../src/repositories/auditRepository';

const seedAuditData = async () => {
    const auditRepository = new AuditRepository();

    const auditEntries: AuditEntry[] = [
        {
            id: '1',
            action: 'CREATE',
            timestamp: new Date(),
            userId: 'user1'
        },
        {
            id: '2',
            action: 'UPDATE',
            timestamp: new Date(),
            userId: 'user2'
        },
        {
            id: '3',
            action: 'DELETE',
            timestamp: new Date(),
            userId: 'user3'
        }
    ];

    for (const entry of auditEntries) {
        await auditRepository.saveAuditEntry(entry);
    }

    console.log('Audit data seeded successfully.');
};

seedAuditData().catch(error => {
    console.error('Error seeding audit data:', error);
});