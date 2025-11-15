import express from 'express';
import auditRoutes from './routes/auditRoutes';
import transactionRoutes from './routes/transactionRoutes';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(express.json());
app.use('/api/audit', auditRoutes);
app.use('/api/transactions', transactionRoutes);

const PORT = process.env.PORT || 3000;

export { app };

export const startServer = () => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
};
