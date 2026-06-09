import uuid
from decimal import Decimal

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import joinedload

from app.core.deps import DbSession, get_current_user, get_current_user_optional, get_session_id
from app.models.models import CartItem, Inventory, Product, User
from app.schemas.schemas import CartItemCreate, CartItemResponse, CartItemUpdate, CartResponse, MessageResponse

router = APIRouter(prefix="/cart", tags=["cart"])


def _resolve_cart_query(db, user: User | None, session_id: str | None):
    if user:
        return db.query(CartItem).filter(CartItem.user_id == user.id)
    if session_id:
        return db.query(CartItem).filter(CartItem.session_id == session_id)
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Provide X-Session-Id header or authenticate to use the cart",
    )


def _build_cart_response(items: list[CartItem]) -> CartResponse:
    response_items: list[CartItemResponse] = []
    total = Decimal("0")
    count = 0
    for item in items:
        line_total = Decimal(str(item.product.price)) * item.quantity
        total += line_total
        count += item.quantity
        response_items.append(
            CartItemResponse(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product.name,
                product_price=item.product.price,
                quantity=item.quantity,
                line_total=line_total,
            )
        )
    return CartResponse(items=response_items, total_amount=total, item_count=count)


@router.get("", response_model=CartResponse)
def get_cart(
    db: DbSession,
    session_id: Annotated[str | None, Depends(get_session_id)],
    current_user: Annotated[User | None, Depends(get_current_user_optional)],
):
    query = _resolve_cart_query(db, current_user, session_id)
    items = query.options(joinedload(CartItem.product)).all()
    return _build_cart_response(items)


@router.post("/items", response_model=CartResponse, status_code=status.HTTP_201_CREATED)
def add_cart_item(
    payload: CartItemCreate,
    db: DbSession,
    session_id: Annotated[str | None, Depends(get_session_id)],
    current_user: Annotated[User | None, Depends(get_current_user_optional)],
):
    product = (
        db.query(Product)
        .options(joinedload(Product.inventory))
        .filter(Product.id == payload.product_id, Product.is_active.is_(True))
        .first()
    )
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    if product.inventory is None or product.inventory.quantity_available < payload.quantity:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient stock")

    query = _resolve_cart_query(db, current_user, session_id)
    existing = query.filter(CartItem.product_id == payload.product_id).first()
    if existing:
        new_qty = existing.quantity + payload.quantity
        if product.inventory.quantity_available < new_qty:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient stock")
        existing.quantity = new_qty
    else:
        db.add(
            CartItem(
                user_id=current_user.id if current_user else None,
                session_id=session_id if not current_user else None,
                product_id=payload.product_id,
                quantity=payload.quantity,
            )
        )
    db.commit()
    items = query.options(joinedload(CartItem.product)).all()
    return _build_cart_response(items)


@router.put("/items/{item_id}", response_model=CartResponse)
def update_cart_item(
    item_id: uuid.UUID,
    payload: CartItemUpdate,
    db: DbSession,
    session_id: Annotated[str | None, Depends(get_session_id)],
    current_user: Annotated[User | None, Depends(get_current_user_optional)],
):
    query = _resolve_cart_query(db, current_user, session_id)
    item = query.options(joinedload(CartItem.product).joinedload(Product.inventory)).filter(CartItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart item not found")
    if item.product.inventory.quantity_available < payload.quantity:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient stock")
    item.quantity = payload.quantity
    db.commit()
    items = query.options(joinedload(CartItem.product)).all()
    return _build_cart_response(items)


@router.delete("/items/{item_id}", response_model=CartResponse)
def remove_cart_item(
    item_id: uuid.UUID,
    db: DbSession,
    session_id: Annotated[str | None, Depends(get_session_id)],
    current_user: Annotated[User | None, Depends(get_current_user_optional)],
):
    query = _resolve_cart_query(db, current_user, session_id)
    item = query.filter(CartItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart item not found")
    db.delete(item)
    db.commit()
    items = query.options(joinedload(CartItem.product)).all()
    return _build_cart_response(items)


@router.post("/clear", response_model=MessageResponse)
def clear_cart(
    db: DbSession,
    session_id: Annotated[str | None, Depends(get_session_id)],
    current_user: Annotated[User | None, Depends(get_current_user_optional)],
):
    query = _resolve_cart_query(db, current_user, session_id)
    query.delete()
    db.commit()
    return MessageResponse(message="Cart cleared")
