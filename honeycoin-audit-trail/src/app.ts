import express from 'express';
import auditRoutes from './routes/auditRoutes';
import transactionRoutes from './routes/transactionRoutes';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api/audit', auditRoutes);
app.use('/api/transactions', transactionRoutes);

const PORT = process.env.PORT || 3000;

export { app };

export const startServer = () => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
};
