# app.py
#
# Simple bowling backend using Flask + PostgreSQL
# Endpoints:
#   GET  /teams        -> list all teams
#   POST /teams        -> create a new team  (JSON: { "name": "Team Name" })
#   GET  /players      -> list all players (with team info)
#   POST /players      -> create a new player
#                         JSON: { "name": "Alice", "team_id": 1, "average": 180.5 }

from flask import Flask, request, jsonify
import psycopg2
from decimal import Decimal

app = Flask(__name__)

# ==========================
# Database configuration
# ==========================
DB_NAME = "your_db_name"      # <-- change this
DB_USER = "your_db_user"      # <-- change this
DB_PASSWORD = "your_db_pass"  # <-- change this
DB_HOST = "localhost"         # usually "localhost"
DB_PORT = 5432                # default Postgres port


def get_conn():
    """Create and return a new database connection."""
    return psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT,
    )


# ==========================
# Helper functions
# ==========================

def decimal_to_float(value):
    """Convert Decimal values from PostgreSQL to float for JSON."""
    if isinstance(value, Decimal):
        return float(value)
    return value


# ==========================
# Routes
# ==========================

@app.route("/health", methods=["GET"])
def health():
    """Simple health check."""
    return jsonify({"status": "ok"})


# ---------- TEAMS ----------

@app.route("/teams", methods=["GET"])
def get_teams():
    """Return a list of all teams."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, name FROM teams ORDER BY id;")
        rows = cur.fetchall()
        cur.close()

        teams = [{"id": r[0], "name": r[1]} for r in rows]
        return jsonify(teams)

    except Exception as e:
        print("Error in GET /teams:", e)
        return jsonify({"error": "Internal server error"}), 500

    finally:
        if conn is not None:
            conn.close()


@app.route("/teams", methods=["POST"])
def create_team():
    """Create a new team. Expects JSON: { "name": "Team Name" }"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    name = data.get("name")

    if not name:
        return jsonify({"error": "name is required"}), 400

    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO teams (name) VALUES (%s) RETURNING id;",
            (name,),
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()

        return jsonify({"id": new_id, "name": name}), 201

    except Exception as e:
        print("Error in POST /teams:", e)
        return jsonify({"error": "Internal server error"}), 500

    finally:
        if conn is not None:
            conn.close()


# ---------- PLAYERS ----------

@app.route("/players", methods=["GET"])
def get_players():
    """
    Return a list of all players, with their team info if they have a team.
    """
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT p.id,
                   p.name,
                   p.average,
                   t.id   AS team_id,
                   t.name AS team_name
            FROM players p
            LEFT JOIN teams t ON p.team_id = t.id
            ORDER BY p.id;
            """
        )
        rows = cur.fetchall()
        cur.close()

        players = []
        for r in rows:
            player_id = r[0]
            name = r[1]
            average = decimal_to_float(r[2])
            team_id = r[3]
            team_name = r[4]

            player = {
                "id": player_id,
                "name": name,
                "average": average,
                "team": None,
            }

            if team_id is not None:
                player["team"] = {
                    "id": team_id,
                    "name": team_name,
                }

            players.append(player)

        return jsonify(players)

    except Exception as e:
        print("Error in GET /players:", e)
        return jsonify({"error": "Internal server error"}), 500

    finally:
        if conn is not None:
            conn.close()


@app.route("/players", methods=["POST"])
def create_player():
    """
    Create a new player.
    Expects JSON, for example:
      {
        "name": "Alice",
        "team_id": 1,       # optional
        "average": 180.5    # optional
      }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    name = data.get("name")
    team_id = data.get("team_id")      # can be None
    average = data.get("average")      # can be None

    if not name:
        return jsonify({"error": "name is required"}), 400

    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO players (name, team_id, average)
            VALUES (%s, %s, %s)
            RETURNING id;
            """,
            (name, team_id, average),
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()

        return jsonify(
            {
                "id": new_id,
                "name": name,
                "team_id": team_id,
                "average": average,
            }
        ), 201

    except Exception as e:
        print("Error in POST /players:", e)
        return jsonify({"error": "Internal server error"}), 500

    finally:
        if conn is not None:
            conn.close()


# ==========================
# Main entry point
# ==========================
if __name__ == "__main__":
    # debug=True is helpful while developing
    app.run(host="0.0.0.0", port=5000, debug=True)