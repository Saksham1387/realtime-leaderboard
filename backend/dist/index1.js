"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const ws_1 = __importStar(require("ws"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
class Leaderboard {
    constructor() {
        this.LEADERBOARD_KEY = "game:leaderboard";
        const redisURL = process.env.REDIS_URL || "redis://localhost:6379";
        this.redisClient = new ioredis_1.default(redisURL);
        this.pubClient = new ioredis_1.default(redisURL);
        this.subClient = new ioredis_1.default(redisURL);
        // Create Express app and HTTP server
        this.app = (0, express_1.default)();
        this.server = http_1.default.createServer(this.app);
        // Create WebSocket server
        this.wss = new ws_1.WebSocketServer({ server: this.server });
        this.setupErrorHandlers();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocketHandlers();
    }
    setupErrorHandlers() {
        const clients = [this.redisClient, this.pubClient, this.subClient];
        clients.forEach((client) => {
            client.on("error", (err) => {
                console.error("Redis Client Error:", err);
            });
        });
    }
    setupMiddleware() {
        // Enable CORS for all routes
        this.app.use((req, res, next) => {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
            next();
        });
        this.app.use(express_1.default.json());
        this.app.use((err, req, res, next) => {
            console.error(err.stack);
            res.status(500).send("Something broke!");
        });
    }
    setupRoutes() {
        this.app.post("/player", this.createPlayerHandler.bind(this));
        // For health check
        this.app.get("/health", (req, res) => {
            res.status(200).json({
                message: "server healthy",
            });
        });
    }
    createPlayerHandler(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { playerId, initialScore } = req.body;
                if (!playerId) {
                    res.status(400).json({ error: "Player ID is required" });
                    return;
                }
                yield this.addPlayer(playerId, initialScore || 0);
                res.status(201).json({ message: "Player added successfully" });
            }
            catch (error) {
                console.error("Failed to add player:", error);
                res.status(500).json({ error: "Failed to add player" });
            }
        });
    }
    addPlayer(playerId_1) {
        return __awaiter(this, arguments, void 0, function* (playerId, initialScore = 0) {
            return this.redisClient.zadd(this.LEADERBOARD_KEY, initialScore, playerId);
        });
    }
    updateScore(playerId, scoreIncrement) {
        return __awaiter(this, void 0, void 0, function* () {
            const newScore = yield this.redisClient.zincrby(this.LEADERBOARD_KEY, scoreIncrement, playerId);
            this.pubClient.publish("score-updates", JSON.stringify({
                playerId,
                scoreIncrement,
                newScore: parseFloat(newScore),
            }));
            return parseFloat(newScore);
        });
    }
    getTopPlayers() {
        return __awaiter(this, void 0, void 0, function* () {
            const players = yield this.redisClient.zrevrange(this.LEADERBOARD_KEY, 0, -1, "WITHSCORES");
            const formattedPlayers = [];
            for (let i = 0; i < players.length; i += 2) {
                formattedPlayers.push({
                    playerId: players[i],
                    score: parseFloat(players[i + 1]),
                });
            }
            return formattedPlayers;
        });
    }
    setupWebSocketHandlers() {
        this.wss.on("connection", (ws) => __awaiter(this, void 0, void 0, function* () {
            console.log("New client connected");
            try {
                const topPlayers = yield this.getTopPlayers();
                ws.send(JSON.stringify({
                    type: "leaderboard:update",
                    data: topPlayers
                }));
            }
            catch (error) {
                console.error("Failed to fetch leaderboard:", error);
            }
            ws.on("message", (message) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const parsedMessage = JSON.parse(message);
                    if (parsedMessage.type === "player:update-score") {
                        const { playerId, scoreIncrement } = parsedMessage.data;
                        yield this.updateScore(playerId, scoreIncrement);
                        const updatedTopPlayers = yield this.getTopPlayers();
                        // Broadcast to all connected clients
                        //@ts-ignore
                        this.wss.clients.forEach((client) => {
                            if (client.readyState === ws_1.default.OPEN) {
                                client.send(JSON.stringify({
                                    type: "leaderboard:update",
                                    data: updatedTopPlayers
                                }));
                            }
                        });
                    }
                }
                catch (error) {
                    console.error("Score update failed:", error);
                }
            }));
            ws.on("close", () => {
                console.log("Client disconnected");
            });
        }));
        this.subClient.subscribe("score-updates");
        this.subClient.on("message", (channel, message) => {
            if (channel === "score-updates") {
                console.log("Score update received:", message);
            }
        });
    }
    listen(port = 3000) {
        this.server.listen(port, () => {
            console.log(`Leaderboard server running on port ${port}`);
        });
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all([
                this.redisClient.quit(),
                this.pubClient.quit(),
                this.subClient.quit(),
            ]);
            this.server.close();
        });
    }
}
function bootstrap() {
    return __awaiter(this, void 0, void 0, function* () {
        const leaderboard = new Leaderboard();
        leaderboard.listen(parseInt(process.env.PORT || "3000"));
        process.on("SIGINT", () => __awaiter(this, void 0, void 0, function* () {
            console.log("Closing server and Redis connections...");
            yield leaderboard.close();
            process.exit(0);
        }));
    });
}
// Run the application
bootstrap().catch(console.error);
exports.default = Leaderboard;
