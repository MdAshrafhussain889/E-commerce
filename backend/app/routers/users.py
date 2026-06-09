import uuid

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import DbSession, get_current_user
from app.models.models import Address, User
from app.schemas.schemas import AddressCreate, AddressResponse, UserProfileUpdate, UserResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/profile", response_model=UserResponse)
def get_profile(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user


@router.put("/profile", response_model=UserResponse)
def update_profile(
    payload: UserProfileUpdate,
    db: DbSession,
    current_user: Annotated[User, Depends(get_current_user)],
):
    if payload.name is not None:
        current_user.name = payload.name
    if payload.phone is not None:
        current_user.phone = payload.phone
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/addresses", response_model=AddressResponse, status_code=status.HTTP_201_CREATED)
def add_address(
    payload: AddressCreate,
    db: DbSession,
    current_user: Annotated[User, Depends(get_current_user)],
):
    if payload.is_default:
        db.query(Address).filter(Address.user_id == current_user.id).update({"is_default": False})

    address = Address(
        user_id=current_user.id,
        street=payload.street,
        city=payload.city,
        state=payload.state,
        postal_code=payload.postal_code,
        is_default=payload.is_default,
    )
    db.add(address)
    db.commit()
    db.refresh(address)
    return address


@router.get("/addresses", response_model=list[AddressResponse])
def list_addresses(db: DbSession, current_user: Annotated[User, Depends(get_current_user)]):
    return db.query(Address).filter(Address.user_id == current_user.id).order_by(Address.created_at.desc()).all()
