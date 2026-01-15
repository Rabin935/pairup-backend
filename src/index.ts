import express , { Application, Request, Response } from 'express';
import { connectDB } from './database/mongodb';
import bodyParser from 'body-parser';
import { PORT } from './config';

import authRoutes from './routes/auth.routes';

// dotenv.config();

const app: Application = express();
// const PORT: number = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.get('/', (req: Request, res: Response) => {
    res.send('Hello, World!');
});

 
app.use('/api/auth', authRoutes);

async function startServer() {
    await connectDB();
    app.listen(
    PORT, 
    () => {
        console.log(`Server on http://localhost:${PORT}`);
    }
);
}

startServer();

