# Real-Time Leaderboard

This project implements a real-time leaderboard system using Redis and Node.js for the backend and React for the frontend. The leaderboard updates in real time to reflect score changes and displays the top-ranking players dynamically.

---

## Features

- **Real-Time Updates**: Scores are updated instantly and reflected on the leaderboard.
- **Scalability**: Built with Redis for handling large-scale data efficiently.
- **Sorted Rankings**: Uses Redis Sorted Sets to manage scores and ranks.
- **React Frontend**: Provides an interactive and dynamic UI for the leaderboard.
- **High Availability**: Leverages Redis Enterprise for persistence and failover mechanisms.

---

## Technologies Used

### Backend
- **Node.js**: Handles the server logic.
- **Redis**: Used for storing and managing leaderboard data.
- **Socket.io**: Enables real-time communication between the backend and frontend.

### Frontend
- **React**: Displays the leaderboard and updates dynamically.
- **Socket.io Client**: Handles real-time communication with the backend.

---

## Installation and Setup

### Prerequisites
Ensure you have the following installed:
- **Node.js** (v14 or higher)
- **Redis**
- **npm** or **yarn**

### Backend Setup
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd realtime-leaderboard
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start Redis server.
4. Run the backend server:
   ```bash
   node server.js
   ```
   The backend will run on `http://localhost:3000` by default.

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the React development server:
   ```bash
   npm start
   ```
   The frontend will run on `http://localhost:3001` by default.

---

## How It Works

1. **Adding Players**:
   Players and their initial scores are added to a Redis Sorted Set using the `ZADD` command.
   ```javascript
   client.zadd('leaderboard', initialScore, playerId);
   ```

2. **Updating Scores**:
   Scores are updated in real time using the `ZINCRBY` command.
   ```javascript
   client.zincrby('leaderboard', increment, playerId);
   ```

3. **Fetching Rankings**:
   Retrieve the top players using the `ZRANGE` command.
   ```javascript
   client.zrange('leaderboard', 0, 9, 'WITHSCORES');
   ```

4. **Real-Time Communication**:
   - Backend publishes score updates to all connected clients via Socket.io.
   - React frontend listens for updates and re-renders the leaderboard dynamically.

---

## File Structure

```
realtime-leaderboard/
├── server.js           # Node.js backend server
├── client/             # React frontend
│   ├── src/
│   │   ├── App.js      # Main React component
│   │   ├── Leaderboard.js  # Component to display leaderboard
│   │   └── index.js    # Entry point for React app
│   └── package.json    # Frontend dependencies
├── package.json        # Backend dependencies
└── README.md           # Project documentation
```

---

## Environment Variables
Create a `.env` file in the project root to configure the following variables:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3000  # Backend server port
REACT_APP_BACKEND_URL=http://localhost:3000
```

---

## Usage
1. Start both the backend and frontend servers.
2. Open the React app in a browser at `http://localhost:3001`.
3. Interact with the leaderboard in real time as scores update.

---

## Future Enhancements
- Add authentication for players.
- Include pagination for large leaderboards.
- Implement multiple leaderboards (e.g., daily, weekly).
- Add analytics for player performance over time.

---

## Contributing
Contributions are welcome! Please fork the repository and create a pull request for any enhancements or bug fixes.

---

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Acknowledgments
- [Redis](https://redis.io/)
- [React](https://reactjs.org/)
- [Socket.io](https://socket.io/)
