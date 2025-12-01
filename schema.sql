-- This SQL schema creates the database structure for your bowling app.
-- It's designed to store all the information the coach requested,
-- from player profiles to individual game scores and substitutions.

-- Use 'TEXT' for enums/types if your SQL dialect doesn't support ENUM.
-- Example: CREATE TYPE gender_enum AS ENUM ('Male', 'Female');

CREATE TABLE Teams (
    team_id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_name VARCHAR(100) NOT NULL, -- e.g., "Boys Varsity", "Girls JV"
    gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female')) -- For separating 'Boys' and 'Girls' pages
);

CREATE TABLE Seasons (
    season_id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- e.g., "2024-2025 Season"
    season_name VARCHAR(50) NOT NULL,
    year_start INTEGER NOT NULL
);

CREATE TABLE Players (
    player_id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    -- Store graduation year to track stats over the years
    graduation_year INTEGER,
    is_active BOOLEAN DEFAULT true,
    -- This allows saving stats for alumni ("Save player stats over the years")
    FOREIGN KEY (team_id) REFERENCES Teams(team_id)
);

-- Stores the different bowling alleys
CREATE TABLE Locations (
    location_id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_name VARCHAR(255) NOT NULL UNIQUE, -- "Montvale Lanes", "Holiday Bowl Oakland", etc.
    address TEXT
);

-- Stores data about a specific match or event
CREATE TABLE Matches (
    match_id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    match_date DATE NOT NULL,
    opponent_name VARCHAR(255),
    -- Used for organizing rankings
    match_type TEXT DEFAULT 'Regular Season' CHECK (match_type IN ('Regular Season', 'County', 'Division', 'State')),
    team_county_rank INTEGER,
    team_division_rank INTEGER,
    FOREIGN KEY (team_id) REFERENCES Teams(team_id),
    FOREIGN KEY (season_id) REFERENCES Seasons(season_id),
    FOREIGN KEY (location_id) REFERENCES Locations(location_id)
);

-- This is the main table for "type in three scores"
-- Each row represents one player's 3-game series in a single match
CREATE TABLE Series (
    series_id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    match_id INTEGER NOT NULL,
    game1_score INTEGER CHECK (game1_score >= 0 AND game1_score <= 300),
    game2_score INTEGER CHECK (game2_score >= 0 AND game2_score <= 300),
    game3_score INTEGER CHECK (game3_score >= 0 AND game3_score <= 300),
    -- These can be calculated by the API and stored for easy access
    total_wood INTEGER, -- "total wood"
    series_average REAL, -- "average"
    FOREIGN KEY (player_id) REFERENCES Players(player_id),
    FOREIGN KEY (match_id) REFERENCES Matches(match_id)
);

-- Tracks substitutions as requested
-- "goes on the original person's score, but make it so that you can keep track of WHO gets subbed in"
CREATE TABLE Substitutions (
    substitution_id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- The series belonging to the ORIGINAL player
    series_id INTEGER NOT NULL,
    -- The player who subbed IN
    sub_player_id INTEGER NOT NULL,
    -- Which game did they sub in for? (1, 2, or 3)
    game_number INTEGER NOT NULL CHECK (game_number IN (1, 2, 3)),
    FOREIGN KEY (series_id) REFERENCES Series(series_id),
    FOREIGN KEY (sub_player_id) REFERENCES Players(player_id)
);

-- For "spares, strikes, etc" and "Go frame by frame" (Phase 2)
-- This table stores the detailed frame-by-frame data for a single game.
-- A single 'Series' row (3 games) would link to 30 'Frames' rows (10 per game).
CREATE TABLE Frames (
    frame_id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id INTEGER NOT NULL,
    game_number INTEGER NOT NULL CHECK (game_number IN (1, 2, 3)),
    frame_number INTEGER NOT NULL CHECK (frame_number >= 1 AND frame_number <= 10),
    ball1_pins INTEGER,
    ball2_pins INTEGER,
    ball3_pins INTEGER, -- Only for 10th frame
    -- These can be calculated from the ball pins
    is_strike BOOLEAN DEFAULT false,
    is_spare BOOLEAN DEFAULT false,
    FOREIGN KEY (series_id) REFERENCES Series(series_id)
);

-- A simple table for user accounts (e.g., coach)
-- This supports "Player profiles viewed only by PHHS" by requiring authentication
CREATE TABLE Users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_coach BOOLEAN DEFAULT true
);
