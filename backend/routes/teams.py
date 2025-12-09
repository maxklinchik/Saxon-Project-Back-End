from flask import Blueprint, request, jsonify
from .utils import load_json, save_json
import os

TEAMS_DATA_FILE = os.path.join("/Users/mklinchik27/strike-master/backend/data/", "teams.json")
teams = load_json(TEAMS_DATA_FILE, [])

teams_bp = Blueprint("teams", __name__)

# ------------------------
# GET all teams
# ------------------------
@teams_bp.route("/teams", methods=["GET"])
def get_teams():
    return jsonify(teams)

# ------------------------
# GET single team
# ------------------------
@teams_bp.route("/teams/<string:name>", methods=["GET"])
def get_team(name):
    for t in teams:
        if t["name"].lower() == name.lower():
            return jsonify(t)
    return jsonify({"error": "Team not found"}), 404

# ------------------------
# ADD a team
# ------------------------
@teams_bp.route("/teams", methods=["POST"])
def add_team():
    data = request.get_json()

    new_team = {
        "name": data["name"],
        "players": data.get("players", [])
    }

    teams.append(new_team)
    save_json(TEAMS_DATA_FILE, teams)

    return jsonify({"message": "Team added"}), 201

# ------------------------
# DELETE a team
# ------------------------
@teams_bp.route("/teams/<string:name>", methods=["DELETE"])
def delete_team(name):
    global teams

    teams = [t for t in teams if t["name"] != name]
    save_json(TEAMS_DATA_FILE, teams)

    return jsonify({"message": f"Team {name} removed"})
