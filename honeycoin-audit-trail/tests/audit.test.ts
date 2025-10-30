import request from 'supertest';
import { app } from '../src/app'; // Adjust the import based on your app's export

describe('Audit API', () => {
    it('should retrieve audit entries for a given user', async () => {
        const userId = 'user1'; // Example user ID
        const response = await request(app).get(`/api/audit/${userId}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('auditEntries');
        expect(Array.isArray(response.body.auditEntries)).toBe(true);
    });

    it('should return 404 for a user with no audit entries', async () => {
        const userId = 'nonexistentUser'; // Example user ID with no entries
        const response = await request(app).get(`/api/audit/${userId}`);

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('message', 'No audit entries found for this user.');
    });
});