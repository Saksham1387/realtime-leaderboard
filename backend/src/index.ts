import Redis, { Redis as RedisClient } from 'ioredis';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Interfaces for type safety
interface Player {
    playerId: string;
    score: number;
}

interface ScoreUpdateData {
    playerId: string;
    scoreIncrement: number;
}

interface LeaderboardConfig {
    redisHost?: string;
    redisPort?: number;
    redisPassword?: string;
}

class Leaderboard {
    private redisClient: RedisClient;
    private pubClient: RedisClient;
    private subClient: RedisClient;
    private app: express.Application;
    private server: http.Server;
    private io: SocketIOServer;
    private LEADERBOARD_KEY = 'game:leaderboard';

    constructor(config: LeaderboardConfig = {}) {
        // Redis configuration with sensible defaults
        const {
            redisHost =  process.env.REDIS_HOST,
            redisPort =process.env.REDIS_PORT,
            redisPassword = process.env.REDIS_PASSWORD,
        } = config;

        // Create Redis clients with password
        const redisConfig = {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD
        };
        const redisURL = process.env.REDIS_URL || 'redis://localhost:6379';
        this.redisClient  = new Redis(redisURL);
        

        this.pubClient = new Redis(redisURL);
       

        this.subClient = new Redis(redisURL);

        // Create Express app
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new SocketIOServer(this.server, {
            cors: {
                origin: "*", // Be cautious with this in production
                methods: ["GET", "POST"]
            }
        });

        // Error handling and middleware
        this.setupErrorHandlers();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocketHandlers();
    }

    private setupErrorHandlers(): void {
        const clients = [this.redisClient, this.pubClient, this.subClient];
        
        clients.forEach(client => {
            client.on('error', (err: Error) => {
                console.error('Redis Client Error:', err);
            });
        });
    }

    private setupMiddleware(): void {
        // Enable CORS for all routes
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        });

        this.app.use(express.json());
        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            console.error(err.stack);
            res.status(500).send('Something broke!');
        });
    }

    private setupRoutes(): void {
        // Player creation route
        this.app.post('/player', this.createPlayerHandler.bind(this));
        this.app.get('/health',(req,res)=>{
            res.status(200).json({
                message:"server healthy"
            })
        })
    }

    // Separate handler method for route
    private async createPlayerHandler(req: Request, res: Response): Promise<void> {
        try {
            const { playerId, initialScore } = req.body;
            
            if (!playerId) {
                res.status(400).json({ error: 'Player ID is required' });
                return;
            }

            await this.addPlayer(playerId, initialScore || 0);
            res.status(201).json({ message: 'Player added successfully' });
        } catch (error) {
            console.error('Failed to add player:', error);
            res.status(500).json({ error: 'Failed to add player' });
        }
    }

    // Add a player to the leaderboard
    async addPlayer(playerId: string, initialScore: number = 0): Promise<number> {
        return this.redisClient.zadd(this.LEADERBOARD_KEY, initialScore, playerId);
    }

    // Update player's score
    async updateScore(playerId: string, scoreIncrement: number): Promise<number> {
        // Increment score
        const newScore = await this.redisClient.zincrby(
            this.LEADERBOARD_KEY, 
            scoreIncrement, 
            playerId
        );

        // Publish score update
        this.pubClient.publish('score-updates', JSON.stringify({
            playerId,
            scoreIncrement,
            newScore: parseFloat(newScore)
        }));

        return parseFloat(newScore);
    }

    // Get top players
    async getTopPlayers(): Promise<Player[]> {
        const players = await this.redisClient.zrevrange(
            this.LEADERBOARD_KEY, 
            0, 
            -1, // -1 indicates retrieving all elements
            'WITHSCORES'
        );
    
        const formattedPlayers: Player[] = [];
        for (let i = 0; i < players.length; i += 2) {
            formattedPlayers.push({
                playerId: players[i],
                score: parseFloat(players[i + 1])
            });
        }
    
        return formattedPlayers;
    }

    // Get player's rank
    async getPlayerRank(playerId: string): Promise<number | null> {
        const rank = await this.redisClient.zrevrank(this.LEADERBOARD_KEY, playerId);
        return rank !== null ? rank + 1 : null;
    }

    private setupWebSocketHandlers(): void {
        this.io.on('connection', async (socket) => {
            console.log('New client connected');

            try {
                // Send initial leaderboard
                const topPlayers = await this.getTopPlayers();
                socket.emit('leaderboard:update', topPlayers);
            } catch (error) {
                console.error('Failed to fetch leaderboard:', error);
            }

            // Listen for score updates
            socket.on('player:update-score', async (data: ScoreUpdateData) => {
                try {
                    const { playerId, scoreIncrement } = data;
                    
                    // Update score
                    await this.updateScore(playerId, scoreIncrement);
                    
                    // Broadcast updated leaderboard
                    const updatedTopPlayers = await this.getTopPlayers();
                    this.io.emit('leaderboard:update', updatedTopPlayers);
                } catch (error) {
                    console.error('Score update failed:', error);
                }
            });

            socket.on('disconnect', () => {
                console.log('Client disconnected');
            });
        });

        // Redis Pub/Sub for additional updates
        this.subClient.subscribe('score-updates');
        this.subClient.on('message', (channel, message) => {
            if (channel === 'score-updates') {
                console.log('Score update received:', message);
            }
        });
    }

    // Start the server
    listen(port: number = 3000): void {
        this.server.listen(port, () => {
            console.log(`Leaderboard server running on port ${port}`);
        });
    }

    // Cleanup method
    async close(): Promise<void> {
        await Promise.all([
            this.redisClient.quit(),
            this.pubClient.quit(),
            this.subClient.quit()
        ]);
        this.server.close();
    }
}

// Example usage
async function bootstrap() {
    const leaderboard = new Leaderboard({
        redisHost: process.env.REDIS_HOST || 'localhost',
        redisPort: parseInt(process.env.REDIS_PORT || '6379'),
        redisPassword: process.env.REDIS_PASSWORD
    });

    // Start the server
    leaderboard.listen(
        parseInt(process.env.PORT || '3000')
    );

    // Optional: Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('Closing server and Redis connections...');
        await leaderboard.close();
        process.exit(0);
    });
}

// Run the application
bootstrap().catch(console.error);

export default Leaderboard;