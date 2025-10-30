import express from 'express';
import auditRoutes from './routes/auditRoutes';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(express.json());
app.use('/api/audit', auditRoutes);

const PORT = process.env.PORT || 3000;

export const startServer = () => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
};