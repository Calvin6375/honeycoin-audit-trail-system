import express from 'express';
import { json } from 'body-parser';
import auditRoutes from './routes/auditRoutes';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(json());
app.use('/api/audit', auditRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});