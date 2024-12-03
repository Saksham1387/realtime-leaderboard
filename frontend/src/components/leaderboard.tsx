'use client'
import { useState, useEffect } from 'react'
import io from 'socket.io-client'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trophy, Medal, Award, Plus, User, ChevronLeft, ChevronRight } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// Configuration - adjust to match your server
const SOCKET_SERVER_URL = import.meta.env.VITE_SERVER_URL
const PLAYERS_PER_PAGE = 15

// Player interface
interface Player {
  playerId: string
  score: number
}

// Leaderboard Component
export default function LeaderboardApp() {
  // State management
  const [players, setPlayers] = useState<Player[]>([])
  const [newPlayerName, setNewPlayerName] = useState<string>('')
  const [socket, setSocket] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const { toast } = useToast()

  // Connect to socket on component mount
  useEffect(() => {
    // Create socket connection
    const newSocket = io(SOCKET_SERVER_URL)
    setSocket(newSocket)

    // Listen for leaderboard updates
    newSocket.on('leaderboard:update', (updatedPlayers: Player[]) => {
      // Sort players by score in descending order
      const sortedPlayers = updatedPlayers.sort((a, b) => b.score - a.score)
      setPlayers(sortedPlayers)
      
      // Reset to first page if current page is out of bounds
      const totalPages = Math.ceil(sortedPlayers.length / PLAYERS_PER_PAGE)
      if (currentPage > totalPages) {
        setCurrentPage(totalPages || 1)
      }
    })

    // Cleanup on unmount
    return () => {
      newSocket.disconnect()
    }
  }, [])

  // Pagination logic
  const totalPages = Math.ceil(players.length / PLAYERS_PER_PAGE)
  const paginatedPlayers = players.slice(
    (currentPage - 1) * PLAYERS_PER_PAGE, 
    currentPage * PLAYERS_PER_PAGE
  )

  // Add a new player
  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a player name",
        variant: "destructive",
      })
      return
    }
    const newPlayer: Player = {
        playerId: newPlayerName,
        score: 0
      }

    try {
        const updatedPlayers = [...players, newPlayer].sort((a, b) => b.score - a.score)
        setPlayers(updatedPlayers)

      // Add player via HTTP request
      const response = await fetch(`${SOCKET_SERVER_URL}/player`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          playerId: newPlayerName,
          initialScore: 0 
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to add player')
      }

      // Clear input after adding
      setNewPlayerName('')
      toast({
        title: "Success",
        description: "Player added successfully",
      })
    } catch (error) {
      console.error('Error adding player:', error)
      toast({
        title: "Error",
        description: "Failed to add player",
        variant: "destructive",
      })
    }
  }

  // Increase player score
  const handleIncreaseScore = (playerId: string) => {
    if (socket) {
      // Emit score update via socket
      socket.emit('player:update-score', {
        playerId,
        scoreIncrement: 10 // Can be adjusted
      })
    }
  }

  const getPlayerIcon = (index: number) => {
    const adjustedIndex = (currentPage - 1) * PLAYERS_PER_PAGE + index
    switch (adjustedIndex) {
      case 0:
        return <Trophy className="h-6 w-6 text-yellow-400" />
      case 1:
        return <Medal className="h-6 w-6 text-gray-400" />
      case 2:
        return <Award className="h-6 w-6 text-amber-600" />
      default:
        return <User className="h-6 w-6 text-blue-500" />
    }
  }

  // Pagination handlers
  const goToPreviousPage = () => {
    setCurrentPage(Math.max(1, currentPage - 1))
  }

  const goToNextPage = () => {
    setCurrentPage(Math.min(totalPages, currentPage + 1))
  }

  return (
    <div className="container mx-auto px-4 py-5">
        <div className='mb-5 text-gray-500'>
        <h1>This project is running on a free instance of redis and the backend is deployed on the render</h1>
        <h1>This is just to try how much load can it handle</h1>
        <h1>Here redis ZSET's have been used</h1>
        </div>
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-center">Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            <Input 
              type="text" 
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder="Enter player name" 
              className="flex-grow"
            />
            <Button onClick={handleAddPlayer} className="whitespace-nowrap">
              <Plus className="mr-2 h-4 w-4" /> Add Player
            </Button>
          </div>

          {players.length === 0 ? (
            <p className="text-center py-4 text-muted-foreground">
              No players yet. Add a player to get started!
            </p>
          ) : (
            <>
              <ul className="space-y-2 mb-4">
                {paginatedPlayers.map((player, index) => (
                  <li 
                    key={player.playerId} 
                    className="flex justify-between items-center p-3 rounded-lg bg-muted hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-lg w-8 text-center">
                        {(currentPage - 1) * PLAYERS_PER_PAGE + index + 1}
                      </span>
                      {getPlayerIcon(index)}
                      <span className="font-medium">{player.playerId}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-lg">
                        {player.score} pts
                      </span>
                      <Button 
                        onClick={() => handleIncreaseScore(player.playerId)}
                        size="sm"
                        variant="outline"
                      >
                        +10
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Pagination Controls */}
              <div className="flex justify-between items-center mt-4">
                <Button 
                  onClick={goToPreviousPage} 
                  disabled={currentPage === 1}
                  variant="outline"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" /> Previous
                </Button>
                <span className="text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button 
                  onClick={goToNextPage} 
                  disabled={currentPage === totalPages}
                  variant="outline"
                >
                  Next <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}