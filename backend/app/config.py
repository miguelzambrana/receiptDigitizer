from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./data/receipts.db"
    ollama_url: str = "http://localhost:11434"
    reader_engine: str = "minicpm"
    reader_model: str = "minicpm-v"
    storage_dir: str = "./data/images"
    jwt_secret: str = "dev-secret-change-me"

settings = Settings()
