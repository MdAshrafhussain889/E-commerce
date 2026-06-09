import math
import uuid
from decimal import Decimal

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import DbSession, get_current_admin, get_current_user
from app.core.security import create_access_token, create_refresh_token, hash_password, verify_password
from app.models.models import Category, Inventory, Product, User, UserRole
from app.schemas.schemas import (
    CategoryResponse,
    PaginatedProducts,
    ProductCreate,
    ProductResponse,
    ProductUpdate,
    InventoryUpdate,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: DbSession):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        name=payload.name,
        phone=payload.phone,
        role=UserRole.user,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: DbSession):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


products_router = APIRouter(prefix="/products", tags=["products"])


def _product_to_response(product: Product) -> ProductResponse:
    stock = 0
    if product.inventory:
        stock = product.inventory.quantity_available
    return ProductResponse(
        id=product.id,
        name=product.name,
        description=product.description,
        price=product.price,
        category_id=product.category_id,
        image_url=product.image_url,
        is_active=product.is_active,
        stock_available=stock,
        category=CategoryResponse.model_validate(product.category) if product.category else None,
    )


def _get_product_for_admin(product_id: uuid.UUID, db: Session) -> Product:
    product = (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.inventory))
        .filter(Product.id == product_id)
        .first()
    )
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


@products_router.get("", response_model=PaginatedProducts)
def list_products(
    db: DbSession,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    category_id: uuid.UUID | None = None,
    min_price: Decimal | None = None,
    max_price: Decimal | None = None,
    in_stock: bool | None = None,
):
    query = (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.inventory))
        .filter(Product.is_active.is_(True))
    )

    if category_id:
        query = query.filter(Product.category_id == category_id)
    if min_price is not None:
        query = query.filter(Product.price >= min_price)
    if max_price is not None:
        query = query.filter(Product.price <= max_price)
    if in_stock:
        query = query.join(Inventory).filter(Inventory.quantity_available > 0)

    total = query.count()
    products = query.order_by(Product.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return PaginatedProducts(
        items=[_product_to_response(product) for product in products],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


@products_router.get("/search", response_model=PaginatedProducts)
def search_products(
    db: DbSession,
    q: str = Query(min_length=1),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    pattern = f"%{q.strip()}%"
    query = (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.inventory))
        .filter(Product.is_active.is_(True))
        .filter(or_(Product.name.ilike(pattern), Product.description.ilike(pattern)))
    )
    total = query.count()
    products = query.order_by(Product.name).offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedProducts(
        items=[_product_to_response(product) for product in products],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


@products_router.get("/admin/all", response_model=list[ProductResponse])
def list_products_for_admin(
    db: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
):
    products = (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.inventory))
        .order_by(Product.created_at.desc())
        .all()
    )
    return [_product_to_response(product) for product in products]


@products_router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: uuid.UUID, db: DbSession):
    product = (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.inventory))
        .filter(Product.id == product_id, Product.is_active.is_(True))
        .first()
    )
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return _product_to_response(product)


@products_router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    db: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
):
    if payload.category_id:
        category = db.get(Category, payload.category_id)
        if category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    product = Product(
        name=payload.name,
        description=payload.description,
        price=payload.price,
        category_id=payload.category_id,
        image_url=payload.image_url,
    )
    db.add(product)
    db.flush()
    db.add(Inventory(product_id=product.id, quantity_available=payload.stock))
    db.commit()
    db.refresh(product)
    product = (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.inventory))
        .filter(Product.id == product.id)
        .one()
    )
    return _product_to_response(product)


@products_router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    db: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
):
    product = _get_product_for_admin(product_id, db)

    if payload.category_id:
        category = db.get(Category, payload.category_id)
        if category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(product, field, value)

    db.commit()
    product = _get_product_for_admin(product_id, db)
    return _product_to_response(product)


@products_router.put("/{product_id}/inventory", response_model=ProductResponse)
def update_inventory(
    product_id: uuid.UUID,
    payload: InventoryUpdate,
    db: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
):
    product = _get_product_for_admin(product_id, db)
    if product.inventory is None:
        product.inventory = Inventory(product_id=product.id)

    product.inventory.quantity_available = payload.stock
    db.commit()
    product = _get_product_for_admin(product_id, db)
    return _product_to_response(product)


@products_router.delete("/{product_id}", response_model=ProductResponse)
def deactivate_product(
    product_id: uuid.UUID,
    db: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
):
    product = _get_product_for_admin(product_id, db)
    product.is_active = False
    db.commit()
    product = _get_product_for_admin(product_id, db)
    return _product_to_response(product)


categories_router = APIRouter(prefix="/categories", tags=["categories"])


@categories_router.get("", response_model=list[CategoryResponse])
def list_categories(db: DbSession):
    return db.query(Category).order_by(Category.name).all()
