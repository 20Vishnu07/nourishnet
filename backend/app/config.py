from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    database_url: str = "sqlite:///./nourishnet.db"
    firebase_credentials_path: str = "./firebase-credentials.json"
    cors_origins: List[str] = ["http://localhost:5173"]
    secret_key: str = "change-me-to-a-random-secret"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
