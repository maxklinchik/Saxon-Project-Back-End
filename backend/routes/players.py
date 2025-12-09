from flask import Blueprint, request, jsonify
from .utils import load_json, save_json
import os

# DATA_FOLDER = os.path.join(os.path.dirname(__file__), "data")
PLAYERS_DATA_FILE = os.path.join("/Users/mklinchik27/strike-master/backend/data/", "players.json")

players = load_json(PLAYERS_DATA_FILE, [])

players_bp = Blueprint("players", __name__)

# ------------------------
# GET all players
# ------------------------
@players_bp.route("/players", methods=["GET"])
def get_players():
    return jsonify(players)

# ------------------------
# GET single player by name
# ------------------------
@players_bp.route("/players/<string:name>", methods=["GET"])
def get_player(name):
    for p in players:
        if p["name"].lower() == name.lower():
            p.setdefault("spot", 1)
            p.setdefault("seasonAverage", 0)
            p.setdefault("totalStrikes", 0)
            p.setdefault("totalSpares", 0)
            p.setdefault("gameAverages", {"1":0, "2":0, "3":0})
            return jsonify(p)
    return jsonify({"error": "Player not found"}), 404

# ------------------------
# ADD player
# ------------------------
@players_bp.route("/players", methods=["POST"])
def add_player():
    data = request.get_json()

    new_player = {
        "name": data["name"],
        "spot": data.get("spot", 1),
        "seasonAverage": 0,
        "totalStrikes": 0,
        "totalSpares": 0,
        "gameAverages": {"1":0,"2":0,"3":0}
    }

    players.append(new_player)
    save_json(PLAYERS_DATA_FILE, players)

    return jsonify({"message": "Player added"}), 201

# ------------------------
# DELETE player
# ------------------------
@players_bp.route("/players/<string:name>", methods=["OPTIONS", "DELETE"])
def delete_player(name):
    global players

    if request.method == "OPTIONS":
        return jsonify({"message": "OK"}), 200

    players = [p for p in players if p["name"] != name]
    save_json(PLAYERS_DATA_FILE, players)

    return jsonify({"message": f"Player {name} removed"})
