# TicTacPear

A peer-to-peer TicTacToe game built with [Pear Runtime](https://docs.pears.com/) — demonstrating real-time P2P connectivity with zero infrastructure.

```
┌───┬───┬───┐
│ X │ O │ X │
├───┼───┼───┤
│   │ X │   │
├───┼───┼───┤
│ O │   │ O │
└───┴───┴───┘
```

## Screenshots

<p align="center">
  <img src="https://i.ibb.co/b5XKqRjZ/Capture-d-e-cran-2026-04-05-a-17-28-25.png" alt="Host a game - Room code displayed" width="380">
  &nbsp;&nbsp;
  <img src="https://i.ibb.co/1Jdq8GkR/Capture-d-e-cran-2026-04-05-a-17-29-03.png" alt="Game finished - Winner announced" width="380">
</p>
<p align="center">
  <em>Left: Hosting a game with shareable room code</em> · <em>Right: Game finished with winner</em>
</p>

---

## Table of Contents

- [Screenshots](#screenshots)
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
  - [Architecture](#architecture)
  - [P2P Connection Flow](#p2p-connection-flow)
  - [The Hyperswarm DHT](#the-hyperswarm-dht)
- [Code Walkthrough](#code-walkthrough)
  - [Project Structure](#project-structure)
  - [Entry Point (index.js)](#entry-point-indexjs)
  - [Game Logic (app.js)](#game-logic-appjs)
  - [P2P Networking](#p2p-networking)
- [Testing Locally](#testing-locally)
- [Key Concepts](#key-concepts)
- [Troubleshooting](#troubleshooting)
- [Resources](#resources)

---

## Overview

TicTacPear demonstrates how to build real-time multiplayer games using Pear's P2P infrastructure. Unlike traditional client-server architectures, this game connects players directly through a Distributed Hash Table (DHT), eliminating the need for:

- Central game servers
- User accounts or authentication
- Backend infrastructure
- Ongoing hosting costs

Two players can connect from anywhere in the world using only a 64-character room code.

**Key Technologies:**
- [Pear Runtime](https://docs.pears.com/) — P2P application runtime
- [Hyperswarm](https://github.com/holepunchto/hyperswarm) — P2P networking and NAT traversal
- [pear-electron](https://github.com/holepunchto/pear-electron) — Desktop GUI framework

---

## Prerequisites

1. **Node.js** (v18 or higher)
   ```bash
   node --version
   ```

2. **Pear Runtime** (installed globally)
   ```bash
   npm install -g pear
   ```

3. **Verify installation**
   ```bash
   pear --version
   ```

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/tictacpear.git
cd tictacpear

# Install dependencies
npm install

# Run in development mode
pear run --dev .
```

The app will open in a new window. Click **"Create Room"** to host a game, then share the room code with your opponent.

---

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         TicTacPear                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐                          ┌─────────────┐      │
│  │   Player 1  │◄────── Hyperswarm ──────►│   Player 2  │      │
│  │   (Host)    │          DHT             │   (Guest)   │      │
│  │     "X"     │                          │     "O"     │      │
│  └─────────────┘                          └─────────────┘      │
│         │                                        │              │
│         │         Direct P2P Connection          │              │
│         └────────────────────────────────────────┘              │
│                                                                 │
│  No servers. No accounts. Just peers.                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### P2P Connection Flow

```
    Player 1 (Host)                           Player 2 (Guest)
    ───────────────                           ─────────────────
          │                                          │
          │  1. Generate random 32-byte topic        │
          │─────────────────────────────────►        │
          │     (displayed as 64-char hex)           │
          │                                          │
          │  2. Join DHT as SERVER                   │
          │     swarm.join(topic, {server: true})    │
          │                                          │
          │                                          │  3. Paste room code
          │                                          │     Join DHT as CLIENT
          │                                          │     swarm.join(topic, {client: true})
          │                                          │
          │◄─────────────────────────────────────────│
          │  4. DHT connects peers directly          │
          │     (NAT traversal handled automatically)│
          │                                          │
          │  5. Bidirectional stream established     │
          │◄────────────────────────────────────────►│
          │                                          │
          │  6. Exchange game moves as JSON          │
          │  { type: "move", index: 4 }              │
          │◄────────────────────────────────────────►│
```

### The Hyperswarm DHT

Hyperswarm uses a Distributed Hash Table for peer discovery. Here's what happens under the hood:

1. **Topic Creation**: The host generates a random 32-byte buffer as the "topic"
2. **Announcement**: The host announces their presence on the DHT under this topic
3. **Discovery**: When a guest joins with the same topic, the DHT facilitates discovery
4. **Connection**: Hyperswarm handles NAT traversal using techniques like UDP hole-punching
5. **Stream**: Once connected, peers communicate over an encrypted duplex stream

This all happens without any central coordination server.

---

## Code Walkthrough

### Project Structure

```
tictacpear/
├── package.json      # Pear configuration and dependencies
├── index.js          # Pear runtime entry point
├── index.html        # Game UI structure
├── app.js            # Game logic + P2P networking
└── style.css         # Visual styling
```

### Entry Point (index.js)

The entry point initializes the Pear runtime and sets up the Electron bridge:

```javascript
/* global Pear */
import Runtime from 'pear-electron'
import Bridge from 'pear-bridge'

// Initialize the Pear-Electron runtime
const runtime = new Runtime()

// Bridge enables HTTP-like patterns over P2P
const bridge = new Bridge()
await bridge.ready()

// Start the runtime with the bridge
const pipe = runtime.start({ bridge })

// Cleanup handler when the app closes
Pear.teardown(async () => {
  if (pipe && typeof pipe.end === 'function') {
    pipe.end()
  } else if (pipe && typeof pipe.destroy === 'function') {
    pipe.destroy()
  }
})
```

**Key Points:**
- `pear-electron` provides the desktop window framework
- `pear-bridge` enables P2P networking in the renderer process
- `Pear.teardown()` ensures clean shutdown

### Game Logic (app.js)

#### State Management

The game maintains a simple state object:

```javascript
const state = {
  board: Array(9).fill(null),  // 3x3 board as flat array
  mySymbol: null,               // 'X' or 'O'
  currentTurn: 'X',             // X always starts
  isMyTurn: false,              // Controls UI interaction
  gameOver: false,              // Prevents moves after game ends
  isHost: false,                // Host is X, guest is O
  connected: false,             // P2P connection status
  peer: null                    // The peer connection stream
}
```

#### Win Detection

Win detection checks all possible winning combinations:

```javascript
const WINNING_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6]             // Diagonals
]

function checkWinner() {
  for (const combo of WINNING_COMBOS) {
    const [a, b, c] = combo
    if (state.board[a] &&
        state.board[a] === state.board[b] &&
        state.board[a] === state.board[c]) {
      return { winner: state.board[a], combo }
    }
  }

  // Check for draw
  if (state.board.every(cell => cell !== null)) {
    return { winner: null, combo: null }
  }

  return null // Game continues
}
```

### P2P Networking

#### Creating a Room (Hosting)

```javascript
import Hyperswarm from 'hyperswarm'
import crypto from 'hypercore-crypto'
import b4a from 'b4a'

async function hostGame() {
  // Create a new Hyperswarm instance
  swarm = new Hyperswarm()

  // Generate a random 32-byte topic
  topic = crypto.randomBytes(32)

  // Listen for incoming connections
  swarm.on('connection', (conn, info) => {
    handleConnection(conn)
  })

  // Join the DHT as a server (accepting connections)
  const discovery = swarm.join(topic, {
    server: true,   // Accept incoming connections
    client: false   // Don't seek other servers
  })

  // Wait for the topic to be fully announced
  await discovery.flushed()

  // Display the room code (topic as hex string)
  const roomCode = b4a.toString(topic, 'hex')
  console.log('Share this code:', roomCode)
}
```

#### Joining a Room

```javascript
async function joinGame(roomCodeHex) {
  swarm = new Hyperswarm()

  // Convert the hex string back to a 32-byte buffer
  topic = b4a.from(roomCodeHex, 'hex')

  swarm.on('connection', (conn, info) => {
    handleConnection(conn)
  })

  // Join the DHT as a client (seeking servers)
  swarm.join(topic, {
    server: false,  // Don't accept connections
    client: true    // Seek servers announcing this topic
  })

  // Wait for connection attempts to complete
  await swarm.flush()
}
```

#### Handling Connections

```javascript
function handleConnection(conn) {
  // Prevent multiple connections
  if (state.peer) {
    conn.destroy()
    return
  }

  state.peer = conn
  state.connected = true

  // Handle incoming data
  conn.on('data', (data) => {
    const message = JSON.parse(data.toString())
    handleMessage(message)
  })

  // Handle disconnection
  conn.on('close', () => {
    state.peer = null
    state.connected = false
  })
}
```

#### Message Protocol

The game uses a simple JSON protocol:

```javascript
// Sending a move
function sendMove(cellIndex) {
  const message = { type: 'move', index: cellIndex }
  state.peer.write(JSON.stringify(message))
}

// Requesting a new game
function requestNewGame() {
  const message = { type: 'new-game' }
  state.peer.write(JSON.stringify(message))
}

// Handling incoming messages
function handleMessage(message) {
  switch (message.type) {
    case 'move':
      // Opponent made a move
      applyMove(message.index)
      break
    case 'new-game':
      // Opponent wants a rematch
      resetGame()
      break
  }
}
```

---

## Testing Locally

To test the P2P functionality on a single machine, run two instances with separate storage:

**Terminal 1 (Host):**
```bash
pear run --dev .
```

**Terminal 2 (Guest):**
```bash
pear run --dev --tmp-store .
```

1. In Terminal 1, click **"Create Room"**
2. Copy the 64-character room code
3. In Terminal 2, paste the code and click **"Join Room"**
4. Play!

---

## Key Concepts

### Why P2P?

| Traditional Architecture | P2P Architecture |
|-------------------------|------------------|
| Requires game servers | No servers needed |
| Ongoing hosting costs | Zero infrastructure cost |
| Single point of failure | Resilient by design |
| Server location affects latency | Direct peer connection |
| Requires user accounts | Anonymous by default |

### Hyperswarm Features Used

- **DHT-based discovery**: Find peers without central servers
- **NAT traversal**: Connect through firewalls and routers
- **Encrypted streams**: Secure communication by default
- **Topic-based networking**: Simple room code system

### Pear Runtime Benefits

- **Desktop apps with web tech**: HTML, CSS, JavaScript
- **Built-in P2P primitives**: Hyperswarm, Hypercore, etc.
- **No backend required**: Everything runs on the client
- **Cross-platform**: macOS, Windows, Linux

---

## Troubleshooting

### "Legacy application detected"

Your Pear installation may need updating. Run:
```bash
pear run pear://runtime
```

### Connection not establishing

1. **Check firewall settings**: Hyperswarm needs UDP access
2. **Try a different network**: Some corporate networks block P2P
3. **Verify room code**: Ensure all 64 characters are copied

### "Cannot use import statement"

Ensure `package.json` includes:
```json
{
  "type": "module"
}
```

### App crashes on close

The teardown handler should clean up connections. Ensure `index.js` includes proper cleanup:
```javascript
Pear.teardown(async () => {
  // Cleanup logic
})
```

---

## Resources

- [Pear Documentation](https://docs.pears.com/)
- [Hyperswarm GitHub](https://github.com/holepunchto/hyperswarm)
- [pear-electron GitHub](https://github.com/holepunchto/pear-electron)
- [Holepunch (Tether Data)](https://holepunch.to/)
- [KEET - Flagship P2P App](https://keet.io/)

---

## License

ISC

---

<p align="center">
  Built with 🍐 Pear Runtime
</p>
