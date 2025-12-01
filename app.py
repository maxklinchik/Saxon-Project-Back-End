# This is a Python backend API using the Flask framework.
# It provides endpoints (URLs) for your frontend to fetch and send data
# to the database defined in 'database_schema.sql'.
#
# To run this:
# 1. Install Flask: pip install Flask
# 2. Create the database: sqlite3 bowling.db < database_schema.sql
# 3. Run the app: python app.py
#
# Your frontend will then make requests to http://127.0.0.1:5000/api/...

import sqlite3
from flask import Flask, jsonify, request
# We'll use Flask-CORS to allow your frontend to talk to this API
from flask_cors import CORS

app = Flask(__name__)
# This allows your frontend (running on a different domain) to access this API
CORS(app)

DATABASE_NAME = 'bowling.db'

def get_db_connection():
    """Helper function to connect to the database."""
    conn = sqlite3.connect(DATABASE_NAME)
    conn.row_factory = sqlite3.Row  # This lets us access columns by name
    return conn

# --- API Endpoints ---

@app.route('/api/teams/<string:gender>', methods=['GET'])
def get_team_by_gender(gender):
    """
    Gets all players for a specific gender ('Male' or 'Female').
    This powers the "Separate PAGE for boys and girls team"
    """
    conn = get_db_connection()
    players = conn.execute('''
        SELECT p.* FROM Players p
        JOIN Teams t ON p.team_id = t.team_id
        WHERE t.gender = ? AND p.is_active = true
    ''', (gender,)).fetchall()
    conn.close()
    return jsonify([dict(row) for row in players])

@app.route('/api/series', methods=['POST'])
def add_series():
    """
    This is the main endpoint for "type in three scores".
    The frontend sends a JSON object with player_id, match_id, and the 3 scores.
    The API calculates total_wood and average, saves it, and returns the result.
    """
    data = request.get_json()

    try:
        g1 = int(data['game1_score'])
        g2 = int(data['game2_score'])
        g3 = int(data['game3_score'])
        player_id = int(data['player_id'])
        match_id = int(data['match_id'])

        # "average, and total wood"
        total_wood = g1 + g2 + g3
        series_average = round(total_wood / 3.0, 2)

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO Series (player_id, match_id, game1_score, game2_score, game3_score, total_wood, series_average)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (player_id, match_id, g1, g2, g3, total_wood, series_average))
        conn.commit()
        series_id = cursor.lastrowid
        conn.close()

        # "get back the rest of the data needed"
        return jsonify({
            'series_id': series_id,
            'player_id': player_id,
            'total_wood': total_wood,
            'series_average': series_average
        }), 201 # 201 = Created

    except Exception as e:
        return jsonify({'error': str(e)}), 400 # 400 = Bad Request

@app.route('/api/player_stats/<int:player_id>/location_averages', methods=['GET'])
def get_location_averages(player_id):
    """
    "Quickly view averages from different locations"
    Calculates a player's series average at each location they've played.
    """
    conn = get_db_connection()
    averages = conn.execute('''
        SELECT
            l.location_name,
            ROUND(AVG(s.series_average), 2) as average_at_location,
            COUNT(s.series_id) as series_played
        FROM Series s
        JOIN Matches m ON s.match_id = m.match_id
        JOIN Locations l ON m.location_id = l.location_id
        WHERE s.player_id = ?
        GROUP BY l.location_name
    ''', (player_id,)).fetchall()
    conn.close()
    return jsonify([dict(row) for row in averages])

@app.route('/api/player_stats/<int:player_id>/game_averages', methods=['GET'])
def get_game_averages(player_id):
    """
    "Average out the games (be able to view game 1, game 2, game 3 avg)"
    Calculates a player's average for each of the three game slots.
    """
    conn = get_db_connection()
    # We use UNION ALL to get all three averages in one query
    averages = conn.execute('''
        SELECT 'Game 1' as game_number, ROUND(AVG(game1_score), 2) as average_score FROM Series WHERE player_id = ?
        UNION ALL
        SELECT 'Game 2' as game_number, ROUND(AVG(game2_score), 2) as average_score FROM Series WHERE player_id = ?
        UNION ALL
        SELECT 'Game 3' as game_number, ROUND(AVG(game3_score), 2) as average_score FROM Series WHERE player_id = ?
    ''', (player_id, player_id, player_id)).fetchall()
    conn.close()
    return jsonify([dict(row) for row in averages])

@app.route('/api/substitution', methods=['POST'])
def add_substitution():
    """
    Logs a substitution for a specific game in a series.
    "keep track of WHO gets subbed in"
    """
    data = request.get_json()
    try:
        series_id = int(data['series_id']) # The series of the *original* player
        sub_player_id = int(data['sub_player_id'])
        game_number = int(data['game_number'])

        conn = get_db_connection()
        conn.execute('''
            INSERT INTO Substitutions (series_id, sub_player_id, game_number)
            VALUES (?, ?, ?)
        ''', (series_id, sub_player_id, game_number))
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'substitution logged'}), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 400

# --- Other Helper Endpoints You'll Need ---

@app.route('/api/players', methods=['POST'])
def add_player():
    """Adds a new player to the database."""
    data = request.get_json()
    try:
        conn = get_db_connection()
        conn.execute('''
            INSERT INTO Players (team_id, first_name, last_name, graduation_year, is_active)
            VALUES (?, ?, ?, ?, ?)
        ''', (data['team_id'], data['first_name'], data['last_name'], data['graduation_year'], data.get('is_active', True)))
        conn.commit()
        conn.close()
        return jsonify({'status': 'player created'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/matches', methods=['GET'])
def get_matches():
    """Gets all matches for a given season to populate a dropdown."""
    # You would probably filter this by season_id
    season_id = request.args.get('season_id')
    conn = get_db_connection()
    query = '''
        SELECT m.match_id, m.match_date, m.opponent_name, l.location_name
        FROM Matches m
        JOIN Locations l ON m.location_id = l.location_id
    '''
    params = []
    if season_id:
        query += " WHERE m.season_id = ?"
        params.append(season_id)
    
    query += " ORDER BY m.match_date DESC"
    
    matches = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(row) for row in matches])

if __name__ == '__main__':
    # This will run the web server on http://127.0.0.1:5000
    # The 'debug=True' means it will automatically reload if you change the code.
    app.run(debug=True)