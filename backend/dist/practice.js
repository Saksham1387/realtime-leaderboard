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
const ioredis_1 = require("ioredis");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const ws_1 = __importStar(require("ws"));
class Leaderboard {
    constructor() {
        this.LEADERBOARD_KEY = "game:leaderboard";
        const redisURL = process.env.REDIS_URL || "redis://localhost:6379";
        this.app = (0, express_1.default)();
        this.redisClient = new ioredis_1.Redis(redisURL);
        this.server = http_1.default.createServer(this.app);
        this.wss = new ws_1.WebSocketServer({ server: this.server });
        this.initRoutes();
        this.setupWebSocketHandlers();
    }
    initRoutes() {
        this.app.post("/player", (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { playerId, initialScore } = req.body;
                if (!playerId) {
                    res.status(400).json({ error: "Player ID is required" });
                    return;
                }
                yield this.redisClient.zadd(this.LEADERBOARD_KEY, initialScore || 0, playerId);
                res.status(201).json({ message: "Player added successfully" });
            }
            catch (error) {
                console.error("Failed to add player:", error);
                res.status(500).json({ error: "Failed to add player" });
            }
        }));
    }
    updateScore(playerId, scoreIncrement) {
        return __awaiter(this, void 0, void 0, function* () {
            const newScore = yield this.redisClient.zincrby(this.LEADERBOARD_KEY, scoreIncrement, playerId);
            return parseFloat(newScore);
        });
    }
    getPlayers() {
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
            console.log("New client is here connected");
            try {
                const playesList = yield this.getPlayers();
                ws.send(JSON.stringify({
                    type: "leaderboard:update",
                    data: playesList,
                }));
            }
            catch (e) {
                console.log(e);
            }
            ws.on("message", (m) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const parsedMessage = JSON.parse(m);
                    if (parsedMessage.type == "player:update-score") {
                        const { playerId, scoreIncrement } = parsedMessage.data;
                        yield this.updateScore(playerId, scoreIncrement);
                        const players = yield this.getPlayers();
                        this.wss.clients.forEach((client) => {
                            if (client.readyState == ws_1.default.OPEN) {
                                client.send(JSON.stringify({
                                    type: "leaderboard:update",
                                    data: players,
                                }));
                            }
                        });
                        console.log("leaderboard updated !");
                    }
                }
                catch (e) {
                    console.log(e);
                }
            }));
            ws.on("close", () => {
                console.log("client disconnected");
            });
        }));
    }
    listen(port = 3000) {
        this.server.listen(port, () => {
            console.log(`Leaderboard server running on port ${port}`);
        });
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all([
                this.redisClient.quit()
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
