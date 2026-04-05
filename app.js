import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import crypto from 'hypercore-crypto'

// Game state
const state = {
  board: Array(9).fill(null),
  mySymbol: null,
  currentTurn: 'X',
  isMyTurn: false,
  gameOver: false,
  isHost: false,
  connected: false,
  peer: null
}

// Swarm instance
let swarm = null
let topic = null

// DOM Elements
const elements = {
  status: document.getElementById('status'),
  connectionPanel: document.getElementById('connection-panel'),
  gamePanel: document.getElementById('game-panel'),
  hostBtn: document.getElementById('host-btn'),
  joinBtn: document.getElementById('join-btn'),
  joinInput: document.getElementById('join-input'),
  roomCodeDisplay: document.getElementById('room-code-display'),
  roomCode: document.getElementById('room-code'),
  copyBtn: document.getElementById('copy-btn'),
  turnIndicator: document.getElementById('turn-indicator'),
  board: document.getElementById('board'),
  cells: document.querySelectorAll('.cell'),
  gameResult: document.getElementById('game-result'),
  newGameBtn: document.getElementById('new-game-btn'),
  disconnectBtn: document.getElementById('disconnect-btn')
}

// Winning combinations
const WINNING_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6]             // diagonals
]

// Initialize event listeners
function init() {
  elements.hostBtn.addEventListener('click', hostGame)
  elements.joinBtn.addEventListener('click', joinGame)
  elements.copyBtn.addEventListener('click', copyRoomCode)
  elements.newGameBtn.addEventListener('click', requestNewGame)
  elements.disconnectBtn.addEventListener('click', disconnect)

  elements.cells.forEach(cell => {
    cell.addEventListener('click', () => handleCellClick(cell))
  })

  elements.joinInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinGame()
  })
}

// Update connection status display
function updateStatus(status, text) {
  elements.status.className = status
  elements.status.textContent = text
}

// Host a new game
async function hostGame() {
  elements.hostBtn.disabled = true
  updateStatus('connecting', 'Creating room...')

  try {
    swarm = new Hyperswarm()
    topic = crypto.randomBytes(32)

    swarm.on('connection', (conn, info) => {
      handleConnection(conn)
    })

    const discovery = swarm.join(topic, { server: true, client: false })
    await discovery.flushed()

    state.isHost = true
    state.mySymbol = 'X'

    const roomCodeHex = b4a.toString(topic, 'hex')
    elements.roomCode.textContent = roomCodeHex
    elements.roomCodeDisplay.classList.remove('hidden')
    updateStatus('connecting', 'Waiting for opponent...')
  } catch (err) {
    console.error('Failed to host game:', err)
    updateStatus('disconnected', 'Failed to create room')
    elements.hostBtn.disabled = false
  }
}

// Join an existing game
async function joinGame() {
  const roomCodeHex = elements.joinInput.value.trim()
  if (!roomCodeHex || roomCodeHex.length !== 64) {
    alert('Please enter a valid room code')
    return
  }

  elements.joinBtn.disabled = true
  elements.joinInput.disabled = true
  updateStatus('connecting', 'Joining room...')

  try {
    swarm = new Hyperswarm()
    topic = b4a.from(roomCodeHex, 'hex')

    swarm.on('connection', (conn, info) => {
      handleConnection(conn)
    })

    swarm.join(topic, { server: false, client: true })
    await swarm.flush()

    state.isHost = false
    state.mySymbol = 'O'
  } catch (err) {
    console.error('Failed to join game:', err)
    updateStatus('disconnected', 'Failed to join room')
    elements.joinBtn.disabled = false
    elements.joinInput.disabled = false
  }
}

// Handle peer connection
function handleConnection(conn) {
  if (state.peer) {
    conn.destroy()
    return
  }

  state.peer = conn
  state.connected = true

  updateStatus('connected', 'Connected!')
  showGamePanel()

  conn.on('data', (data) => {
    try {
      const message = JSON.parse(data.toString())
      handleMessage(message)
    } catch (err) {
      console.error('Failed to parse message:', err)
    }
  })

  conn.on('close', () => {
    handleDisconnection()
  })

  conn.on('error', (err) => {
    console.error('Connection error:', err)
    handleDisconnection()
  })

  // Host starts with X
  state.isMyTurn = state.isHost
  updateTurnIndicator()
}

// Handle incoming messages
function handleMessage(message) {
  switch (message.type) {
    case 'move':
      handleOpponentMove(message.index)
      break
    case 'new-game':
      resetGame()
      break
  }
}

// Handle opponent's move
function handleOpponentMove(index) {
  if (state.board[index] !== null || state.gameOver) return

  const opponentSymbol = state.mySymbol === 'X' ? 'O' : 'X'
  state.board[index] = opponentSymbol
  updateCell(index, opponentSymbol)

  const result = checkWinner()
  if (result) {
    endGame(result)
  } else {
    state.currentTurn = state.mySymbol
    state.isMyTurn = true
    updateTurnIndicator()
  }
}

