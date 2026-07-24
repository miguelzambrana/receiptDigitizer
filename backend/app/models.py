from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, Numeric, Boolean, DateTime, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Store(Base):
    __tablename__ = "stores"
    id: Mapped[int] = mapped_column(primary_key=True)
    chain_name: Mapped[str] = mapped_column(String, index=True)
    address: Mapped[str | None] = mapped_column(String, nullable=True)
    city: Mapped[str | None] = mapped_column(String, nullable=True)
    country: Mapped[str | None] = mapped_column(String, nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    normalized_name: Mapped[str] = mapped_column(String, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String)
    brand: Mapped[str | None] = mapped_column(String, nullable=True)
    size: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Receipt(Base):
    __tablename__ = "receipts"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    store_id: Mapped[int | None] = mapped_column(ForeignKey("stores.id"), nullable=True)
    purchased_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    currency: Mapped[str | None] = mapped_column(String, nullable=True)
    subtotal: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    tax_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    total: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    image_path: Mapped[str] = mapped_column(String)
    source_engine: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="processing", index=True)
    raw_extraction: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    items: Mapped[list["ReceiptItem"]] = relationship(cascade="all, delete-orphan")

class ReceiptItem(Base):
    __tablename__ = "receipt_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    receipt_id: Mapped[int] = mapped_column(ForeignKey("receipts.id"), index=True)
    line_no: Mapped[int] = mapped_column(Integer)
    raw_name: Mapped[str] = mapped_column(String)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Numeric(10, 3), nullable=True)
    unit_price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    total_price: Mapped[float] = mapped_column(Numeric(10, 2))
    is_discount: Mapped[bool] = mapped_column(Boolean, default=False)
    tax_class: Mapped[str | None] = mapped_column(String, nullable=True)

class PriceObservation(Base):
    __tablename__ = "price_observations"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    store_id: Mapped[int | None] = mapped_column(ForeignKey("stores.id"), nullable=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    receipt_item_id: Mapped[int] = mapped_column(ForeignKey("receipt_items.id"))
    price: Mapped[float] = mapped_column(Numeric(10, 2))
    currency: Mapped[str | None] = mapped_column(String, nullable=True)
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
