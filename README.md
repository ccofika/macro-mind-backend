# MacroMind Server

This is the server component of the MacroMind application, which provides the backend API for card management, user authentication, and AI text improvement.

## MongoDB Migration

The application has been migrated from using JSON files to MongoDB for data storage. Follow these steps to set up MongoDB and migrate your existing data:

### Prerequisites

- MongoDB installed locally or a MongoDB Atlas account
- Node.js and npm installed

### Setup

1. Create a `.env` file in the server directory with the following content:

```
PORT=5000
JWT_SECRET=your_jwt_secret_here
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_CLIENT_ID=your_google_client_id_here
MONGODB_URI=mongodb://localhost:27017/macromind
```

Replace the values with your actual credentials. For local development, you can use `mongodb://localhost:27017/macromind` as the MongoDB URI.

### Running the Migration

To migrate existing data from JSON files to MongoDB, run:

```
npm run migrate
```

This will:
1. Connect to MongoDB using the URI in your `.env` file
2. Read data from the JSON files in the `data` directory
3. Insert the data into MongoDB collections
4. Log the progress and results

### Starting the Server

After migration, start the server with:

```
npm start
```

Or for development with auto-reload:

```
npm run dev
```

## API Endpoints

The server provides the following API endpoints:

### Authentication

- `POST /api/auth/login` - Login with email and password
- `POST /api/auth/google` - Login with Google OAuth
- `POST /api/auth/register` - Register a new user
- `GET /api/auth/me` - Get current user info (requires authentication)

### Cards

- `GET /api/cards` - Get all cards for the current user
- `POST /api/cards` - Create a new card
- `PUT /api/cards/:id` - Update a card
- `DELETE /api/cards/:id` - Delete a card
- `POST /api/cards/multiple/delete` - Delete multiple cards
- `POST /api/cards/positions` - Update card positions
- `POST /api/cards/canvas-state` - Save canvas state

### Connections

- `GET /api/cards/connections` - Get all connections
- `POST /api/cards/connections` - Create a new connection
- `PUT /api/cards/connections/:id` - Update a connection
- `DELETE /api/cards/connections/:id` - Delete a connection

### AI

- `POST /api/ai/improve` - Improve text using AI

## Data Models

The application uses the following MongoDB models:

### User

- `email` - User's email (unique)
- `password` - Hashed password
- `name` - User's name
- `picture` - Profile picture URL
- `googleId` - Google ID (for OAuth)
- `role` - User role (user or admin)
- `canvasState` - Saved canvas state (zoom and pan)
- `createdAt` - Account creation date

### Card

- `userId` - Owner's email
- `type` - Card type (category, answer, question, note)
- `title` - Card title
- `content` - Card content
- `position` - Position on canvas (x, y coordinates)
- `createdAt` - Creation date
- `updatedAt` - Last update date

### Connection

- `userId` - Owner's email
- `sourceId` - Source card ID
- `targetId` - Target card ID
- `label` - Connection label
- `createdAt` - Creation date 