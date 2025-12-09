from flask import Flask
from flask_cors import CORS

# Import blueprint routes
from backend.routes.players import players_bp
from backend.routes.teams import teams_bp

from backend import create_app

app = create_app()

# app = Flask(__name__)
# CORS(app)
#
# # Register blueprints
# app.register_blueprint(players_bp, url_prefix="/api")
# app.register_blueprint(teams_bp, url_prefix="/teams")

if __name__ == "__main__":
    app.run(debug=True)