// Handle cell click
function handleCellClick(cell) {
  if (!state.connected || !state.isMyTurn || state.gameOver) return

  const index = parseInt(cell.dataset.index)
  if (state.board[index] !== null) return

  // Make move
  state.board[index] = state.mySymbol
  updateCell(index, state.mySymbol)

  // Send move to peer
  sendMessage({ type: 'move', index })

  const result = checkWinner()
  if (result) {
    endGame(result)
  } else {
    state.currentTurn = state.mySymbol === 'X' ? 'O' : 'X'
    state.isMyTurn = false
    updateTurnIndicator()
  }
}

// Update cell display
function updateCell(index, symbol) {
  const cell = elements.cells[index]
  cell.textContent = symbol
  cell.classList.add('taken', symbol.toLowerCase())
}

// Check for winner
function checkWinner() {
  for (const combo of WINNING_COMBOS) {
    const [a, b, c] = combo
    if (state.board[a] && state.board[a] === state.board[b] && state.board[a] === state.board[c]) {
      return { winner: state.board[a], combo }
    }
  }

  if (state.board.every(cell => cell !== null)) {
    return { winner: null, combo: null } // draw
  }

  return null
}

// End the game
function endGame(result) {
  state.gameOver = true

  if (result.combo) {
    result.combo.forEach(index => {
      elements.cells[index].classList.add('winning')
    })
  }

  elements.gameResult.classList.remove('hidden', 'win', 'lose', 'draw')

  if (result.winner === null) {
    elements.gameResult.classList.add('draw')
    elements.gameResult.textContent = "It's a Draw!"
    elements.turnIndicator.textContent = 'Game Over - Draw'
  } else if (result.winner === state.mySymbol) {
    elements.gameResult.classList.add('win')
    elements.gameResult.textContent = 'You Win!'
    elements.turnIndicator.textContent = 'Game Over - You Won!'
  } else {
    elements.gameResult.classList.add('lose')
    elements.gameResult.textContent = 'You Lose!'
    elements.turnIndicator.textContent = 'Game Over - You Lost'
  }

  elements.newGameBtn.classList.remove('hidden')
}

// Request new game
function requestNewGame() {
  sendMessage({ type: 'new-game' })
  resetGame()
}

// Reset game state
function resetGame() {
  state.board = Array(9).fill(null)
  state.currentTurn = 'X'
  state.isMyTurn = state.mySymbol === 'X'
  state.gameOver = false

  elements.cells.forEach(cell => {
    cell.textContent = ''
    cell.className = 'cell'
  })

  elements.gameResult.classList.add('hidden')
  elements.newGameBtn.classList.add('hidden')
  updateTurnIndicator()
}

// Update turn indicator
function updateTurnIndicator() {
  if (state.isMyTurn) {
    elements.turnIndicator.textContent = `Your turn (${state.mySymbol})`
  } else {
    const opponent = state.mySymbol === 'X' ? 'O' : 'X'
    elements.turnIndicator.textContent = `Opponent's turn (${opponent})`
  }
}

// Show game panel
function showGamePanel() {
  elements.connectionPanel.classList.add('hidden')
  elements.gamePanel.classList.remove('hidden')
}

// Send message to peer
function sendMessage(message) {
  if (state.peer && !state.peer.destroyed) {
    state.peer.write(JSON.stringify(message))
  }
}

// Copy room code to clipboard
async function copyRoomCode() {
  const code = elements.roomCode.textContent
  try {
    await navigator.clipboard.writeText(code)
    elements.copyBtn.textContent = 'Copied!'
    setTimeout(() => {
      elements.copyBtn.textContent = 'Copy'
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

// Handle disconnection
function handleDisconnection() {
  state.peer = null
  state.connected = false

  updateStatus('disconnected', 'Opponent disconnected')
  elements.turnIndicator.textContent = 'Opponent left the game'

  if (!state.gameOver) {
    elements.gameResult.classList.remove('hidden', 'win', 'lose', 'draw')
    elements.gameResult.classList.add('win')
    elements.gameResult.textContent = 'Opponent left - You Win!'
  }
}

// Disconnect from game
async function disconnect() {
  if (state.peer) {
    state.peer.destroy()
    state.peer = null
  }

  if (swarm) {
    await swarm.destroy()
    swarm = null
  }

  // Reset all state
  state.board = Array(9).fill(null)
  state.mySymbol = null
  state.currentTurn = 'X'
  state.isMyTurn = false
  state.gameOver = false
  state.isHost = false
  state.connected = false
  topic = null

  // Reset UI
  elements.cells.forEach(cell => {
    cell.textContent = ''
    cell.className = 'cell'
  })

  elements.gamePanel.classList.add('hidden')
  elements.connectionPanel.classList.remove('hidden')
  elements.roomCodeDisplay.classList.add('hidden')
  elements.gameResult.classList.add('hidden')
  elements.newGameBtn.classList.add('hidden')
  elements.hostBtn.disabled = false
  elements.joinBtn.disabled = false
  elements.joinInput.disabled = false
  elements.joinInput.value = ''

  updateStatus('disconnected', 'Disconnected')
}

// Cleanup on window close
window.addEventListener('beforeunload', async () => {
  if (state.peer) {
    state.peer.destroy()
  }
  if (swarm) {
    await swarm.destroy()
  }
})

// Initialize app
init()
