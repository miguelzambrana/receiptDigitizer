from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./data/receipts.db"
    ollama_url: str = "http://localhost:11434"
    reader_engine: str = "minicpm"
    reader_model: str = "minicpm-v"
    # Max output tokens the VLM may generate for one receipt. Long receipts
    # (many line items) produce large JSON; too small a budget truncates it
    # mid-object and JSON parsing fails. num_ctx must hold vision+prompt+output.
    reader_num_predict: int = 4096
    reader_num_ctx: int = 8192
    storage_dir: str = "./data/images"
    jwt_secret: str = "dev-secret-change-me"

settings = Settings()
