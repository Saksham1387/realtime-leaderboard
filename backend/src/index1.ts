import Redis, { Redis as RedisClient } from "ioredis";
import express, { Request, Response, NextFunction } from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Interfaces for type safety
interface Player {
  playerId: string;
  score: number;
}


class Leaderboard {
  private redisClient: RedisClient;
  private pubClient: RedisClient;
  private subClient: RedisClient;
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private LEADERBOARD_KEY = "game:leaderboard";

  constructor() {
    const redisURL = process.env.REDIS_URL || "redis://localhost:6379";
    this.redisClient = new Redis(redisURL);
    this.pubClient = new Redis(redisURL);
    this.subClient = new Redis(redisURL);

    // Create Express app and HTTP server
    this.app = express();
    this.server = http.createServer(this.app);
    
    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.server });

    this.setupErrorHandlers();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocketHandlers();
  }

  private setupErrorHandlers(): void {
    const clients = [this.redisClient, this.pubClient, this.subClient];

    clients.forEach((client) => {
      client.on("error", (err: Error) => {
        console.error("Redis Client Error:", err);
      });
    });
  }

  private setupMiddleware(): void {
    // Enable CORS for all routes
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS, PUT, PATCH, DELETE"
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
      );
      next();
    });

    this.app.use(express.json());
    this.app.use(
      (err: Error, req: Request, res: Response, next: NextFunction) => {
        console.error(err.stack);
        res.status(500).send("Something broke!");
      }
    );
  }

  private setupRoutes(): void {
    this.app.post("/player", this.createPlayerHandler.bind(this));
    // For health check
    this.app.get("/health", (req, res) => {
      res.status(200).json({
        message: "server healthy",
      });
    });
  }

  private async createPlayerHandler(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { playerId, initialScore } = req.body;

      if (!playerId) {
        res.status(400).json({ error: "Player ID is required" });
        return;
      }

      await this.addPlayer(playerId, initialScore || 0);
      res.status(201).json({ message: "Player added successfully" });
    } catch (error) {
      console.error("Failed to add player:", error);
      res.status(500).json({ error: "Failed to add player" });
    }
  }

  async addPlayer(playerId: string, initialScore: number = 0): Promise<number> {
    return this.redisClient.zadd(this.LEADERBOARD_KEY, initialScore, playerId);
  }

  async updateScore(playerId: string, scoreIncrement: number): Promise<number> {
    const newScore = await this.redisClient.zincrby(
      this.LEADERBOARD_KEY,
      scoreIncrement,
      playerId
    );

    this.pubClient.publish(
      "score-updates",
      JSON.stringify({
        playerId,
        scoreIncrement,
        newScore: parseFloat(newScore),
      })
    );

    return parseFloat(newScore);
  }

  async getTopPlayers(): Promise<Player[]> {
    const players = await this.redisClient.zrevrange(
      this.LEADERBOARD_KEY,
      0,
      -1,
      "WITHSCORES"
    );

    const formattedPlayers: Player[] = [];
    for (let i = 0; i < players.length; i += 2) {
      formattedPlayers.push({
        playerId: players[i],
        score: parseFloat(players[i + 1]),
      });
    }

    return formattedPlayers;
  }

  private setupWebSocketHandlers(): void {
    this.wss.on("connection", async (ws: WebSocket) => {
      console.log("New client connected");

      try {
        const topPlayers = await this.getTopPlayers();
        ws.send(JSON.stringify({
          type: "leaderboard:update",
          data: topPlayers
        }));
      } catch (error) {
        console.error("Failed to fetch leaderboard:", error);
      }

      ws.on("message", async (message: string) => {
        try {
          const parsedMessage = JSON.parse(message);

          if (parsedMessage.type === "player:update-score") {
            const { playerId, scoreIncrement } = parsedMessage.data;

            await this.updateScore(playerId, scoreIncrement);

            const updatedTopPlayers = await this.getTopPlayers();
            
            // Broadcast to all connected clients
            //@ts-ignore
            this.wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: "leaderboard:update",
                  data: updatedTopPlayers
                }));
              }
            });
          }
        } catch (error) {
          console.error("Score update failed:", error);
        }
      });

      ws.on("close", () => {
        console.log("Client disconnected");
      });
    });

    this.subClient.subscribe("score-updates");
    this.subClient.on("message", (channel, message) => {
      if (channel === "score-updates") {
        console.log("Score update received:", message);
      }
    });
  }

  listen(port: number = 3000): void {
    this.server.listen(port, () => {
      console.log(`Leaderboard server running on port ${port}`);
    });
  }

  async close(): Promise<void> {
    await Promise.all([
      this.redisClient.quit(),
      this.pubClient.quit(),
      this.subClient.quit(),
    ]);
    this.server.close();
  }
}

async function bootstrap() {
  const leaderboard = new Leaderboard();

  leaderboard.listen(parseInt(process.env.PORT || "3000"));

  process.on("SIGINT", async () => {
    console.log("Closing server and Redis connections...");
    await leaderboard.close();
    process.exit(0);
  });
}

// Run the application
bootstrap().catch(console.error);

export default Leaderboard;