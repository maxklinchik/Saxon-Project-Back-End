from flask import Flask
from flask_cors import CORS
from .routes.players import players_bp
from .routes.teams import teams_bp

def create_app():
    app = Flask(__name__)
    CORS(app)

    app.register_blueprint(players_bp, url_prefix="/api")
    app.register_blueprint(teams_bp, url_prefix="/api")

    return app
