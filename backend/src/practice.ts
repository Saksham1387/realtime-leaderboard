import Redis, { Redis as RedisClient } from "ioredis";
import express, { Request, Response, NextFunction } from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";

interface Player {
  playerId: string;
  score: number;
}

class Leaderboard {
  private redisClient: RedisClient;
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private LEADERBOARD_KEY = "game:leaderboard";

  constructor() {
    const redisURL = process.env.REDIS_URL || "redis://localhost:6379";
    this.app = express();
    this.redisClient = new RedisClient(redisURL);
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.initRoutes();
    this.setupWebSocketHandlers();
  }

  private initRoutes() {
    this.app.post("/player", async (req, res) => {
      try {
        const { playerId, initialScore } = req.body;
        if (!playerId) {
          res.status(400).json({ error: "Player ID is required" });
          return;
        }

        await this.redisClient.zadd(
          this.LEADERBOARD_KEY,
          initialScore || 0,
          playerId
        );
        res.status(201).json({ message: "Player added successfully" });
      } catch (error) {
        console.error("Failed to add player:", error);
        res.status(500).json({ error: "Failed to add player" });
      }
    });
  }

  private async updateScore(playerId: string, scoreIncrement: number) {
    const newScore = await this.redisClient.zincrby(
      this.LEADERBOARD_KEY,
      scoreIncrement,
      playerId
    );
    return parseFloat(newScore);
  }

  private async getPlayers() {
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

  private setupWebSocketHandlers() {
    this.wss.on("connection", async (ws) => {
      console.log("New client is here connected");
      try {
        const playesList = await this.getPlayers();
        ws.send(
          JSON.stringify({
            type: "leaderboard:update",
            data: playesList,
          })
        );
      } catch (e) {
        console.log(e);
      }

      ws.on("message", async (m: string) => {
        try {
          const parsedMessage = JSON.parse(m);
          if (parsedMessage.type == "player:update-score") {
            const { playerId, scoreIncrement } = parsedMessage.data;

            await this.updateScore(playerId, scoreIncrement);
            const players = await this.getPlayers();

            this.wss.clients.forEach((client) => {
              if (client.readyState == WebSocket.OPEN) {
                client.send(
                  JSON.stringify({
                    type: "leaderboard:update",
                    data: players,
                  })
                );
              }
            });
            console.log("leaderboard updated !");
          }
        } catch (e) {
          console.log(e);
        }
      });

      ws.on("close", () => {
        console.log("client disconnected");
      });
    });
  }




  listen(port: number = 3000): void {
    this.server.listen(port, () => {
      console.log(`Leaderboard server running on port ${port}`);
    });
  }

  async close(): Promise<void> {
    await Promise.all([
      this.redisClient.quit()
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
