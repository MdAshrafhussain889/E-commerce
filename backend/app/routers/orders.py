import uuid
from decimal import Decimal

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import joinedload

from app.core.deps import DbSession, get_current_admin, get_current_user, get_session_id
from app.models.models import CartItem, Inventory, Order, OrderItem, OrderStatus, Product, User
from app.schemas.schemas import OrderCreate, OrderItemResponse, OrderResponse, OrderStatusUpdate

router = APIRouter(prefix="/orders", tags=["orders"])


def _order_to_response(order: Order) -> OrderResponse:
    items = []
    for item in order.items:
        items.append(
            OrderItemResponse(
                id=item.id,
                product_id=item.product_id,
                quantity=item.quantity,
                price_at_purchase=item.price_at_purchase,
                product_name=item.product.name if item.product else None,
            )
        )
    return OrderResponse(
        id=order.id,
        user_id=order.user_id,
        status=order.status,
        total_amount=order.total_amount,
        payment_method=order.payment_method,
        delivery_address=order.delivery_address,
        created_at=order.created_at,
        items=items,
    )


def _reserve_inventory(db, product: Product, quantity: int):
    inventory = db.query(Inventory).filter(Inventory.product_id == product.id).with_for_update().first()
    if inventory is None or inventory.quantity_available < quantity:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Insufficient stock for {product.name}")
    inventory.quantity_available -= quantity
    inventory.quantity_reserved += quantity


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    db: DbSession,
    current_user: Annotated[User, Depends(get_current_user)],
    session_id: Annotated[str | None, Depends(get_session_id)],
):
    line_items: list[tuple[Product, int]] = []

    if payload.use_cart:
        cart_query = db.query(CartItem).filter(CartItem.user_id == current_user.id)
        if not cart_query.count():
            cart_query = db.query(CartItem).filter(CartItem.session_id == session_id) if session_id else cart_query
        cart_items = cart_query.options(joinedload(CartItem.product).joinedload(Product.inventory)).all()
        if not cart_items:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cart is empty")
        for cart_item in cart_items:
            line_items.append((cart_item.product, cart_item.quantity))
    else:
        if not payload.items:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide items or set use_cart=true")
        for item in payload.items:
            product = (
                db.query(Product)
                .options(joinedload(Product.inventory))
                .filter(Product.id == item.product_id, Product.is_active.is_(True))
                .first()
            )
            if product is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product {item.product_id} not found")
            line_items.append((product, item.quantity))

    total = Decimal("0")
    for product, quantity in line_items:
        _reserve_inventory(db, product, quantity)
        total += Decimal(str(product.price)) * quantity

    order = Order(
        user_id=current_user.id,
        status=OrderStatus.pending,
        total_amount=total,
        payment_method=payload.payment_method,
        delivery_address=payload.delivery_address.model_dump(),
    )
    db.add(order)
    db.flush()

    for product, quantity in line_items:
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                quantity=quantity,
                price_at_purchase=product.price,
            )
        )

    if payload.use_cart:
        db.query(CartItem).filter(CartItem.user_id == current_user.id).delete()
        if session_id:
            db.query(CartItem).filter(CartItem.session_id == session_id).delete()

    db.commit()
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order.id)
        .one()
    )
    return _order_to_response(order)


@router.get("", response_model=list[OrderResponse])
def list_my_orders(db: DbSession, current_user: Annotated[User, Depends(get_current_user)]):
    orders = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.user_id == current_user.id)
        .order_by(Order.created_at.desc())
        .all()
    )
    return [_order_to_response(order) for order in orders]


@router.get("/admin/all", response_model=list[OrderResponse])
def list_all_orders(db: DbSession, _: Annotated[User, Depends(get_current_admin)]):
    orders = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .order_by(Order.created_at.desc())
        .all()
    )
    return [_order_to_response(order) for order in orders]


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: uuid.UUID,
    db: DbSession,
    current_user: Annotated[User, Depends(get_current_user)],
):
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order_id)
        .first()
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if order.user_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to view this order")
    return _order_to_response(order)


@router.put("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: uuid.UUID,
    payload: OrderStatusUpdate,
    db: DbSession,
    _: Annotated[User, Depends(get_current_admin)],
):
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order_id)
        .first()
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    order.status = payload.status
    db.commit()
    db.refresh(order)
    return _order_to_response(order)
