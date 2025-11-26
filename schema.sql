-- ==========================
-- Bowling Database Schema
-- ==========================

-- Drop tables if they already exist (optional, for resetting)
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS teams;

-- ==========================
-- Teams table
-- ==========================
CREATE TABLE teams (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

-- ==========================
-- Players table
-- ==========================
CREATE TABLE players (
    id      SERIAL PRIMARY KEY,
    name    TEXT NOT NULL,
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    average NUMERIC(5,2)  -- bowling average, optional
);