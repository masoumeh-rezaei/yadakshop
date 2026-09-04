import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './config/database.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 AS database_ok');

        res.json({
            success: true,
            message: 'Delivery API is running',
            database: rows,
        });
    } catch (error) {
        console.error('Database connection error:', error);

        res.status(500).json({
            success: false,
            message: 'Database connection failed',
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);

});